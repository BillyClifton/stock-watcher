const SEC_UA =
  process.env.SEC_USER_AGENT || "stock-forecast-bot (you@example.com)";

export async function fetchLatestFilingMeta(ticker) {
  const cik = TICKER_TO_CIK[ticker];
  if (!cik) throw new Error(`Missing CIK for ${ticker}`);

  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const sub = await fetchJson(submissionsUrl);

  const recent = sub?.filings?.recent;
  if (!recent) throw new Error(`No filings.recent for ${ticker}`);

  // MVP: latest 10-Q/10-K. Later add 8-K.
  const idx = recent.form.findIndex((f) => f === "10-Q" || f === "10-K");
  if (idx < 0)
    throw new Error(`No 10-Q/10-K found in recent filings for ${ticker}`);

  const form = recent.form[idx];
  const filingDate = recent.filingDate[idx];
  const accessionNumberDashed = recent.accessionNumber[idx];
  const accessionNumber = accessionNumberDashed.replaceAll("-", "");
  const primaryDocument = recent.primaryDocument[idx];

  const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNumber}/${primaryDocument}`;

  return {
    ticker,
    cik,
    form,
    filingDate,
    accessionNumberDashed,
    accessionNumber,
    primaryDocument,
    docUrl,
  };
}

export async function downloadFilingHtml(docUrl) {
  return fetchText(docUrl);
}

export async function fetchLatestFiling(ticker) {
  const meta = await fetchLatestFilingMeta(ticker);
  const html = await downloadFilingHtml(meta.docUrl);
  return { ...meta, html };
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`SEC fetch failed ${r.status} ${url}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!r.ok) throw new Error(`SEC fetch failed ${r.status} ${url}`);
  return r.text();
}

const TICKER_TO_CIK = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  NVDA: "0001045810",
  META: "0001326801",
  TSLA: "0001318605",
  "BRK.B": "0001067983",
  JPM: "0000019617",
  XOM: "0000034088",
};
