import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDailyFallback } from "./formatDaily.mjs";

describe("formatDailyFallback", () => {
  it("includes the run date in subject and markdown", () => {
    const { subject, markdown } = formatDailyFallback("2025-01-15", [], null);
    assert.ok(subject.includes("2025-01-15"), "subject should contain run date");
    assert.ok(markdown.includes("2025-01-15"), "markdown should contain run date");
  });

  it("includes warning message when errorMsg is provided", () => {
    const { markdown } = formatDailyFallback("2025-01-15", [], "timeout");
    assert.ok(markdown.includes("timeout"), "markdown should include the error message");
    assert.ok(markdown.includes("⚠️"), "markdown should include warning emoji");
  });

  it("omits warning block when errorMsg is falsy", () => {
    const { markdown } = formatDailyFallback("2025-01-15", [], null);
    assert.ok(!markdown.includes("⚠️"), "should not include warning emoji when no error");
  });

  it("renders ticker scores for normal signals", () => {
    const signals = [
      { ticker: "AAPL", scores: { confidence: 80, risk: 20, overall: 75 } },
      { ticker: "MSFT", scores: { confidence: 60, risk: 30, overall: 55 } },
    ];
    const { markdown } = formatDailyFallback("2025-01-15", signals, null);
    assert.ok(markdown.includes("AAPL"), "should include AAPL");
    assert.ok(markdown.includes("overall=75"), "should include overall score");
    assert.ok(markdown.includes("MSFT"), "should include MSFT");
  });

  it("renders 'no data' for missing signals", () => {
    const signals = [{ ticker: "XOM", missing: true }];
    const { markdown } = formatDailyFallback("2025-01-15", signals, null);
    assert.ok(markdown.includes("XOM"), "should include XOM ticker");
    assert.ok(markdown.includes("no data"), "should indicate no data for missing ticker");
  });

  it("handles empty signals array gracefully", () => {
    const { subject, markdown } = formatDailyFallback("2025-01-15", [], null);
    assert.ok(typeof subject === "string");
    assert.ok(typeof markdown === "string");
  });
});
