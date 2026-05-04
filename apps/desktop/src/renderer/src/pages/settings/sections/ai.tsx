import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from "../../../ui";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";
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

export function AiSection() {
  const toast = useToast();
  const [personality, patchPersonality] = usePrefs("aiPersonality");
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
        description: "Stored securely in your keychain.",
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

  async function _reembed() {
    setBusy(true);
    try {
      await window.pond.query("settings.recreateVec", {});
      const res = (await window.pond.query("enrich.backfill", {})) as {
        scheduled: number;
      };
      toast.add({
        title: "Re-embedding started",
        description: `${res.scheduled} jobs queued.`,
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
        description: `${res.scheduled} pending jobs.`,
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
    <SectionStack>
      <SectionHeader
        title="AI & Agents"
        description="Pick a provider, set the models, control how aggressively Pond enriches saves."
      />

      <SettingsCard title="Provider">
        <Row
          label="Tier"
          description="Local runs against an OpenAI-compatible HTTP server (Ollama, LM Studio, llama.cpp). Gateway routes through Vercel AI Gateway. Direct uses an OpenAI / Anthropic / Google key. Off disables enrichment."
          control={
            <Select
              value={provider.kind}
              onValueChange={(v) =>
                void persistProvider({
                  ...provider,
                  kind: v as AiProviderConfig["kind"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="local">Local (Ollama)</SelectItem>
                <SelectItem value="gateway">Vercel AI Gateway</SelectItem>
                <SelectItem value="direct">Direct provider key</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {provider.kind === "local" ? (
          <>
            <Row
              label="Base URL"
              description="OpenAI-compatible endpoint. Default works with a local Ollama install."
              control={
                <Input
                  size="sm"
                  value={provider.baseUrl}
                  onChange={(e) =>
                    void persistProvider({
                      ...provider,
                      baseUrl: e.target.value,
                    })
                  }
                />
              }
            />
            <Row
              label="Status"
              description={
                ollama === null
                  ? "Probing…"
                  : ollama.ok
                    ? `Local server reachable (${ollama.modelCount ?? "?"} models)`
                    : "Couldn't reach the configured endpoint. Is Ollama running? `ollama serve`"
              }
              control={
                <span aria-live="polite">
                  {ollama === null ? "…" : ollama.ok ? "Connected" : "Offline"}
                </span>
              }
            />
          </>
        ) : null}
        {isCloud ? (
          <StackedRow
            label="API key"
            description={
              provider.kind === "gateway"
                ? "Paste your Vercel AI Gateway key. Stored in the OS keychain."
                : "Paste your OpenAI / Anthropic / Google API key. Stored in the OS keychain."
            }
          >
            <Input
              type="password"
              size="sm"
              placeholder="sk-…"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
            />
            <Button size="sm" onClick={saveAiKey} disabled={busy}>
              Save
            </Button>
          </StackedRow>
        ) : null}
      </SettingsCard>

      {!isOff ? (
        <SettingsCard title="Models">
          <Row
            label="Vision"
            description="Caption + alt-text + tags + classify + OCR in a single call."
            control={
              <Input
                size="sm"
                value={provider.models.vision}
                onChange={(e) =>
                  void persistProvider({
                    ...provider,
                    models: { ...provider.models, vision: e.target.value },
                  })
                }
              />
            }
          />
          <Row
            label="Summary"
            description="Used for article summaries. Smaller text-only models work fine."
            control={
              <Input
                size="sm"
                value={provider.models.summary}
                onChange={(e) =>
                  void persistProvider({
                    ...provider,
                    models: { ...provider.models, summary: e.target.value },
                  })
                }
              />
            }
          />
        </SettingsCard>
      ) : null}

      {!isOff ? (
        <SettingsCard title="Privacy">
          <Row
            label="Send images to provider"
            description="Cloud tiers only. Local always sends bytes locally. Off keeps text enrichment without ever uploading pixels."
            control={
              <Switch
                checked={provider.sendImages}
                onCheckedChange={(v) =>
                  void persistProvider({ ...provider, sendImages: v })
                }
                disabled={provider.kind === "local"}
              />
            }
          />
          {isCloud ? (
            <Row
              label="Daily budget (USD)"
              description="Soft cap. Cloud providers will not be called once today's usage exceeds this number. Empty = unlimited."
              control={
                <Input
                  size="sm"
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
              }
            />
          ) : null}
        </SettingsCard>
      ) : null}

      {settings ? (
        <SettingsCard title="Autonomy">
          <Row
            label="Mode"
            description="Suggest = AI drops results in the inbox for review. Auto = writes land directly on the save (still revertable from the inbox)."
            control={
              <Select
                value={settings.aiAutonomy.tagging}
                onValueChange={(v) => void setAutonomy(v as AiAutonomy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="suggest">Suggest</SelectItem>
                  <SelectItem value="auto-apply">Auto-apply tags</SelectItem>
                  <SelectItem value="auto">Auto (all fields)</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </SettingsCard>
      ) : null}

      {!isOff ? (
        <SettingsCard title="Agent personalization">
          <Row
            label="Tone"
            description="Default tone the worker uses when generating captions, summaries, and alt-text."
            control={
              <Select
                value={personality.tone}
                onValueChange={(v) =>
                  patchPersonality({ tone: v as typeof personality.tone })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                  <SelectItem value="terse">Terse</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <Row
            label="Tag style"
            description="Casing rule the model follows when proposing tags."
            control={
              <Select
                value={personality.tagStyle}
                onValueChange={(v) =>
                  patchPersonality({
                    tagStyle: v as typeof personality.tagStyle,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kebab">kebab-case</SelectItem>
                  <SelectItem value="snake">snake_case</SelectItem>
                  <SelectItem value="natural">Natural language</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <StackedRow
            label="System prompt addition"
            description="Optional free-text guidance prepended to every prompt. Leave blank for the defaults."
          >
            <textarea
              rows={4}
              value={personality.systemPrompt}
              onChange={(e) =>
                patchPersonality({ systemPrompt: e.target.value })
              }
              style={{
                width: "100%",
                padding: 8,
                font: "inherit",
                fontSize: 12,
                resize: "vertical",
                background: "var(--pond-bg-subtle)",
                color: "var(--pond-fg)",
                border: "1px solid var(--pond-border)",
                borderRadius: 8,
              }}
              placeholder="e.g. Always favour British English spelling."
            />
          </StackedRow>
        </SettingsCard>
      ) : null}

      <SettingsCard title="Pipeline">
        <Row
          label="Status"
          description={
            status
              ? `${status.pending} pending · ${status.running} running · ${status.done} done · ${status.error} errored`
              : "Loading…"
          }
          control={
            <Button size="sm" onClick={backfill} disabled={busy}>
              Run backfill
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
