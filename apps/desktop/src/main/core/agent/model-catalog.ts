import { AgentReasoningSchema } from "@pond/schema";
import type { AgentReasoning } from "@pond/schema";
import { z } from "zod";
import { gatewayCreator } from "../../../shared/assistant";
import { modelCapabilities } from "../../../shared/provider-models";
import type { ProviderModel } from "../../../shared/provider-models";
import type { AgentProviderId } from "./keys";

const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
const CACHE_MS = 5 * 60_000;
const tokenLimit = z.number().int().positive().nullish().catch(undefined);
const catalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      type: z.string(),
      description: z.string().nullish(),
      context_window: tokenLimit,
      max_tokens: tokenLimit,
      tags: z.array(z.string()).catch([]),
      reasoning_options: z
        .array(
          z.object({
            type: z.string(),
            values: z.array(z.string()).optional(),
          }),
        )
        .optional()
        .catch([]),
      pricing: z
        .object({
          input: z.string().optional(),
          output: z.string().optional(),
          input_cache_read: z.string().optional(),
          input_cache_write: z.string().optional(),
        })
        .nullish()
        .catch(undefined),
    }),
  ),
});
type CatalogEntry = z.infer<typeof catalogSchema>["data"][number];
type CatalogResult = { models: Array<CatalogEntry>; error?: string };

export function createModelCatalog(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let cached: Array<CatalogEntry> = [];
  let expires = 0;
  let pending: Promise<CatalogResult> | undefined;
  return async (): Promise<CatalogResult> => {
    if (now() < expires) return { models: cached };
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetcher(CATALOG_URL, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = catalogSchema.parse(await response.json());
        cached = parsed.data.filter((model) => model.type === "language");
        expires = now() + CACHE_MS;
        return { models: cached };
      } catch {
        return {
          models: cached,
          error: cached.length
            ? "Could not refresh the model catalog. Showing the last loaded catalog."
            : "Could not load the model catalog. Check your connection and try again.",
        };
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
}

export const loadModelCatalog = createModelCatalog();

function creator(provider: AgentProviderId): string | undefined {
  return gatewayCreator(provider);
}

function withMetadata(
  entry: CatalogEntry,
  id: string,
  native?: ProviderModel,
): ProviderModel {
  const model: ProviderModel = { id, name: entry.name, catalogId: entry.id };
  if (entry.description) model.description = entry.description;
  if (entry.context_window) model.contextWindow = entry.context_window;
  if (entry.max_tokens) model.maxOutputTokens = entry.max_tokens;
  model.capabilities = [
    ...new Set(
      entry.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const capabilityTags = new Set(model.capabilities);
  model.modelCapabilities =
    native?.modelCapabilities ??
    modelCapabilities.parse({
      text: true,
      vision: capabilityTags.has("vision"),
      audio: capabilityTags.has("audio"),
      tools: [
        "tools",
        "tool-use",
        "tool_use",
        "tool-calling",
        "function-calling",
      ].some((tag) => capabilityTags.has(tag)),
    });
  const reasoningOptions = (entry.reasoning_options ?? []).flatMap((option) =>
    option.type === "effort"
      ? (option.values ?? []).flatMap((value): Array<AgentReasoning> => {
          const parsed = AgentReasoningSchema.safeParse(
            value.trim().toLowerCase(),
          );
          return parsed.success && parsed.data !== "provider-default"
            ? [parsed.data]
            : [];
        })
      : [],
  );
  if (reasoningOptions.length) {
    model.reasoningOptions = [...new Set(reasoningOptions)];
  }
  if (entry.pricing) {
    model.pricing = {
      input: entry.pricing.input,
      output: entry.pricing.output,
      cachedInput: entry.pricing.input_cache_read,
      cacheCreation: entry.pricing.input_cache_write,
    };
  }
  return model;
}

export function catalogModelsForProvider(
  provider: AgentProviderId,
  catalog: Array<CatalogEntry>,
  nativeModels?: Array<ProviderModel>,
): Array<ProviderModel> {
  const prefix = creator(provider);
  if (!prefix) return nativeModels ?? [];
  const entries = catalog.filter((entry) => entry.id.startsWith(`${prefix}/`));
  if (!nativeModels) {
    return entries.map((entry) => ({
      ...withMetadata(entry, entry.id),
      available: false,
    }));
  }
  return nativeModels
    .map((native) => {
      const exact = entries.find(
        (entry) => entry.id === `${prefix}/${native.id}`,
      );
      const names = entries.filter(
        (entry) => entry.name.toLowerCase() === native.name.toLowerCase(),
      );
      const entry = exact ?? (names.length === 1 ? names[0] : undefined);
      return entry ? withMetadata(entry, native.id, native) : native;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
