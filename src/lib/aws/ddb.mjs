import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_DOCS = process.env.TABLE_DOCS;
const TABLE_SIGNALS = process.env.TABLE_SIGNALS;

export function buildDocSk({ form, filingDate, accessionNumber }) {
  // Stable unique doc key
  return `DOC#${form}#${filingDate}#${accessionNumber}`;
}

export async function getDoc(ticker, docSk) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_DOCS,
      Key: { pk: `TICKER#${ticker}`, sk: docSk }
    })
  );
  return res.Item ?? null;
}

export async function putDocIfAbsent({ ticker, docSk, item }) {
  // Idempotent insert (does nothing if already exists)
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_DOCS,
        Item: { pk: `TICKER#${ticker}`, sk: docSk, ...item },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
      })
    );
    return { created: true };
  } catch (err) {
    // ConditionalCheckFailedException -> already exists
    if (err?.name === "ConditionalCheckFailedException") return { created: false };
    throw err;
  }
}

export async function markDocProcessed({ ticker, docSk }) {
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_DOCS,
      Key: { pk: `TICKER#${ticker}`, sk: docSk },
      UpdateExpression: "SET processedWithBedrockAt = :now",
      ExpressionAttributeValues: { ":now": now }
    })
  );
  return { processedWithBedrockAt: now };
}

export async function putSignal({ ticker, runDate, ...rest }) {
  return ddb.send(
    new PutCommand({
      TableName: TABLE_SIGNALS,
      Item: {
        pk: `TICKER#${ticker}`,
        sk: `RUN#${runDate}`,
        ticker,
        runDate,
        createdAt: new Date().toISOString(),
        ...rest
      }
    })
  );
}

export async function getLatestSignal(ticker) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_SIGNALS,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :run)",
      ExpressionAttributeValues: { ":pk": `TICKER#${ticker}`, ":run": "RUN#" },
      ScanIndexForward: false,
      Limit: 1
    })
  );
  return res.Items?.[0] ?? null;
}

export async function getSignalsForRun(tickers, runDate) {
  const Keys = tickers.map((t) => ({ pk: `TICKER#${t}`, sk: `RUN#${runDate}` }));
  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: { [TABLE_SIGNALS]: { Keys } }
    })
  );
  const items = res.Responses?.[TABLE_SIGNALS] ?? [];
  const map = new Map(items.map((i) => [i.ticker, i]));
  return tickers.map((t) => map.get(t) ?? { ticker: t, runDate, missing: true });
}