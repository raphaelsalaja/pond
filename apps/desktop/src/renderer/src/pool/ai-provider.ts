import { useEffect, useState } from "react";
import {
  type AiProviderConfig,
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
} from "@/pages/settings/sections/_types";

/**
 * Shared cache + subscriber set for the `settings.aiProvider` column.
 *
 * Mirrors the `usePrefs` pattern in `./prefs.ts` — every page that calls
 * `useAiProvider()` shares one in-memory copy so flipping the provider
 * tier on the AI Provider page is visible on Enrichment / Search &
 * Embeddings before the IPC handler returns. The API key sits next to
 * the provider config because cloud tiers can't function without it
 * and surfacing them on the same page is the only place they're used.
 */

interface AiProviderState {
  provider: AiProviderConfig;
  apiKey: string;
}

const DEFAULT_PROVIDER: AiProviderConfig = {
  kind: "off",
  baseUrl: "http://127.0.0.1:11434/v1",
  models: {
    vision: "llava:7b",
    summary: "llama3.2:3b",
    embedding: "nomic-embed-text",
  },
  embeddingDim: 768,
  dailyBudgetUsd: null,
  sendImages: true,
};

let cache: AiProviderState | null = null;
let inflight: Promise<AiProviderState> | null = null;
const listeners = new Set<(s: AiProviderState) => void>();

async function load(): Promise<AiProviderState> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const [k, s] = await Promise.all([
      window.pond.query("settings.aiGatewayKey", {}) as Promise<{
        key: string;
      }>,
      window.pond.query("settings.get", {}) as Promise<
        SettingsRow & { aiProvider?: AiProviderConfig }
      >,
    ]);
    const next: AiProviderState = {
      provider: s.aiProvider ?? DEFAULT_PROVIDER,
      apiKey: k.key ?? "",
    };
    // Pre-fill the videoDownload default on the row so other call
    // sites that happen to read SettingsRow during the same tick
    // don't trip over an undefined.
    void (s.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD);
    cache = next;
    inflight = null;
    return next;
  })();
  return inflight;
}

function emit(next: AiProviderState) {
  cache = next;
  for (const fn of listeners) fn(next);
}

export interface UseAiProvider {
  provider: AiProviderConfig;
  apiKey: string;
  ready: boolean;
  patchProvider: (delta: Partial<AiProviderConfig>) => void;
  setApiKey: (next: string) => void;
  saveApiKey: () => Promise<void>;
}

/**
 * Read + patch the AI provider config and gateway key. The patch fn
 * persists to main; `setApiKey` is local-only (so the user can type
 * before committing) and `saveApiKey` writes through.
 */
export function useAiProvider(): UseAiProvider {
  const [state, setState] = useState<AiProviderState | null>(cache);

  useEffect(() => {
    let active = true;
    const update = (next: AiProviderState) => {
      if (!active) return;
      setState(next);
    };
    listeners.add(update);
    void load().then(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  const patchProvider = (delta: Partial<AiProviderConfig>) => {
    if (!cache) return;
    const merged: AiProviderConfig = {
      ...cache.provider,
      ...delta,
      models: { ...cache.provider.models, ...(delta.models ?? {}) },
    };
    emit({ ...cache, provider: merged });
    void window.pond
      .query(
        "settings.setAiProvider",
        merged as unknown as Record<string, unknown>,
      )
      .catch(() => {
        if (cache) emit(cache);
      });
  };

  const setApiKey = (next: string) => {
    if (!cache) return;
    emit({ ...cache, apiKey: next });
  };

  const saveApiKey = async () => {
    if (!cache) return;
    await window.pond.query("settings.setAiGatewayKey", { key: cache.apiKey });
  };

  return {
    provider: state?.provider ?? DEFAULT_PROVIDER,
    apiKey: state?.apiKey ?? "",
    ready: state !== null,
    patchProvider,
    setApiKey,
    saveApiKey,
  };
}
