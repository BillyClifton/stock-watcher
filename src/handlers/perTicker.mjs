import { fetchLatestFiling } from "../lib/edgar/edgar.mjs";
import { htmlToText } from "../lib/parse/htmlToText.mjs";
import { chunkText } from "../lib/parse/chunker.mjs";
import { extractForward } from "../lib/analysis/extractForward.mjs";
import { buildDocSk, getDoc, putDocIfAbsent, markDocProcessed, putSignal, getLatestSignal } from "../lib/aws/ddb.mjs";
import { putObject } from "../lib/aws/s3.mjs";
import { scoreSignal, diffSignals } from "../lib/analysis/score.mjs";

export async function handler(event) {
  const ticker = event.ticker;
  const runDate = (event.runDate?.slice(0, 10)) ?? new Date().toISOString().slice(0, 10);
  const modelId = process.env.BEDROCK_MODEL_ID;

  // 1) Fetch latest filing (cheap compared to Bedrock)
  const filing = await fetchLatestFiling(ticker);

  // 2) Stable doc key
  const docSk = buildDocSk({
    form: filing.form,
    filingDate: filing.filingDate,
    accessionNumber: filing.accessionNumber
  });

  // 3) See if we already processed this doc with Bedrock
  const existingDoc = await getDoc(ticker, docSk);

  if (existingDoc?.processedWithBedrockAt) {
    // ✅ Skip Bedrock. Reuse latest signal (recommended).
    const prevSignal = await getLatestSignal(ticker);

    // If we have nothing to reuse, fall through to process normally.
    if (prevSignal?.extracted) {
      const scores = prevSignal.scores ?? scoreSignal({ extracted: prevSignal.extracted, changeLog: [] });

      await putSignal({
        ticker,
        runDate,
        extracted: prevSignal.extracted,
        changeLog: [],
        scores,
        skipped: true,
        skipReason: "no_new_filing",
        docRef: {
          form: filing.form,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber,
          primaryDocument: filing.primaryDocument,
          docUrl: filing.docUrl
        }
      });

      return { ticker, skipped: true, reason: "no_new_filing", docSk, scores };
    }
  }

  // 4) Not processed yet → store raw + text
  const text = htmlToText(filing.html);
  const chunks = chunkText(text);

  const s3RawKey = `raw/${ticker}/${filing.form}#${filing.filingDate}#${filing.accessionNumber}.html`;
  const s3TextKey = `text/${ticker}/${filing.form}#${filing.filingDate}#${filing.accessionNumber}.txt`;

  await putObject(s3RawKey, filing.html, "text/html");
  await putObject(s3TextKey, text, "text/plain");

  // Insert doc row if absent (idempotent)
  await putDocIfAbsent({
    ticker,
    docSk,
    item: {
      docType: filing.form,
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber,
      accessionNumberDashed: filing.accessionNumberDashed,
      primaryDocument: filing.primaryDocument,
      sourceUrl: filing.docUrl,
      s3RawKey,
      s3TextKey,
      createdAt: new Date().toISOString()
    }
  });

  // 5) Bedrock extraction
  const extracted = await extractForward({
    modelId,
    ticker,
    filingMeta: filing,
    chunks
  });

  // 6) Diff vs previous signal for this ticker
  const prevSignal = await getLatestSignal(ticker);
  const changeLog = prevSignal?.extracted ? diffSignals(prevSignal, extracted) : [];

  // 7) Score
  const scores = scoreSignal({ extracted, changeLog });

  // 8) Persist signal and mark processed
  await putSignal({
    ticker,
    runDate,
    extracted,
    changeLog,
    scores,
    skipped: false,
    docRef: {
      form: filing.form,
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber,
      primaryDocument: filing.primaryDocument,
      docUrl: filing.docUrl
    }
  });

  await markDocProcessed({ ticker, docSk });

  return { ticker, skipped: false, docSk, scores };
}