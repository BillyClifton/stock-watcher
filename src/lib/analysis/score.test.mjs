import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffSignals, scoreSignal } from "./score.mjs";

// ---------------------------------------------------------------------------
// diffSignals
// ---------------------------------------------------------------------------
describe("diffSignals", () => {
  it("returns empty array when prev is null", () => {
    const curr = { guidance: [], notableRisks: [] };
    assert.deepEqual(diffSignals(null, curr), []);
  });

  it("detects guidance count change", () => {
    const prev = { extracted: { guidance: [{ metric: "revenue" }], notableRisks: [] } };
    const curr = { guidance: [{ metric: "revenue" }, { metric: "eps" }], notableRisks: [] };
    const log = diffSignals(prev, curr);
    assert.equal(log.length, 1);
    assert.equal(log[0].type, "guidance_count");
    assert.equal(log[0].delta, 1);
  });

  it("detects newly added risks", () => {
    const prev = { extracted: { guidance: [], notableRisks: [] } };
    const curr = { guidance: [], notableRisks: [{ risk: "inflation", severity: 0.5 }] };
    const log = diffSignals(prev, curr);
    assert.equal(log.length, 1);
    assert.equal(log[0].type, "risk_added");
    assert.equal(log[0].delta, 1);
  });

  it("returns no changes when signals are identical", () => {
    const prev = {
      extracted: {
        guidance: [{ metric: "revenue" }],
        notableRisks: [{ risk: "fx risk" }],
      },
    };
    const curr = {
      guidance: [{ metric: "revenue" }],
      notableRisks: [{ risk: "fx risk" }],
    };
    assert.deepEqual(diffSignals(prev, curr), []);
  });
});

// ---------------------------------------------------------------------------
// scoreSignal
// ---------------------------------------------------------------------------
describe("scoreSignal", () => {
  it("returns all four score keys within valid ranges", () => {
    const result = scoreSignal({ extracted: { guidance: [], forwardDrivers: [], notableRisks: [] }, changeLog: [] });
    for (const key of ["confidence", "risk", "overall"]) {
      assert.ok(key in result, `missing key: ${key}`);
      assert.ok(result[key] >= 0 && result[key] <= 100, `${key} out of range: ${result[key]}`);
    }
    // trajectory is clamped to [-50, 50]
    assert.ok("trajectory" in result);
    assert.ok(result.trajectory >= -50 && result.trajectory <= 50, `trajectory out of range: ${result.trajectory}`);
  });

  it("higher guidance count raises confidence", () => {
    const base = { guidance: [], forwardDrivers: [], notableRisks: [] };
    const rich = {
      guidance: [1, 2, 3, 4, 5].map((i) => ({ metric: `m${i}` })),
      forwardDrivers: [],
      notableRisks: [],
    };
    const lowConf = scoreSignal({ extracted: base, changeLog: [] }).confidence;
    const highConf = scoreSignal({ extracted: rich, changeLog: [] }).confidence;
    assert.ok(highConf > lowConf, `expected ${highConf} > ${lowConf}`);
  });

  it("more risks raise the risk score", () => {
    const noRisks = { guidance: [], forwardDrivers: [], notableRisks: [] };
    const withRisks = {
      guidance: [],
      forwardDrivers: [],
      notableRisks: [{ severity: 0.8 }, { severity: 0.9 }],
    };
    const low = scoreSignal({ extracted: noRisks, changeLog: [] }).risk;
    const high = scoreSignal({ extracted: withRisks, changeLog: [] }).risk;
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it("upward drivers produce positive trajectory", () => {
    const extracted = {
      guidance: [],
      forwardDrivers: [
        { direction: "up" },
        { direction: "up" },
      ],
      notableRisks: [],
    };
    const { trajectory } = scoreSignal({ extracted, changeLog: [] });
    assert.ok(trajectory > 0, `expected positive trajectory, got ${trajectory}`);
  });
});
