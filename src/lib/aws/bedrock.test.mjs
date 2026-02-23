import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeJsonParse } from "./bedrock.mjs";

describe("safeJsonParse", () => {
  it("parses a bare JSON object string", () => {
    const result = safeJsonParse('{"foo":"bar"}');
    assert.deepEqual(result, { foo: "bar" });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const text = 'Here is your answer:\n{"key":"value","num":42}\nEnd of output.';
    const result = safeJsonParse(text);
    assert.deepEqual(result, { key: "value", num: 42 });
  });

  it("handles nested objects", () => {
    const text = '{"outer":{"inner":true},"list":[1,2,3]}';
    const result = safeJsonParse(text);
    assert.deepEqual(result, { outer: { inner: true }, list: [1, 2, 3] });
  });

  it("throws when no JSON object is present", () => {
    assert.throws(() => safeJsonParse("no json here"), /Bedrock did not return JSON/);
  });

  it("throws when braces are unbalanced / invalid JSON", () => {
    assert.throws(() => safeJsonParse("{bad json}"), SyntaxError);
  });
});
