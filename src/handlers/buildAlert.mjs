import { getSignalsForRun } from "../lib/aws/ddb.mjs";
import { invokeBedrockJson } from "../lib/aws/bedrock.mjs";
import { publishSns } from "../lib/aws/sns.mjs";
import { formatDailyFallback } from "../lib/alerts/formatDaily.mjs";

export async function handler(event) {
  const runDate = (event.runDate ?? new Date().toISOString()).slice(0, 10);
  const modelId = process.env.BEDROCK_MODEL_ID;

  const tickers = event.tickers ?? ["AAPL","MSFT","AMZN","GOOGL","NVDA","META","TSLA","BRK.B","JPM","XOM"];
  const signals = await getSignalsForRun(tickers, runDate);

  const processed = signals.filter((s) => !s.missing && s.skipped !== true);
  const skipped = signals.filter((s) => !s.missing && s.skipped === true);
  const missing = signals.filter((s) => s.missing);

  const summaryInput = {
    runDate,
    counts: {
      processed: processed.length,
      skipped: skipped.length,
      missing: missing.length
    },
    processed: processed.map(pickForSummarizer),
    skipped: skipped.map((s) => ({
      ticker: s.ticker,
      docRef: s.docRef ?? s.extracted?.doc ?? null
    })),
    missing: missing.map((s) => s.ticker)
  };

  const jsonSchemaHint = `
{
  "date":"YYYY-MM-DD",
  "subject":"string",
  "topPositive":[{"ticker":"string","why":"string"}],
  "topNegative":[{"ticker":"string","why":"string"}],
  "guidanceChanges":[{"ticker":"string","what":"string"}],
  "watchlist":[{"ticker":"string","why":"string"}],
  "noNewFilings":["string"],
  "missing":["string"],
  "oneLiners":[{"ticker":"string","line":"string"}],
  "markdown":"string"
}`;

  let alert;
  try {
    // If nothing new processed, we can skip Bedrock summarization entirely.
    if (processed.length === 0) {
      alert = buildNoNewFilingsAlert({ runDate, skipped, missing });
    } else {
      alert = await invokeBedrockJson({
        modelId,
        jsonSchemaHint,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
`Create a concise daily stock forecast signal alert.

Rules:
- Only rank and discuss "processed" tickers (new filing processed today).
- Include "noNewFilings" tickers as a simple list.
- Do NOT claim guidance changes unless present in the processed extracted fields.
- Keep "why/what" short, factual, and based on the structured data.

Input JSON:
${JSON.stringify(summaryInput, null, 2)}`
              }
            ]
          }
        ]
      });
    }
  } catch (e) {
    alert = formatDailyFallback(runDate, signals, e?.message);
  }

  // Ensure these lists exist even if model omitted
  alert.noNewFilings ??= skipped.map((s) => s.ticker);
  alert.missing ??= missing.map((s) => s.ticker);

  const subject = alert.subject || `Daily Stock Forecast Signals — ${runDate}`;
  const message = alert.markdown || renderMarkdownFromAlert(alert, runDate);

  await publishSns({ subject, message });

  return { ok: true, runDate, counts: { processed: processed.length, skipped: skipped.length, missing: missing.length } };
}

function pickForSummarizer(s) {
  return {
    ticker: s.ticker,
    scores: s.scores ?? null,
    changeLog: s.changeLog ?? [],
    extracted: {
      guidance: s.extracted?.guidance ?? [],
      forwardDrivers: s.extracted?.forwardDrivers ?? [],
      notableRisks: s.extracted?.notableRisks ?? []
    },
    docRef: s.docRef ?? null
  };
}

function buildNoNewFilingsAlert({ runDate, skipped, missing }) {
  const noNew = skipped.map((s) => s.ticker);
  const miss = missing.map((s) => s.ticker);

  const markdown =
`# Daily Stock Forecast Signals — ${runDate}

## New filings processed
None today.

## No new filings (reused prior snapshot)
${noNew.length ? noNew.map((t) => `- ${t}`).join("\n") : "- (none)"}

## Missing signals (pipeline/data issue)
${miss.length ? miss.map((t) => `- ${t}`).join("\n") : "- (none)"}
`;

  return {
    date: runDate,
    subject: `Daily Stock Forecast Signals — ${runDate} (No new filings)`,
    topPositive: [],
    topNegative: [],
    guidanceChanges: [],
    watchlist: [],
    noNewFilings: noNew,
    missing: miss,
    oneLiners: [
      ...noNew.map((t) => ({ ticker: t, line: "No new filings; reused last snapshot." })),
      ...miss.map((t) => ({ ticker: t, line: "Missing signal for today (check logs)." }))
    ],
    markdown
  };
}

function renderMarkdownFromAlert(alert, runDate) {
  const list = (arr, fmt) => (arr?.length ? arr.map(fmt).join("\n") : "- (none)");
  const tickList = (arr) => (arr?.length ? arr.map((t) => `- ${t}`).join("\n") : "- (none)");

  return `# Daily Stock Forecast Signals — ${alert.date || runDate}

## Top positive shifts (new filings only)
${list(alert.topPositive, (x) => `- ${x.ticker}: ${x.why}`)}

## Top negative shifts (new filings only)
${list(alert.topNegative, (x) => `- ${x.ticker}: ${x.why}`)}

## Guidance changes (new filings only)
${list(alert.guidanceChanges, (x) => `- ${x.ticker}: ${x.what}`)}

## Watchlist
${list(alert.watchlist, (x) => `- ${x.ticker}: ${x.why}`)}

## No new filings
${tickList(alert.noNewFilings)}

## Missing signals
${tickList(alert.missing)}

## One-liners
${list(alert.oneLiners, (x) => `- ${x.ticker}: ${x.line}`)}
`;
}