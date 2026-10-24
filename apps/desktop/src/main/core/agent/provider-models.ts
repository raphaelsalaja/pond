import type { JsonValue } from "@pond/schema/json";
import { z } from "zod";
import {
  chosenModelId,
  displayName,
  type ProviderModel,
} from "../../../shared/provider-models";
import type { AgentProviderId } from "./keys";
import {
  type DeclaredLocalModelCapabilities,
  normalizeLocalModel,
} from "./local-model-capabilities";

export type { ProviderModel } from "../../../shared/provider-models";
export { displayName };

const SKIP =
  /embedding|whisper|tts|dall-e|davinci|babbage|moderation|realtime|transcribe|audio-|gpt-image|sora|computer-use|omni-moderation|text-embedding|codex-/i;

export function modelsFromProviderResponse(
  provider: AgentProviderId,
  json: JsonValue | undefined,
): ProviderModel[] {
  const ids = idsFromResponse(provider, json);
  const seen = new Set<string>();
  const models: ProviderModel[] = [];
  const local = isLocalProvider(provider);
  for (const raw of ids) {
    const id = raw.id.trim();
    if (!id || seen.has(id) || !isChatModel(provider, id, raw.outputModalities))
      continue;
    seen.add(id);
    const name = raw.name.trim() || (local ? id : displayName(id));
    const model: ProviderModel = local
      ? normalizeLocalModel({
          provider,
          id,
          name,
          sizeBytes: raw.sizeBytes,
          capabilities: raw.localCapabilities,
        })
      : { id, name };
    models.push(model);
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

function idsFromResponse(
  provider: AgentProviderId,
  json: JsonValue | undefined,
): Array<{
  id: string;
  name: string;
  sizeBytes?: number;
  localCapabilities?: DeclaredLocalModelCapabilities;
  outputModalities?: string[];
}> {
  const stringField = z.string().catch("");
  const byteSize = z.number().int().positive().optional().catch(undefined);
  if (provider === "gemini") {
    const parsed = z
      .object({
        models: z
          .array(
            z
              .object({
                name: stringField,
                displayName: stringField,
                supportedGenerationMethods: z.array(z.string()).catch([]),
              })
              .nullable()
              .catch(null),
          )
          .catch([]),
      })
      .safeParse(json);
    if (!parsed.success) return [];
    return parsed.data.models.flatMap((row) => {
      if (!row) return [];
      const methods = row.supportedGenerationMethods;
      if (
        methods.length &&
        !methods.includes("generateContent") &&
        !methods.includes("generateContentStream")
      )
        return [];
      const id = row.name.replace(/^models\//, "");
      return id ? [{ id, name: row.displayName }] : [];
    });
  }
  const localCapabilities = z
    .union([
      z.array(z.string()),
      z.object({
        text: z.boolean().optional(),
        vision: z.boolean().optional(),
        audio: z.boolean().optional(),
        tools: z.boolean().optional(),
        tool_use: z.boolean().optional(),
        trained_for_tool_use: z.boolean().optional(),
      }),
    ])
    .optional()
    .catch(undefined);
  const parsed = z
    .object({
      data: z
        .array(
          z
            .object({
              id: stringField,
              display_name: stringField,
              name: stringField,
              size: byteSize,
              size_bytes: byteSize,
              capabilities: localCapabilities,
              architecture: z
                .object({
                  output_modalities: z.array(z.string()).catch([]),
                })
                .optional()
                .catch(undefined),
            })
            .nullable()
            .catch(null),
        )
        .catch([]),
    })
    .safeParse(json);
  return parsed.success
    ? parsed.data.data.flatMap((row) => {
        if (!row?.id) return [];
        const capabilities = row.capabilities;
        const localCapabilities =
          capabilities && !Array.isArray(capabilities)
            ? {
                text: capabilities.text,
                vision: capabilities.vision,
                audio: capabilities.audio,
                tools: capabilities.tools || capabilities.tool_use,
                trainedForToolUse: capabilities.trained_for_tool_use,
              }
            : capabilities;
        return [
          {
            id: row.id,
            name: row.display_name || row.name,
            sizeBytes: row.size_bytes ?? row.size,
            localCapabilities,
            outputModalities: row.architecture?.output_modalities,
          },
        ];
      })
    : [];
}

function isLocalProvider(
  provider: AgentProviderId,
): provider is "ollama" | "lmstudio" | "sapient" {
  return (
    provider === "ollama" || provider === "lmstudio" || provider === "sapient"
  );
}

const SAPIENT_NON_CHAT = /kokoro|orpheus|smolvla/i;

function isChatModel(
  provider: AgentProviderId,
  id: string,
  outputModalities?: string[],
): boolean {
  if (SKIP.test(id)) return false;
  if (provider === "sapient") return !SAPIENT_NON_CHAT.test(id);
  if (provider === "ollama" || provider === "lmstudio") return true;
  const n = id.toLowerCase();
  if (provider === "openai") return /^(gpt-|o[1-9]|chatgpt-)/.test(n);
  if (provider === "anthropic") return n.includes("claude");
  if (provider === "gemini") return n.includes("gemini");
  if (provider === "deepseek") return n.includes("deepseek");
  if (provider === "openrouter") {
    if (outputModalities?.length)
      return outputModalities.includes("text") && outputModalities.length === 1;
    return !/(embed|whisper|tts|dall-e|moderation)/.test(n);
  }
  return true;
}

export function resolveModelId(
  provider: AgentProviderId,
  prefs: {
    modelIds?: Record<string, string>;
    ollamaModelId?: string;
    lmstudioModelId?: string;
  },
  catalogFallback: string,
): string {
  return chosenModelId(provider, prefs) || catalogFallback;
}

export function connectionFor(
  provider: AgentProviderId,
  prefs: {
    modelIds?: Record<string, string>;
    ollamaModelId?: string;
    lmstudioModelId?: string;
    ollamaBaseUrl?: string;
    lmstudioBaseUrl?: string;
    sapientBaseUrl?: string;
    azureResourceName?: string;
  },
  catalogFallback: string,
) {
  const modelId = resolveModelId(provider, prefs, catalogFallback);
  if (provider === "ollama")
    return { modelId, baseUrl: prefs.ollamaBaseUrl || undefined };
  if (provider === "lmstudio")
    return { modelId, baseUrl: prefs.lmstudioBaseUrl || undefined };
  if (provider === "sapient")
    return { modelId, baseUrl: prefs.sapientBaseUrl || undefined };
  if (provider === "azure") {
    const resource = prefs.azureResourceName?.trim();
    return {
      modelId,
      baseUrl: resource
        ? `https://${resource}.openai.azure.com/openai/v1`
        : undefined,
    };
  }
  return { modelId };
}
