import { AgentRunControlsSchema } from "@pond/schema";
import { z } from "zod";

const chat = {
  tools: true,
  structuredOutput: true,
  vision: true,
  customModel: false,
} as const;
const text = {
  tools: true,
  structuredOutput: true,
  vision: false,
  customModel: false,
} as const;
const host = {
  tools: true,
  structuredOutput: false,
  vision: false,
  customModel: true,
} as const;

export const ASSISTANT_MODELS = [
  {
    id: "codex",
    name: "Codex Default",
    provider: "Codex",
    model: "default",
    local: true,
    needsKey: false,
    setupUrl: "https://learn.chatgpt.com/docs/cli",
    quality: "custom",
    capabilities: { ...text, customModel: true },
  },
  {
    id: "claude-code",
    name: "Claude Code Default",
    provider: "Claude Code",
    model: "default",
    local: true,
    needsKey: false,
    setupUrl: "https://code.claude.com/docs/en/setup",
    quality: "custom",
    capabilities: { ...text, customModel: true },
  },
  {
    id: "anthropic",
    name: "Claude Opus 5",
    provider: "Anthropic",
    model: "claude-opus-5",
    local: false,
    needsKey: true,
    setupUrl: "https://console.anthropic.com/settings/keys",
    quality: "maximum",
    creator: "anthropic",
    capabilities: chat,
  },
  {
    id: "openai",
    name: "GPT-5.6 Sol",
    provider: "OpenAI",
    model: "gpt-5.6-sol",
    local: false,
    needsKey: true,
    setupUrl: "https://platform.openai.com/api-keys",
    quality: "maximum",
    creator: "openai",
    capabilities: chat,
  },
  {
    id: "gemini",
    name: "Gemini 3.1 Pro",
    provider: "Google",
    model: "gemini-3.1-pro-preview",
    local: false,
    needsKey: true,
    setupUrl: "https://aistudio.google.com/apikey",
    quality: "maximum",
    creator: "google",
    capabilities: chat,
  },
  {
    id: "xai",
    name: "Grok 4.6",
    provider: "xAI",
    model: "grok-4.6",
    local: false,
    needsKey: true,
    setupUrl: "https://console.x.ai",
    quality: "maximum",
    creator: "xai",
    capabilities: chat,
  },
  {
    id: "azure",
    name: "GPT-5.6 Sol",
    provider: "Azure",
    model: "gpt-5.6-sol",
    local: false,
    needsKey: true,
    setupUrl: "https://ai.azure.com",
    quality: "custom",
    capabilities: { ...chat, customModel: true },
  },
  {
    id: "mistral",
    name: "Mistral Large",
    provider: "Mistral",
    model: "mistral-large-latest",
    local: false,
    needsKey: true,
    setupUrl: "https://console.mistral.ai/api-keys/",
    quality: "maximum",
    creator: "mistral",
    capabilities: chat,
  },
  {
    id: "groq",
    name: "Llama 3.3 70B",
    provider: "Groq",
    model: "llama-3.3-70b-versatile",
    local: false,
    needsKey: true,
    setupUrl: "https://console.groq.com/keys",
    quality: "maximum",
    creator: "groq",
    capabilities: chat,
  },
  {
    id: "cohere",
    name: "Command A",
    provider: "Cohere",
    model: "command-a-03-2025",
    local: false,
    needsKey: true,
    setupUrl: "https://dashboard.cohere.com/api-keys",
    quality: "maximum",
    creator: "cohere",
    capabilities: chat,
  },
  {
    id: "togetherai",
    name: "Llama 3.3 70B",
    provider: "Together",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    local: false,
    needsKey: true,
    setupUrl: "https://api.together.ai/settings/api-keys",
    quality: "maximum",
    creator: "togetherai",
    capabilities: text,
  },
  {
    id: "fireworks",
    name: "Llama 3.3 70B",
    provider: "Fireworks",
    model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    local: false,
    needsKey: true,
    setupUrl: "https://app.fireworks.ai/api-keys",
    quality: "maximum",
    creator: "fireworks",
    capabilities: text,
  },
  {
    id: "deepinfra",
    name: "DeepSeek V3",
    provider: "DeepInfra",
    model: "deepseek-ai/DeepSeek-V3",
    local: false,
    needsKey: true,
    setupUrl: "https://deepinfra.com/dash/api_keys",
    quality: "maximum",
    creator: "deepinfra",
    capabilities: text,
  },
  {
    id: "cerebras",
    name: "GPT OSS 120B",
    provider: "Cerebras",
    model: "gpt-oss-120b",
    local: false,
    needsKey: true,
    setupUrl: "https://cloud.cerebras.ai",
    quality: "maximum",
    creator: "cerebras",
    capabilities: text,
  },
  {
    id: "perplexity",
    name: "Sonar",
    provider: "Perplexity",
    model: "sonar",
    local: false,
    needsKey: true,
    setupUrl: "https://console.perplexity.ai",
    quality: "maximum",
    creator: "perplexity",
    capabilities: text,
  },
  {
    id: "baseten",
    name: "GPT OSS 120B",
    provider: "Baseten",
    model: "openai/gpt-oss-120b",
    local: false,
    needsKey: true,
    setupUrl: "https://app.baseten.co",
    quality: "maximum",
    capabilities: text,
  },
  {
    id: "deepseek",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    model: "deepseek-chat",
    local: false,
    needsKey: true,
    setupUrl: "https://platform.deepseek.com/api_keys",
    quality: "maximum",
    creator: "deepseek",
    capabilities: text,
  },
  {
    id: "opencode-go",
    name: "DeepSeek V4.1 Flash",
    provider: "OpenCode Go",
    model: "deepseek-v4.1-flash",
    local: false,
    needsKey: true,
    setupUrl: "https://opencode.ai/docs/go",
    quality: "custom",
    capabilities: text,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    provider: "OpenRouter",
    model: "openrouter/auto",
    local: false,
    needsKey: true,
    setupUrl: "https://openrouter.ai/keys",
    quality: "custom",
    capabilities: chat,
  },
  {
    id: "ollama",
    name: "Llama 3.2",
    provider: "Ollama",
    model: "llama3.2",
    local: true,
    needsKey: false,
    setupUrl: "https://ollama.com",
    quality: "custom",
    capabilities: host,
  },
  {
    id: "lmstudio",
    name: "Local Model",
    provider: "LM Studio",
    model: "local",
    local: true,
    needsKey: false,
    setupUrl: "https://lmstudio.ai",
    quality: "custom",
    capabilities: host,
  },
  {
    id: "sapient",
    name: "Qwen 2.5 3B",
    provider: "Sapient",
    model: "openhorizon/qwen2.5-3b-q4",
    local: true,
    needsKey: false,
    setupUrl: "https://sapient.openhorizon.so",
    quality: "custom",
    capabilities: host,
  },
] as const;

