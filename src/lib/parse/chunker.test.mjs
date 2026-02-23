import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "./chunker.mjs";

describe("chunkText", () => {
  it("returns empty array for falsy input", () => {
    assert.deepEqual(chunkText(null), []);
    assert.deepEqual(chunkText(""), []);
    assert.deepEqual(chunkText(undefined), []);
  });

  it("assigns stable sequential chunkIds starting at c0", () => {
    const text = "a".repeat(5000);
    const chunks = chunkText(text);
    assert.ok(chunks.length > 1);
    chunks.forEach((c, i) => assert.equal(c.chunkId, `c${i}`));
  });

  it("each chunk is at most 2000 chars", () => {
    const text = "x".repeat(9000);
    const chunks = chunkText(text);
    for (const c of chunks) {
      assert.ok(c.text.length <= 2000, `chunk too long: ${c.text.length}`);
    }
  });

  it("chunks overlap by 200 chars", () => {
    const text = "abcdefghij".repeat(300); // 3000 chars
    const chunks = chunkText(text);
    assert.equal(chunks.length, 2);
    // Second chunk starts at offset 1800 (2000 - 200 overlap)
    assert.equal(chunks[1].text, text.slice(1800));
  });

  it("returns a single chunk when text fits within 2000 chars", () => {
    const text = "hello world";
    const chunks = chunkText(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].chunkId, "c0");
    assert.equal(chunks[0].text, text);
  });

  it("chunk IDs are deterministic across repeated calls", () => {
    const text = "z".repeat(6000);
    const first = chunkText(text).map((c) => c.chunkId);
    const second = chunkText(text).map((c) => c.chunkId);
    assert.deepEqual(first, second);
  });
});
