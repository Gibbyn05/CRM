export const OPENAI_DAGSAVIS_MODEL =
  process.env.OPENAI_DAGSAVIS_MODEL ??
  process.env.OPENAI_MODEL ??
  "gpt-5-nano";

function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY ?? process.env.OpenAi_Api_key ?? null;
}

type OpenAIResponseOutput = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type OpenAIResponsesPayload = {
  output_text?: string;
  output?: OpenAIResponseOutput[];
  error?: {
    message?: string;
  };
};

export async function generateOpenAIText({
  instructions,
  input,
  maxOutputTokens = 420,
  model = OPENAI_DAGSAVIS_MODEL,
}: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  model?: string;
}): Promise<string> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("Mangler OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      store: false,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAIResponsesPayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `OpenAI-kall feilet med status ${response.status}.`,
    );
  }

  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n");

  return outputText?.trim() || "";
}
