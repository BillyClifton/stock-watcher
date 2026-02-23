import { readTickers } from "../lib/aws/s3.mjs"; // or local file read
import { getSignalsForRun } from "../lib/aws/ddb.mjs";
import { invokeBedrockJson } from "../lib/aws/bedrock.mjs";
import { publishSns } from "../lib/aws/sns.mjs";
import { formatDailyFallback } from "../lib/alerts/formatDaily.mjs";

export async function handler(event) {
  const runDate = (event.runDate ?? new Date().toISOString()).slice(0, 10);
  const modelId = process.env.BEDROCK_MODEL_ID;

  const tickers = event.tickers ?? ["AAPL","MSFT","AMZN","GOOGL","NVDA","META","TSLA","BRK.B","JPM","XOM"];
  const signals = await getSignalsForRun(tickers, runDate);

  // Bedrock: concise daily summary + ranking
  const jsonSchemaHint = `
{
  "date":"YYYY-MM-DD",
  "topPositive":[{"ticker":"string","why":"string"}],
  "topNegative":[{"ticker":"string","why":"string"}],
  "guidanceChanges":[{"ticker":"string","what":"string"}],
  "watchlist":[{"ticker":"string","why":"string"}],
  "oneLiners":[{"ticker":"string","line":"string"}],
  "subject":"string",
  "markdown":"string"
}`;

  let alert;
  try {
    alert = await invokeBedrockJson({
      modelId,
      jsonSchemaHint,
      messages: [{
        role: "user",
        content: [{ type: "text", text: JSON.stringify({ runDate, signals }, null, 2) }]
      }]
    });
  } catch (e) {
    // fallback formatter so alerts still send
    alert = formatDailyFallback(runDate, signals, e?.message);
  }

  await publishSns({
    subject: alert.subject || `Daily Stock Forecast Signals — ${runDate}`,
    message: alert.markdown || JSON.stringify(alert, null, 2)
  });

  return { ok: true, runDate };
}