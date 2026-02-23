import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function handler(event) {
  const { tickers } = JSON.parse(
    readFileSync(join(__dirname, "../config/tickers.json"), "utf8")
  );
  const runDate = (event.runDate ?? new Date().toISOString()).slice(0, 10);
  return { tickers: { list: tickers }, runDate };
}
