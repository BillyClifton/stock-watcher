import { invokeBedrockJson } from "../aws/bedrock.mjs";

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