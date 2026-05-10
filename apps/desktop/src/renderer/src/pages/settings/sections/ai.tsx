import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";
import {
  type AiAutonomy,
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
} from "./_types";

/**
 * Comprehensive AI settings page.
 *
 *   - Provider tier picker (Local / Gateway / Direct / Off)
 *   - Per-task model identifiers + base URL for local endpoints
 *   - Live Ollama detection
 *   - Autonomy radio (Off / Suggest / Auto)
 *   - Embedding dim + re-embed flow
 *   - Daily budget cap (cloud only)
 *   - Privacy: send-images toggle
 *   - Backfill / status / pending counts
 */

interface AiProviderConfig {
  kind: "off" | "local" | "gateway" | "direct";
  baseUrl: string;
  models: { vision: string; summary: string; embedding: string };
  embeddingDim: number;
  dailyBudgetUsd: number | null;
  sendImages: boolean;
}

interface ExtendedSettingsRow extends SettingsRow {
  aiProvider?: AiProviderConfig;
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

interface EnrichStatus {
  pending: number;
  running: number;
  done: number;
  error: number;
}

/**
 * Embedding model presets — mirrors what was previously surfaced on
 * the standalone Embeddings page. Picking a preset overwrites both
 * the model id and the configured vector dim so they stay in sync;
 * "Custom…" leaves the inputs editable for self-hosted endpoints.
 */
const EMBEDDING_PRESETS: Record<string, { dim: number; label: string }> = {
  "nomic-embed-text": { dim: 768, label: "Local · nomic-embed-text" },
  "mxbai-embed-large": { dim: 1024, label: "Local · mxbai-embed-large" },
  "text-embedding-3-small": {
    dim: 1536,
    label: "OpenAI · text-embedding-3-small",
  },
  "text-embedding-3-large": {
    dim: 3072,
    label: "OpenAI · text-embedding-3-large",
  },
};

export function AiSection() {
  const toast = useToast();
  const [personality, patchPersonality] = usePrefs("aiPersonality");
  const [captionsPrefs, patchCaptions] = usePrefs("captions");
  const [searchPrefs, patchSearch] = usePrefs("search");
  const [aiKey, setAiKey] = useState("");
  const [settings, setSettings] = useState<ExtendedSettingsRow | null>(null);
  const [provider, setProvider] = useState<AiProviderConfig>(DEFAULT_PROVIDER);
  const [busy, setBusy] = useState(false);
  const [ollama, setOllama] = useState<{
    ok: boolean;
    modelCount?: number;
  } | null>(null);
  const [status, setStatus] = useState<EnrichStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = (await window.pond.query(
        "enrich.status",
        {},
      )) as EnrichStatus;
      setStatus(res);
    } catch {
      /* tolerate transient main outages */
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      window.pond.query("settings.aiGatewayKey", {}) as Promise<{
        key: string;
      }>,
      window.pond.query("settings.get", {}) as Promise<ExtendedSettingsRow>,
    ]).then(([k, s]) => {
      setAiKey(k.key ?? "");
      const merged: ExtendedSettingsRow = {
        ...s,
        videoDownload: s.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
        aiProvider: s.aiProvider ?? DEFAULT_PROVIDER,
      };
      setSettings(merged);
      setProvider(merged.aiProvider ?? DEFAULT_PROVIDER);
    });
    void refreshStatus();
    const handle = setInterval(refreshStatus, 4000);
    return () => clearInterval(handle);
  }, [refreshStatus]);

  useEffect(() => {
    if (provider.kind !== "local") {
      setOllama(null);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const res = (await window.pond.query("settings.detectOllama", {
          baseUrl: provider.baseUrl,
        })) as { ok: boolean; modelCount?: number };
        if (!cancelled) setOllama(res);
      } catch {
        if (!cancelled) setOllama({ ok: false });
      }
    };
    void probe();
    const handle = setInterval(probe, 8000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [provider.kind, provider.baseUrl]);

  async function persistProvider(next: AiProviderConfig) {
    setProvider(next);
    try {
      await window.pond.query(
        "settings.setAiProvider",
        next as unknown as Record<string, unknown>,
      );
    } catch (err) {
      toast.add({
        title: "Couldn't save provider config",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  }

  async function saveAiKey() {
    setBusy(true);
    try {
      await window.pond.query("settings.setAiGatewayKey", { key: aiKey });
      toast.add({
        title: "AI key saved",
        description: "Stored in your keychain.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function setAutonomy(value: AiAutonomy) {
    if (!settings) return;
    setSettings({
      ...settings,
      aiAutonomy: { ...settings.aiAutonomy, tagging: value },
    });
    try {
      await window.pond.query("settings.setAiAutonomy", { tagging: value });
    } catch (err) {
      toast.add({
        title: "Couldn't update autonomy",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  }

  async function reembed() {
    setBusy(true);
    try {
      await window.pond.query("settings.recreateVec", {});
      const res = (await window.pond.query("enrich.backfill", {})) as {
        scheduled: number;
      };
      toast.add({
        title: "Re-embed started",
        description: `${res.scheduled}\u00A0jobs queued.`,
        type: "success",
      });
      void refreshStatus();
    } catch (err) {
      toast.add({
        title: "Re-embed failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function backfill() {
    setBusy(true);
    try {
      const res = (await window.pond.query("enrich.backfill", {})) as {
        scheduled: number;
      };
      toast.add({
        title: "Backfill scheduled",
        description: `${res.scheduled}\u00A0jobs pending.`,
        type: "success",
      });
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  const isCloud = provider.kind === "gateway" || provider.kind === "direct";
  const isOff = provider.kind === "off";

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>AI & Agents</Settings.Title>
        <Settings.Description>
          Choose a provider, pick models, and tune how Pond enriches saves.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Provider</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Tier</Settings.ItemTitle>
              <Settings.ItemDescription>
                Local uses an OpenAI-compatible server. Gateway routes through
                Vercel AI Gateway. Direct uses an OpenAI, Anthropic, or Google
                key. Off disables enrichment.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={provider.kind}
                onValueChange={(v) =>
                  void persistProvider({
                    ...provider,
                    kind: v as AiProviderConfig["kind"],
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="off">Off</Select.Item>
                  <Select.Item value="local">Local (Ollama)</Select.Item>
                  <Select.Item value="gateway">Vercel AI Gateway</Select.Item>
                  <Select.Item value="direct">Direct Provider Key</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          {provider.kind === "local" ? (
            <>
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Base URL</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    OpenAI-compatible endpoint. Defaults to a local Ollama
                    install.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Input.Root
                    data-size="sm"
                    value={provider.baseUrl}
                    onChange={(e) =>
                      void persistProvider({
                        ...provider,
                        baseUrl: e.target.value,
                      })
                    }
                  />
                </Settings.ItemControl>
              </Settings.Item>

              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Status</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {ollama === null
                      ? "Checking…"
                      : ollama.ok
                        ? `Local server reachable. ${ollama.modelCount ?? "?"}\u00A0models loaded.`
                        : "Couldn't reach the endpoint. Run `ollama serve` and try again."}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <span aria-live="polite">
                    {ollama === null
                      ? "…"
                      : ollama.ok
                        ? "Connected"
                        : "Offline"}
                  </span>
                </Settings.ItemControl>
              </Settings.Item>
            </>
          ) : null}

          {isCloud ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>API Key</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {provider.kind === "gateway"
                    ? "Paste your Vercel AI Gateway key. Stored in the OS keychain."
                    : "Paste your OpenAI, Anthropic, or Google API key. Stored in the OS keychain."}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Input.Root
                    type="password"
                    data-size="sm"
                    placeholder="sk-…"
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                  />
                  <Button size="sm" onClick={saveAiKey} disabled={busy}>
                    Save
                  </Button>
                </div>
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}
        </Settings.List>
      </Settings.Section>

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Models</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Vision</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Caption, alt text, tags, classification, and OCR in a single
                  call.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  value={provider.models.vision}
                  onChange={(e) =>
                    void persistProvider({
                      ...provider,
                      models: { ...provider.models, vision: e.target.value },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Summary</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Article summaries. Smaller text-only models work fine here.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  value={provider.models.summary}
                  onChange={(e) =>
                    void persistProvider({
                      ...provider,
                      models: { ...provider.models, summary: e.target.value },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Privacy</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Send Images to Provider</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Applies to cloud tiers. Local providers always keep bytes on
                  this machine.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Switch.Root
                  checked={provider.sendImages}
                  onCheckedChange={(v) =>
                    void persistProvider({ ...provider, sendImages: v })
                  }
                  disabled={provider.kind === "local"}
                />
              </Settings.ItemControl>
            </Settings.Item>

            {isCloud ? (
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Daily Budget (USD)</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Pause cloud providers once today's usage crosses this
                    number. Leave empty for unlimited.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Input.Root
                    data-size="sm"
                    type="number"
                    value={
                      provider.dailyBudgetUsd === null
                        ? ""
                        : String(provider.dailyBudgetUsd)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      void persistProvider({
                        ...provider,
                        dailyBudgetUsd: raw === "" ? null : Number(raw),
                      });
                    }}
                  />
                </Settings.ItemControl>
              </Settings.Item>
            ) : null}
          </Settings.List>
        </Settings.Section>
      ) : null}

      {settings ? (
        <Settings.Section>
          <Settings.SectionTitle>Autonomy</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Mode</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Suggest drops results in the inbox for review. Auto writes
                  directly to the save and stays revertable from the inbox.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Select.Root
                  value={settings.aiAutonomy.tagging}
                  onValueChange={(v) => void setAutonomy(v as AiAutonomy)}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="off">Off</Select.Item>
                    <Select.Item value="suggest">Suggest</Select.Item>
                    <Select.Item value="auto-apply">
                      Auto-Apply Tags
                    </Select.Item>
                    <Select.Item value="auto">Auto (All Fields)</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Agent Personalization</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Tone</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Default tone for captions, summaries, and alt text.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Select.Root
                  value={personality.tone}
                  onValueChange={(v) =>
                    patchPersonality({ tone: v as typeof personality.tone })
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="neutral">Neutral</Select.Item>
                    <Select.Item value="playful">Playful</Select.Item>
                    <Select.Item value="terse">Terse</Select.Item>
                    <Select.Item value="academic">Academic</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Tag Style</Settings.ItemTitle>
                <Settings.ItemDescription>
                  The casing rule the model follows when proposing tags.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Select.Root
                  value={personality.tagStyle}
                  onValueChange={(v) =>
                    patchPersonality({
                      tagStyle: v as typeof personality.tagStyle,
                    })
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="kebab">kebab-case</Select.Item>
                    <Select.Item value="snake">snake_case</Select.Item>
                    <Select.Item value="natural">Natural Language</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>

          <Settings.ItemDetails>
            <Settings.ItemTitle>System Prompt Addition</Settings.ItemTitle>
            <Settings.ItemDescription>
              Free-text guidance prepended to every prompt. Leave blank for the
              defaults.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <textarea
            rows={4}
            value={personality.systemPrompt}
            onChange={(e) => patchPersonality({ systemPrompt: e.target.value })}
            style={{
              width: "100%",
              padding: 8,
              font: "inherit",
              fontSize: 12,
              resize: "vertical",
              background: "var(--ds-gray-2)",
              color: "var(--ds-gray-12)",
              border: "1px solid var(--ds-gray-a4)",
              borderRadius: 8,
            }}
            placeholder="Always favour British English spelling."
          />
        </Settings.Section>
      ) : null}

      <Settings.Section>
        <Settings.SectionTitle>Pipeline</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Status</Settings.ItemTitle>
              <Settings.ItemDescription>
                {status
                  ? `${status.pending} pending · ${status.running} running · ${status.done} done · ${status.error} errored`
                  : "Loading…"}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={backfill} disabled={busy}>
                Run Backfill
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Embeddings</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Embedding Model</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Pick a preset for known dims, or Custom for a self-hosted
                  endpoint.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Select.Root
                  value={
                    EMBEDDING_PRESETS[provider.models.embedding]
                      ? provider.models.embedding
                      : "custom"
                  }
                  onValueChange={(raw) => {
                    if (typeof raw !== "string" || raw === "custom") return;
                    const preset = EMBEDDING_PRESETS[raw];
                    if (!preset) return;
                    void persistProvider({
                      ...provider,
                      models: { ...provider.models, embedding: raw },
                      embeddingDim: preset.dim,
                    });
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {Object.entries(EMBEDDING_PRESETS).map(([k, v]) => (
                      <Select.Item value={k} key={k}>
                        {v.label}
                      </Select.Item>
                    ))}
                    <Select.Item value="custom">Custom…</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Model Identifier</Settings.ItemTitle>
                <Settings.ItemDescription>
                  The exact model name passed to the provider's{" "}
                  <code>model</code> field.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  value={provider.models.embedding}
                  onChange={(e) =>
                    void persistProvider({
                      ...provider,
                      models: { ...provider.models, embedding: e.target.value },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Vector Dim</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Must match the chosen model's output. Mismatched dims wipe{" "}
                  <code>saves_vec</code> on next launch.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  type="number"
                  value={String(provider.embeddingDim)}
                  onChange={(e) =>
                    void persistProvider({
                      ...provider,
                      embeddingDim: Number.parseInt(e.target.value, 10) || 768,
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Re-Embed Library</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Drop <code>saves_vec</code>, recreate it at the configured
                  dim, and re-run embed for every save. Files stay put.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={reembed}
                  disabled={busy}
                >
                  {busy ? "Working…" : "Re-Embed"}
                </Button>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}

      <Settings.Section>
        <Settings.SectionTitle>Search</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Hybrid Search</Settings.ItemTitle>
              <Settings.ItemDescription>
                Blend SQLite FTS results with vector embeddings for better
                recall.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={searchPrefs.hybrid}
                onCheckedChange={(v) => patchSearch({ hybrid: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Recency Boost</Settings.ItemTitle>
              <Settings.ItemDescription>
                Nudge newer saves higher when ranks are otherwise tied.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={searchPrefs.recencyBoost}
                onCheckedChange={(v) => patchSearch({ recencyBoost: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Result Limit</Settings.ItemTitle>
              <Settings.ItemDescription>
                Max rows returned per search. Lower is snappier on huge
                libraries.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input.Root
                data-size="sm"
                type="number"
                value={String(searchPrefs.resultLimit)}
                onChange={(e) =>
                  patchSearch({
                    resultLimit: Math.max(
                      10,
                      Math.min(2000, Number(e.target.value) || 200),
                    ),
                  })
                }
                style={{ width: 96 }}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Captions</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Image Alt Text</Settings.ItemTitle>
              <Settings.ItemDescription>
                Generate alt text for image saves on first import via the vision
                enrichment job.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={captionsPrefs.autoAltText}
                onCheckedChange={(v) => patchCaptions({ autoAltText: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Video Transcripts</Settings.ItemTitle>
              <Settings.ItemDescription>
                Transcribe downloaded videos so they're searchable. Ships when
                the whisper worker lands.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={captionsPrefs.videoTranscripts}
                onCheckedChange={(v) => patchCaptions({ videoTranscripts: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Language</Settings.ItemTitle>
              <Settings.ItemDescription>
                BCP-47 hint passed to vision and transcription. Leave as{" "}
                <code>en</code> if your saves are mostly English.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input.Root
                data-size="sm"
                value={captionsPrefs.language}
                onChange={(e) => patchCaptions({ language: e.target.value })}
                style={{ width: 96 }}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
