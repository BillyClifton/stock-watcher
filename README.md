# Stock Watcher

A serverless daily stock analysis bot that monitors SEC filings for your watchlist, extracts forward-looking guidance using Amazon Bedrock (Claude), scores each ticker, and delivers a ranked email digest every morning.

## Architecture

```
EventBridge Scheduler (7 AM ET)
        │
        ▼
 DailyStateMachine (Step Functions)
        │
        ├─ LoadTickers ──────────────────────────────────────────────────┐
        │                                                                │
        └─ ProcessTickers (Map, MaxConcurrency=3)                       │
              │                                                         │
              └─ PerTickerFunction (Lambda) × N tickers                │
                    │  • Fetches latest 10-Q/10-K from SEC EDGAR        │
                    │  • Converts HTML → plain text                     │
                    │  • Chunks text for LLM context                    │
                    │  • Calls Bedrock to extract guidance/risks        │
                    │  • Scores the signal and diffs vs. prior run      │
                    │  • Stores doc metadata in DynamoDB + HTML/text    │
                    │    in S3                                           │
                    ▼                                                    │
             BuildAlertFunction (Lambda)  ◄──────────────────────────┘
                    │  • Reads signals for all tickers from DynamoDB
                    │  • Calls Bedrock to produce ranked daily summary
                    │  • Falls back to plain-text digest on AI error
                    └─► SNS Topic → Email subscription
```

**AWS services used:** Lambda · Step Functions · EventBridge Scheduler · DynamoDB · S3 · SNS · Bedrock (Anthropic Claude)

## Prerequisites

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with appropriate credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) ≥ 1.100
- Node.js 20 (matches Lambda runtime)
- An AWS account with Bedrock model access enabled for the chosen Claude model

## Setup & Deployment

```bash
# 1. Install dependencies
npm install

# 2. (First deploy only) Build & deploy with guided prompts
cd infra
sam build
sam deploy --guided
# Supply: stack name, AWS region, BedrockModelId, AlertEmail

# Subsequent deploys
sam build && sam deploy
```

The guided deploy creates:
- S3 bucket for raw HTML and extracted text
- Two DynamoDB tables (`StockDocs`, `StockSignals`)
- SNS topic + email subscription (confirm the subscription email)
- Three Lambda functions
- Step Functions state machine
- EventBridge Scheduler rule (daily 7 AM ET)

## Configuration

### Watched tickers

Edit `src/config/tickers.json` to update the watched ticker list. This file is the single source of truth:

- The scheduled state machine defines the ticker list in `infra/statemachine.asl.json` under `LoadTickers.Result.list` (the `$.tickers.list` path consumed by both `ProcessTickers` and `BuildAlertFunction`) — so `statemachine.asl.json` must also be updated to match.
- When `BuildAlertFunction` is invoked without an `event.tickers` value (e.g. ad-hoc Lambda invocation), it falls back to reading `src/config/tickers.json` directly.

```json
// src/config/tickers.json
{ "tickers": ["AAPL","MSFT","AMZN","GOOGL","NVDA","META","TSLA","BRK.B","JPM","XOM"] }
```

### Bedrock model

Pass `BedrockModelId` as a SAM parameter or change the default in `infra/template.yaml`:

```yaml
Parameters:
  BedrockModelId:
    Default: "anthropic.claude-3-5-sonnet-20240620-v1:0"
```

### SEC User-Agent

The SEC requires a descriptive `User-Agent` header. Set the environment variable or update the default in `src/lib/edger/edger.mjs`:

```bash
SEC_USER_AGENT="MyApp/1.0 (your-email@example.com)"
```

## How It Works

1. **LoadTickers** – Pass state injects the ticker list into the execution context.
2. **ProcessTickers** – Map state fans out up to 3 concurrent `PerTickerFunction` invocations.
3. **PerTickerFunction** – For each ticker:
   - Fetches the most recent 10-Q or 10-K filing from the SEC EDGAR API.
   - Converts the filing HTML to plain text.
   - Splits the text into 2,000-character overlapping chunks.
   - Sends the top 12 chunks to Bedrock to extract: guidance items, forward drivers, and notable risks.
   - Diffs extracted signals against the previous run to detect changes.
   - Scores the signal (confidence, risk, trajectory, overall).
   - Persists the document and signal records.
4. **BuildAlertFunction** – Reads all signals for the run date, asks Bedrock to produce a ranked Markdown digest, and publishes it via SNS.

## Environment Variables (set by SAM template)

| Variable | Description |
|---|---|
| `DOCS_BUCKET` | S3 bucket name for raw/text documents |
| `TABLE_DOCS` | DynamoDB table for filing metadata |
| `TABLE_SIGNALS` | DynamoDB table for scored signals |
| `ALERT_TOPIC_ARN` | SNS topic ARN for alert publishing |
| `BEDROCK_MODEL_ID` | Bedrock model ID for Anthropic Claude |
| `SEC_USER_AGENT` | HTTP User-Agent sent to SEC APIs (optional override) |

## Manual Invocation

Trigger a run immediately via the AWS console or CLI:

```bash
# Start the full state machine
aws stepfunctions start-execution \
  --state-machine-arn <StateMachineArn from stack outputs> \
  --input '{}'

# Run a single ticker ad-hoc
aws lambda invoke \
  --function-name <PerTickerFunctionName> \
  --payload '{"ticker":"AAPL","runDate":"2025-01-15"}' \
  response.json
```

## Project Structure

```
├── infra/
│   ├── template.yaml          # SAM / CloudFormation template
│   ├── statemachine.asl.json  # Step Functions state machine definition
│   └── samconfig.toml         # SAM deploy defaults
├── src/
│   ├── config/
│   │   └── tickers.json       # Watched ticker list
│   ├── handlers/
│   │   ├── perTicker.mjs      # Per-ticker Lambda handler
│   │   ├── buildAlert.mjs     # Daily alert Lambda handler
│   │   └── runDaily.mjs       # Utility: reads tickers config (manual trigger helper)
│   └── lib/
│       ├── alerts/
│       │   └── formatDaily.mjs    # Fallback plain-text alert formatter
│       ├── analysis/
│       │   ├── extractForward.mjs # Bedrock prompt for guidance extraction
│       │   └── score.mjs          # Signal scoring and diff logic
│       ├── aws/
│       │   ├── bedrock.mjs    # Bedrock client wrapper
│       │   ├── ddb.mjs        # DynamoDB helpers
│       │   ├── s3.mjs         # S3 helpers
│       │   └── sns.mjs        # SNS publish helper
│       ├── edger/
│       │   └── edger.mjs      # SEC EDGAR filing fetcher
│       └── parse/
│           ├── htmltotext.js  # HTML → plain text converter
│           └── chunker.mjs    # Text chunker for LLM context windows
└── package.json
```

## Cost Considerations

- Bedrock calls dominate cost. Each ticker run sends ~12 chunks (~24 000 chars) plus a schema hint to Claude. With 10 tickers daily that is roughly 20 Bedrock invocations/day.
- DynamoDB is on-demand (PAY_PER_REQUEST); writes are proportional to tickers × runs.
- S3 storage grows with each filing. Consider adding a lifecycle rule to archive or expire old objects.
- Step Functions charges per state transition; at ~10 tickers the daily cost is negligible.