export type AssistantProvider = (typeof ASSISTANT_MODELS)[number]["id"];
export type AssistantCatalog = (typeof ASSISTANT_MODELS)[number];
const ASSISTANT_PROVIDER_IDS = ASSISTANT_MODELS.map((model) => model.id);
export const assistantProvider = z.enum(ASSISTANT_PROVIDER_IDS);

export function assistantCatalog(id: string): AssistantCatalog | undefined {
  return ASSISTANT_MODELS.find((model) => model.id === id);
}

export type ProviderGroup = "cloud" | "local" | "subscription";

export function providerGroup(id: AssistantProvider): ProviderGroup {
  if (id === "codex" || id === "claude-code") return "subscription";
  return assistantCatalog(id)?.local ? "local" : "cloud";
}

export function offeredProviders(kind: ProviderGroup) {
  return ASSISTANT_MODELS.filter((model) => providerGroup(model.id) === kind);
}

export function gatewayCreator(id: AssistantProvider): string | undefined {
  const catalog = assistantCatalog(id);
  return catalog && "creator" in catalog ? catalog.creator : undefined;
}
const assistantScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library") }),
  z.object({ kind: z.literal("folder"), id: z.string().min(1) }),
  z.object({ kind: z.literal("attachments") }),
]);

export const ASSISTANT_CHANGE_CAP = 100;
const ASSISTANT_ATTACH_CAP = 200;
export const ASSISTANT_FILE_ATTACH_CAP = 10;

