import type { AiProviderConfig } from "@pond/schema/db";
import log from "electron-log/main.js";
import { getAiGatewayKey } from "../../keychain";
import { getAiProviderConfig } from "../prefs";

/**
 * Provider abstraction for the enrichment worker. All four tiers
 * (Local Ollama / AI Gateway / Direct provider key / Off) speak the
 * OpenAI Chat Completions + Embeddings shape, so a single thin client
 * is enough — we don't pull in `@ai-sdk/*` to keep the desktop bundle
 * small.
 *
 * The job code calls `chatVision`, `chatText`, or `embed`; this module
 * resolves the active provider config and dispatches.
 */

export interface ProviderClient {
  kind: AiProviderConfig["kind"];
  baseUrl: string;
  apiKey: string | null;
  models: AiProviderConfig["models"];
  embeddingDim: number;
  sendImages: boolean;
}

const GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com";
// Vercel AI Gateway speaks OpenAI-compatible v1 endpoints under this prefix.
const VERCEL_GATEWAY_BASE_URL = "https://gateway.ai.vercel.app/v1";

/**
 * Resolve the active provider client. Returns `null` if AI is `off` or
 * if the necessary credential is missing (e.g. Gateway tier with no
 * key in the keychain).
 */
export async function getProviderClient(): Promise<ProviderClient | null> {
  const config = await getAiProviderConfig();
  if (config.kind === "off") return null;

  let apiKey: string | null = null;
  let baseUrl = config.baseUrl;
  if (config.kind === "gateway" || config.kind === "direct") {
    apiKey = await getAiGatewayKey();
    if (!apiKey) return null;
    if (
      config.kind === "gateway" &&
      (!baseUrl || baseUrl.startsWith("http://127.0.0.1"))
    ) {
      baseUrl = VERCEL_GATEWAY_BASE_URL;
    }
  }

  return {
    kind: config.kind,
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    models: config.models,
    embeddingDim: config.embeddingDim,
    sendImages: config.sendImages,
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
}

export async function chat(
  client: ProviderClient,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const url = `${client.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (client.apiKey) headers.Authorization = `Bearer ${client.apiKey}`;
  const body: Record<string, unknown> = {
    model: opts.model ?? client.models.summary,
    messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.responseFormatJson) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat ${res.status}: ${text || res.statusText}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Convenience wrapper: send an image to the vision model and parse a
 * structured JSON response. Strips any leading code fences the model
 * sometimes adds around JSON output.
 */
export async function visionExtract(
  client: ProviderClient,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<unknown> {
  if (!client.sendImages && client.kind !== "local") {
    throw new Error("send_images_disabled");
  }
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const raw = await chat(
    client,
    [
      {
        role: "system",
        content:
          "You are an image classifier. Always respond with strict JSON, no prose.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    {
      model: client.models.vision,
      maxTokens: 800,
      responseFormatJson: true,
    },
  );
  return parseJsonLoose(raw);
}

export async function embed(
  client: ProviderClient,
  text: string,
): Promise<number[]> {
  const url = `${client.baseUrl}/embeddings`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (client.apiKey) headers.Authorization = `Bearer ${client.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: client.models.embedding,
      input: text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embed ${res.status}: ${body || res.statusText}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vec = json.data?.[0]?.embedding;
  if (!vec) throw new Error("embed: empty response");
  return vec;
}

/**
 * Probe the configured Local endpoint to see if Ollama (or another
 * OpenAI-compatible server) is reachable. Used by the AI settings page
 * to flip the "Local detected" badge without making the user hit Save
 * first.
 */
export async function detectOllama(
  baseUrl: string,
): Promise<{ ok: boolean; modelCount?: number }> {
  const target = (baseUrl || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  try {
    const res = await fetch(`${target}/models`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as {
      data?: unknown[];
      models?: unknown[];
    };
    const count = json.data?.length ?? json.models?.length ?? 0;
    return { ok: true, modelCount: count };
  } catch (err) {
    log.warn("[pond enrich] detectOllama failed", err);
    return { ok: false };
  }
}

/**
 * LLMs occasionally wrap JSON responses in markdown fences. Strip them
 * before parsing so the worker tolerates `auto-apply` mode silently.
 */
function parseJsonLoose(raw: string): unknown {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-ditch: try to find the first `{...}` block.
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

void GATEWAY_BASE_URL;
