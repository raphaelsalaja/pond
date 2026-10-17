import type { LanguageModel } from "ai";

export type LocalLanguageModelProvider = "ollama" | "lmstudio" | "sapient";

const DEFAULT_BASE_URL = {
  ollama: "http://127.0.0.1:11434/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
  sapient: "http://127.0.0.1:11435/v1",
} satisfies Record<LocalLanguageModelProvider, string>;

export async function createLocalLanguageModel(input: {
  provider: LocalLanguageModelProvider;
  model: string;
  apiKey?: string | null;
  baseUrl?: string;
}): Promise<LanguageModel> {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const configured = input.baseUrl?.trim() || DEFAULT_BASE_URL[input.provider];
  const baseURL =
    input.provider === "ollama"
      ? `${configured.replace(/\/v1\/?$/i, "").replace(/\/$/, "")}/v1`
      : configured.replace(/\/$/, "");
  return createOpenAICompatible({
    name: input.provider,
    apiKey: input.apiKey || "local",
    baseURL,
  })(input.model);
}