const assistantLibraryAction = z.enum([
  "folderCreate",
  "folderRename",
  "folderDelete",
  "tagCreate",
  "tagRename",
  "tagMerge",
  "savedViewCreate",
  "savedViewRename",
  "savedViewUpdate",
  "quickAdd",
  "mergeDuplicates",
  "exportFiles",
  "exportCsv",
  "syncNow",
  "refresh",
  "archive",
  "copyUrl",
  "reveal",
  "batchRename",
  "purgeTrash",
]);

export const assistantQuestion = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(160)).min(2).max(4),
});
export type AssistantQuestion = z.infer<typeof assistantQuestion>;

const assistantChangeProposal = z.discriminatedUnion("field", [
  z.object({
    saveId: z.string(),
    field: z.literal("title"),
    after: z.string().trim().min(1).max(300),
    reason: z.string().max(500),
  }),
  z.object({
    saveId: z.string(),
    field: z.literal("note"),
    after: z.string().trim().max(4000),
    reason: z.string().max(500),
  }),
  z.object({
    saveId: z.string(),
    field: z.enum(["tags", "folders"]),
    after: z.array(z.string().trim().min(1).max(100)).max(24),
    reason: z.string().max(500),
  }),
  z.object({
    saveId: z.string(),
    field: z.literal("rating"),
    after: z.number().int().min(0).max(5),
    reason: z.string().max(500),
  }),
  z.object({
    saveId: z.string(),
    field: z.literal("trash"),
    after: z.enum(["trash", "restore"]),
    reason: z.string().max(500),
  }),
  z.object({
    saveId: z.string().default(""),
    field: z.literal("action"),
    action: assistantLibraryAction,
    after: z.string().trim().min(1).max(500),
    payload: z
      .object({
        id: z.string().optional(),
        to: z.string().optional(),
        from: z.string().optional(),
        ids: z.array(z.string()).optional(),
        name: z.string().optional(),
        parentId: z.string().nullable().optional(),
        sortKey: z.string().optional(),
        sortDir: z.string().optional(),
        layout: z.string().optional(),
        url: z.string().optional(),
        keepId: z.string().optional(),
        directory: z.string().optional(),
        accountId: z.string().optional(),
        pattern: z.string().optional(),
        query: z
          .object({
            combinator: z.enum(["and", "or"]),
            not: z.boolean().optional(),
            rules: z.array(
              z.object({
                field: z.string(),
                operator: z.string(),
                value: z
                  .union([
                    z.string(),
                    z.number(),
                    z.boolean(),
                    z.array(z.union([z.string(), z.number()])),
                    z.object({
                      hex: z.string(),
                      tolerance: z.number(),
                    }),
                  ])
                  .optional(),
                negate: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      })
      .optional(),
    reason: z.string().max(500),
  }),
]);
export const assistantProposalInput = z.object({
  changes: z.array(assistantChangeProposal).min(1).max(ASSISTANT_CHANGE_CAP),
});

export const assistantResultSet = z.object({
  title: z.string().trim().min(1).max(120),
  saveIds: z.array(z.string().min(1)).min(1).max(80),
});
export type AssistantResultSet = z.infer<typeof assistantResultSet>;

export const assistantToolStep = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().optional(),
  status: z.enum(["running", "complete", "error", "stopped"]),
  elapsedMs: z.number().optional(),
});
export type AssistantToolStep = z.infer<typeof assistantToolStep>;

export const assistantSend = z.object({
  chatId: z.string().min(1),
  requestId: z.string().min(1).max(100),
  content: z.string().trim().min(1).max(32000),
  attachmentIds: z
    .array(z.string().min(1))
    .max(ASSISTANT_ATTACH_CAP)
    .default([]),
  fileAttachmentIds: z
    .array(z.string().min(1))
    .max(ASSISTANT_FILE_ATTACH_CAP)
    .default([]),
  scope: assistantScope.default({ kind: "library" }),
  provider: assistantProvider,
  modelId: z.string().trim().min(1).max(300).optional(),
  controls: AgentRunControlsSchema.optional(),
  replyToQuestion: z.string().min(1).optional(),
  semanticQuery: z.string().nullable().optional(),
  visualSaveId: z.string().nullable().optional(),
});
export type AssistantSend = z.infer<typeof assistantSend>;

export const assistantSource = z.object({
  id: z.string(),
  title: z.string().nullable(),
  url: z.string(),
  source: z.string(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AssistantSource = z.infer<typeof assistantSource>;

export const assistantFileAttachment = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
});
export type AssistantFileAttachment = z.infer<typeof assistantFileAttachment>;

export const assistantChange = z.intersection(
  z.object({
    id: z.string(),
    saveId: z.string(),
    title: z.string(),
    reason: z.string(),
    status: z.enum(["pending", "applied", "dismissed", "undone"]),
    error: z.string().optional(),
    undoable: z.boolean().optional(),
  }),
  z.discriminatedUnion("field", [
    z.object({
      field: z.literal("title"),
      before: z.string().nullable(),
      after: z.string(),
    }),
    z.object({
      field: z.literal("note"),
      before: z.string().nullable(),
      after: z.string(),
    }),
    z.object({
      field: z.enum(["tags", "folders"]),
      before: z.array(z.string()),
      after: z.array(z.string()),
    }),
    z.object({
      field: z.literal("rating"),
      before: z.number().nullable(),
      after: z.number(),
    }),
    z.object({
      field: z.literal("trash"),
      before: z.enum(["active", "trashed"]),
      after: z.enum(["active", "trashed"]),
    }),
    z.object({
      field: z.literal("action"),
      action: assistantLibraryAction.or(z.literal("runOperation")),
      before: z.string().nullable(),
      after: z.string(),
      payload: z.record(z.string(), z.json()).optional(),
    }),
  ]),
);
export type AssistantChange = z.infer<typeof assistantChange>;

export const assistantMetadata = z.object({
  elapsedMs: z.number().finite().nonnegative().optional(),
  attachments: z.array(assistantSource).optional(),
  files: z.array(assistantFileAttachment).optional(),
  scope: assistantScope.optional(),
  scopeLabel: z.string().optional(),
  sources: z.array(assistantSource).optional(),
  changes: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => assistantChange.safeParse(item).data ?? []),
    )
    .optional(),
  question: assistantQuestion.optional(),
  replyToQuestion: z.string().optional(),
  results: z.array(assistantResultSet).optional(),
  steps: z.array(assistantToolStep).optional(),
  stopped: z.boolean().optional(),
  error: z.string().optional(),
});
export type AssistantMetadata = z.infer<typeof assistantMetadata>;

export const assistantMessage = z.object({
  id: z.string(),
  chatId: z.string(),
  role: z.string(),
  content: z.string(),
  metadata: assistantMetadata.nullable(),
});
export type AssistantMessage = z.infer<typeof assistantMessage>;
export const assistantMessages = z.array(assistantMessage);
export const assistantSources = z.array(assistantSource);

export type AssistantActivity =
  | "thinking"
  | "searching"
  | "reading"
  | "writing"
  | "preparing";
export type AssistantEvent =
  | { type: "activity"; activity: AssistantActivity }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "results"; results: AssistantResultSet[] }
  | { type: "steps"; steps: AssistantToolStep[] }
  | { type: "text"; text: string };

export const agentStreamRequest = assistantSend.omit({ content: true }).extend({
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["system", "user", "assistant"]),
        parts: z.array(z.unknown()),
        metadata: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type AgentStreamRequest = z.infer<typeof agentStreamRequest>;
export type AssistantChunk = AssistantEvent & {
  chatId: string;
  requestId: string;
};
export const assistantSendResult = z.object({
  chatId: z.string(),
  accepted: z.boolean().optional(),
  error: z.string().optional(),
  stopped: z.boolean().optional(),
});
export type AssistantSendResult = z.infer<typeof assistantSendResult>;
