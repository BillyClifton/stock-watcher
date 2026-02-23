// Split plain text into overlapping chunks suitable for LLM context windows.
const CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;

export function chunkText(text) {
  if (!text) {
    return [];
  }
  const chunks = [];
  let start = 0;
  let idx = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHARS, text.length);
    chunks.push({ chunkId: `c${idx}`, text: text.slice(start, end) });
    idx++;
    start += CHUNK_CHARS - OVERLAP_CHARS;
  }
  return chunks;
}
