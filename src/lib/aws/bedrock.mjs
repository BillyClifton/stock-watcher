import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

export async function invokeBedrockJson({ modelId, system, messages, jsonSchemaHint }) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
    system: system ?? "You are a precise financial analysis assistant. Output ONLY valid JSON.",
    messages,
  };

  // Optional: nudge to keep JSON tight
  if (jsonSchemaHint) {
    body.system += `\n\nReturn JSON matching this schema (informal):\n${jsonSchemaHint}`;
  }

  const res = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    })
  );

  const raw = new TextDecoder().decode(res.body);
  const parsed = JSON.parse(raw);

  // Anthropic returns content blocks
  const text = parsed?.content?.map((c) => c.text).join("") ?? "";
  return safeJsonParse(text);
}

function safeJsonParse(text) {
  // Best-effort: extract first {...} block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    return JSON.parse(candidate);
  }
  throw new Error(`Bedrock did not return JSON. Raw: ${text.slice(0, 500)}`);
}

export async function extractForward({ modelId, ticker, filingMeta, chunks }) {
  // Feed top N chunks only for MVP to control cost.
  const top = chunks.slice(0, 12);

  const jsonSchemaHint = `
{
  "ticker": "string",
  "doc": {"form":"10-Q|10-K","filingDate":"YYYY-MM-DD","sourceUrl":"string"},
  "guidance":[{"metric":"string","period":"string","value":"string","rawQuote":"string","chunkId":"string"}],
  "forwardDrivers":[{"driver":"string","direction":"up|down|mixed","timeframe":"string","evidence":["chunkId"]}],
  "notableRisks":[{"risk":"string","severity":0-1,"evidence":["chunkId"]}]
}`;

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
`Extract forward-looking guidance and forecast drivers for ${ticker}.
Use only evidence from the chunks. Keep rawQuote short.

Filing: ${filingMeta.form} filed ${filingMeta.filingDate}
Source: ${filingMeta.docUrl}

CHUNKS:
${top.map((c) => `\n[${c.chunkId}]\n${c.text}`).join("\n")}
`
        }
      ]
    }
  ];

  return invokeBedrockJson({ modelId, messages, jsonSchemaHint });
}