import {
  type ModelCapabilities,
  modelCapabilities,
  type ProviderModel,
} from "../../../shared/provider-models";

type LocalProvider = "ollama" | "lmstudio" | "sapient";

export type DeclaredLocalModelCapabilities =
  | string[]
  | {
      text?: boolean;
      vision?: boolean;
      audio?: boolean;
      tools?: boolean;
      trainedForToolUse?: boolean;
    };

export interface LocalModelMetadata {
  provider: LocalProvider;
  id: string;
  name?: string;
  sizeBytes?: number;
  capabilities?: DeclaredLocalModelCapabilities;
}

export function normalizeLocalModel(input: LocalModelMetadata): ProviderModel {
  const declared = input.capabilities;
  let normalized: Partial<ModelCapabilities> = {};
  if (Array.isArray(declared)) {
    const tokens = new Set(declared.map((value) => value.trim().toLowerCase()));
    normalized = {
      text: tokens.has("completion") || tokens.has("text"),
      vision: tokens.has("vision"),
      audio: tokens.has("audio"),
      tools:
        tokens.has("tools") || tokens.has("tool") || tokens.has("tool_use"),
    };
  } else if (declared) {
    normalized = {
      ...declared,
      tools: declared.tools || declared.trainedForToolUse,
    };
  }
  const model: ProviderModel = {
    id: input.id,
    name: input.name?.trim() || input.id,
    modelCapabilities: modelCapabilities.parse(normalized),
  };
  if (
    input.sizeBytes !== undefined &&
    Number.isSafeInteger(input.sizeBytes) &&
    input.sizeBytes > 0
  ) {
    model.sizeBytes = input.sizeBytes;
  }
  return model;
}
