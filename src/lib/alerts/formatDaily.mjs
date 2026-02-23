export function formatDailyFallback(runDate, signals, errorMsg) {
  const lines = [`# Daily Stock Signals — ${runDate}`];
  if (errorMsg) lines.push(`\n> ⚠️ AI summary unavailable: ${errorMsg}\n`);

  for (const s of signals) {
    if (s.missing) {
      lines.push(`- **${s.ticker}**: no data`);
    } else {
      const { confidence = 0, risk = 0, overall = 0 } = s.scores ?? {};
      lines.push(`- **${s.ticker}**: overall=${overall} confidence=${confidence} risk=${risk}`);
    }
  }

  return {
    subject: `Daily Stock Forecast Signals — ${runDate}`,
    markdown: lines.join("\n")
  };
}
