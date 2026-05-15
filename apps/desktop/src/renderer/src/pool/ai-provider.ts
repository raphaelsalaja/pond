import { useEffect, useState } from "react";
import {
  type AiProviderConfig,
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
} from "@/pages/settings/sections/_types";

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
