import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_DOCS = process.env.TABLE_DOCS;
const TABLE_SIGNALS = process.env.TABLE_SIGNALS;

export async function putDoc({ ticker, docId, ...rest }) {
  return ddb.send(new PutCommand({
    TableName: TABLE_DOCS,
    Item: { pk: `TICKER#${ticker}`, sk: `DOC#${docId}`, ...rest, createdAt: new Date().toISOString() }
  }));
}

export async function putSignal({ ticker, runDate, extracted, changeLog, scores }) {
  return ddb.send(new PutCommand({
    TableName: TABLE_SIGNALS,
    Item: {
      pk: `TICKER#${ticker}`,
      sk: `RUN#${runDate}`,
      ticker,
      runDate,
      extracted,
      changeLog,
      scores,
      createdAt: new Date().toISOString()
    }
  }));
}

export async function getLatestSignal(ticker) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_SIGNALS,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :run)",
    ExpressionAttributeValues: { ":pk": `TICKER#${ticker}`, ":run": "RUN#" },
    ScanIndexForward: false,
    Limit: 1
  }));
  return res.Items?.[0] ?? null;
}

export async function getSignalsForRun(tickers, runDate) {
  // BatchGet needs exact keys; we ask for RUN#YYYY-MM-DD for each ticker.
  const Keys = tickers.map((t) => ({ pk: `TICKER#${t}`, sk: `RUN#${runDate}` }));

  const res = await ddb.send(new BatchGetCommand({
    RequestItems: { [TABLE_SIGNALS]: { Keys } }
  }));

  const items = res.Responses?.[TABLE_SIGNALS] ?? [];
  // Ensure all tickers present (missing tickers -> placeholder)
  const map = new Map(items.map((i) => [i.ticker, i]));
  return tickers.map((t) => map.get(t) ?? { ticker: t, runDate, missing: true });
}