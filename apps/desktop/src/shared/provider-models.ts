import type { AgentReasoning } from "@pond/schema";
import { z } from "zod";
import type { OkFailure, OkSuccess } from "./query-contracts-shared";

export const modelCapabilities = z.object({
  text: z.boolean().default(true),
  vision: z.boolean().default(false),
  audio: z.boolean().default(false),
  tools: z.boolean().default(false),
});

export type ModelCapabilities = z.infer<typeof modelCapabilities>;

export interface ProviderModel {
  id: string;
  name: string;
  sizeBytes?: number;
  contextWindow?: number;
  catalogId?: string;
  description?: string;
  maxOutputTokens?: number;
  capabilities?: Array<string>;
  modelCapabilities?: ModelCapabilities;
  reasoningOptions?: Array<AgentReasoning>;
  pricing?: {
    input?: string;
    output?: string;
    cachedInput?: string;
    cacheCreation?: string;
  };
  available?: boolean;
}

export type ProviderModelsResult = { models: Array<ProviderModel> } & (
  | OkSuccess<{ warning?: string }>
  | OkFailure
);

const TOKENS = new Map([
  ["gpt", "GPT"],
  ["chatgpt", "ChatGPT"],
]);

export function displayName(id: string): string {
  return id
    .replace(/^models\//, "")
    .replace(/^(claude-(?:haiku|opus|sonnet))-(\d+)-(\d+)(?=-|$)/, "$1-$2.$3")
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) => {
      const token = TOKENS.get(part.toLowerCase());
      if (token) {
        return token;
      }
      if (/^\d/.test(part)) {
        return part;
      }
      if (part.length <= 2) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function chosenModelId(
  provider: string,
  prefs: {
    modelIds?: Record<string, string>;
    ollamaModelId?: string;
    lmstudioModelId?: string;
  },
): string {
  const fromMap = prefs.modelIds?.[provider]?.trim();
  if (fromMap) {
    return fromMap;
  }
  if (provider === "ollama") {
    return prefs.ollamaModelId?.trim() ?? "";
  }
  if (provider === "lmstudio") {
    return prefs.lmstudioModelId?.trim() ?? "";
  }
  return "";
}

export function modelsForChooser(
  models: Array<ProviderModel>,
  visibleIds: Array<string> | undefined,
): Array<ProviderModel> {
  if (visibleIds === undefined) {
    return models;
  }
  return [...new Set(visibleIds)].map(
    (id) =>
      models.find((model) => model.id === id) ?? { id, name: displayName(id) },
  );
}
