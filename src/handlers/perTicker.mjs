import { fetchLatestFilingsText } from "../lib/edgar/edgar.mjs";
import { htmlToText } from "../lib/parse/htmlToText.mjs";
import { chunkText } from "../lib/parse/chunker.mjs";
import { extractForward } from "../lib/analysis/extractForward.mjs";
import { putDoc, putSignal, getLatestSignal } from "../lib/aws/ddb.mjs";
import { putObject } from "../lib/aws/s3.mjs";
import { scoreSignal, diffSignals } from "../lib/analysis/score.mjs";

export async function handler(event) {
  const { ticker, runDate } = event;
  const modelId = process.env.BEDROCK_MODEL_ID;

  const filing = await fetchLatestFilingsText(ticker);
  const text = htmlToText(filing.html);
  const chunks = chunkText(text);

  const docId = `${filing.form}#${filing.filingDate}`;
  const s3RawKey = `raw/${ticker}/${docId}.html`;
  const s3TextKey = `text/${ticker}/${docId}.txt`;

  await putObject(s3RawKey, filing.html, "text/html");
  await putObject(s3TextKey, text, "text/plain");

  await putDoc({
    ticker,
    docId,
    docType: filing.form,
    filingDate: filing.filingDate,
    sourceUrl: filing.docUrl,
    s3RawKey,
    s3TextKey
  });

  const extracted = await extractForward({
    modelId,
    ticker,
    filingMeta: filing,
    chunks
  });

  const prev = await getLatestSignal(ticker);
  const changeLog = prev ? diffSignals(prev, extracted) : [];

  const scores = scoreSignal({ extracted, changeLog });

  const signal = {
    ticker,
    runDate: runDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    extracted,
    changeLog,
    scores
  };

  await putSignal(signal);

  return { ticker, docId, scores };
}