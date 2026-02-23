# AGENTS.md — Stock Forecast Signal Bot (Bedrock)

This repo generates daily “forecast interpretation” signals for a fixed set of tickers by:
- fetching the latest SEC filings (MVP: latest 10-Q/10-K),
- extracting forward-looking guidance + drivers using AWS Bedrock,
- detecting changes vs the prior run,
- scoring each ticker,
- sending a single daily alert (SNS email/SMS, later Slack optional).

The system is **daily batch**, not a real-time trading engine.

---

## Core principles (do not violate)

1) **Source of truth is the SEC filing text**
   - Do not invent metrics, guidance, or claims not supported by filing content.
   - Any extracted item must include a `chunkId` evidence reference.

2) **Structured outputs over prose**
   - All LLM calls must return **valid JSON** matching the expected schema.
   - Downstream code must not rely on free-form natural language.

3) **Keep the MVP lean**
   - Prefer small, incremental improvements.
   - Avoid adding dependencies unless they materially improve correctness or stability.
   - If a new dependency is needed, explain why and keep scope minimal.

4) **Deterministic code, probabilistic LLM**
   - Parsing, chunking, storage, and scoring must be deterministic.
   - LLM is used primarily for extraction/summarization into structured fields.

---

## High-level architecture

**Schedule**: EventBridge Scheduler (daily 7 AM ET)  
**Orchestration**: Step Functions (Map over tickers)  
**Compute**: Lambda (Node.js 20.x, ESM `.mjs`)  
**LLM**: AWS Bedrock `InvokeModel`  
**Storage**:
- S3: raw filing HTML + extracted text
- DynamoDB:
  - `StockDocs`: metadata about ingested documents
  - `StockSignals`: one signal snapshot per ticker per run date
**Alerts**: SNS Topic (email subscription)

---

## Where to make changes

### Handlers (Lambda entry points)
- `src/handlers/perTicker.mjs`
  - fetch filing
  - parse + chunk
  - call Bedrock extractor
  - diff vs latest signal
  - score
  - persist to DynamoDB

- `src/handlers/buildAlert.mjs`
  - load per-ticker signals for run date
  - rank / summarize (Bedrock)
  - publish SNS

- `src/handlers/runDaily.mjs` (optional helper)
  - manually start the Step Functions state machine

### Libraries
- `src/lib/edgar/edgar.mjs` — SEC EDGAR fetch
- `src/lib/parse/*` — parsing + chunking
- `src/lib/aws/*` — AWS SDK wrappers
- `src/lib/analysis/*` — extraction wrapper, diff, scoring heuristics
- `src/lib/alerts/*` — formatting fallbacks

---

## How to run

### Quality gates (must pass before PR)
- `npm run ci`
  - `prettier --check`
  - `eslint`
  - `node --test`

### Deploy
- `npm run deploy:guided` (first time)
- `npm run deploy` (subsequent)

### Cloud run (manual)
Set env:
- `STATE_MACHINE_ARN` (Step Functions ARN)
- `SEC_USER_AGENT` (required by SEC)

Then:
- `npm run cloud:run`

### Local run (SAM local)
- `npm run sam:build`
- `npm run local:perTicker`
- `npm run local:buildAlert`

Note: `sam local` requires Docker.

---

## Configuration

### Tickers
- `src/config/tickers.json` is the default ticker list.
- The scheduler input can override tickers (recommended), but keep it at ~10 for MVP.

### SEC User-Agent (required)
SEC requests should include a descriptive User-Agent:
- `SEC_USER_AGENT="stock-forecast-bot (you@domain.com)"`

Never ship code that omits SEC User-Agent headers.

### Bedrock model
- configured via `BEDROCK_MODEL_ID` env var / SAM Parameter
- keep outputs JSON-only

---

## Data model contracts (do not break)

### Signal snapshot stored in `StockSignals`
Each run persists one item per ticker per date:
- PK: `TICKER#{ticker}`
- SK: `RUN#{YYYY-MM-DD}`

The stored shape must include:
- `extracted.guidance[]` with `metric`, `period`, `value`, `rawQuote`, `chunkId`
- `extracted.forwardDrivers[]` with `driver`, `direction`, `timeframe`, `evidence[]`
- `extracted.notableRisks[]` with `risk`, `severity`, `evidence[]`
- `changeLog[]` (diff vs previous signal)
- `scores` (confidence, risk, trajectory, overall)

If you change schemas, update:
- extractor prompt schema hints
- diff/scoring logic
- alert builder expectations
- any tests

---

## LLM prompting rules (Bedrock)

1) **JSON only**
   - Use “Output ONLY valid JSON” in the system prompt
   - Use a schema hint in the request body
2) **Evidence required**
   - For each extracted item, include evidence references (chunk IDs)
3) **Keep quotes short**
   - `rawQuote` should be short and directly from the filing chunk (not invented)
4) **Limit chunk count**
   - MVP uses top N chunks for cost control; do not blindly send entire filings
5) **Fail-safe**
   - If parsing Bedrock output fails, handler must degrade gracefully (fallback formatting) and still publish an alert.

---

## Safe behavior / non-goals

This repo is not:
- investment advice,
- a trading bot,
- a guarantee of accuracy.

Agents must:
- avoid “hallucinating” forecasts or asserting facts not present in sources,
- avoid recommending specific trades (“buy/sell now”) in alerts.
Use neutral language like “signal” / “shift” / “watch”.

---

## When adding features, follow this order

1) Correctness (evidence + schema + determinism)
2) Reliability (timeouts, retries, idempotency)
3) Cost control (skip runs when no new docs, reduce tokens)
4) Coverage (8-K, multiple filings, transcripts)
5) UX (Slack formatting, dashboards)

Avoid large refactors until MVP is stable.

---

## Common pitfalls (avoid)

- ❌ Fetching SEC without a User-Agent
- ❌ LLM outputs that are not valid JSON
- ❌ Storing prose-only results that can’t be diffed
- ❌ Changing the stored schema without updating alert builder + tests
- ❌ Increasing dependencies for “nice to have” formatting

---

## Testing expectations

Minimum tests should cover:
- chunker output size and IDs stable
- Bedrock JSON parsing “safeJsonParse” behavior
- diff/scoring behavior for simple mocked signals
- alert fallback formatting when Bedrock fails

Use Node’s native test runner (`node --test`).

---

## PR checklist (required)

- [ ] `npm run ci` passes
- [ ] Changes include tests when logic changes
- [ ] No new dependencies unless justified
- [ ] Any schema change updates prompts + docs + tests
- [ ] SEC User-Agent preserved
- [ ] Bedrock calls are JSON-only with schema hints and evidence refs

---

## Next planned improvements (agent-friendly TODOs)

- Add dynamic CIK resolution from SEC `company_tickers.json`
- Support new filings detection (skip Bedrock when no new doc)
- Extract multiple recent filings (10-Q + 8-K) and merge signals
- Improve change detection (numeric guidance delta extraction)
- Slack webhook delivery option (in addition to SNS)
- Add OpenSearch vector index (optional) for deeper retrieval