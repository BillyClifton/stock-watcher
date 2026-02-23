import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sfn = new SFNClient({});

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadTickersFromFile() {
  const tickersPath = path.resolve(__dirname, "../config/tickers.json");
  const raw = fs.readFileSync(tickersPath, "utf8");
  const parsed = JSON.parse(raw);
  const tickers = parsed?.tickers;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error(`Invalid tickers.json: expected { "tickers": ["AAPL", ...] }`);
  }
  return tickers;
}

function parseTickersEnv() {
  const raw = process.env.TICKERS;
  if (!raw) return null;
  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tickers.length ? tickers : null;
}

function normalizeTickers(input) {
  const tickers = Array.isArray(input) ? input : null;
  if (!tickers || tickers.length === 0) return null;
  // keep as-is but trim
  return tickers.map((t) => String(t).trim()).filter(Boolean);
}

/**
 * Lambda handler
 *
 * Event examples:
 *  {}  -> use env TICKERS or config/tickers.json
 *  { "tickers": ["AAPL","MSFT",...]} -> use provided list
 *  { "tickersCsv": "AAPL,MSFT,NVDA" } -> parse CSV
 *  { "stateMachineArn": "arn:aws:states:..." } -> override env
 */
export async function handler(event = {}) {
  const stateMachineArn =
    event.stateMachineArn ||
    process.env.STATE_MACHINE_ARN ||
    process.env.DAILY_STATE_MACHINE_ARN;

  if (!stateMachineArn) {
    throw new Error(
      "Missing State Machine ARN. Set env STATE_MACHINE_ARN (or DAILY_STATE_MACHINE_ARN) or pass {stateMachineArn}."
    );
  }

  const fromEvent =
    normalizeTickers(event.tickers) ||
    normalizeTickers(
      typeof event.tickersCsv === "string"
        ? event.tickersCsv.split(",")
        : null
    );

  const tickers =
    fromEvent || parseTickersEnv() || loadTickersFromFile();

  // Optional: enforce 10 tickers max for MVP (adjust as desired)
  const capped = tickers.slice(0, 10);

  const runDate = new Date().toISOString().slice(0, 10);

  const input = {
    tickers: capped,
    runDate
  };

  const execName = `daily-${runDate}-${Date.now()}`;

  const res = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      name: execName,
      input: JSON.stringify(input)
    })
  );

  return {
    ok: true,
    runDate,
    tickers: capped,
    executionArn: res.executionArn
  };
}
