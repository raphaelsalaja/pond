import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

interface ProviderState {
  kind: "off" | "local" | "gateway" | "direct";
  baseUrl: string;
  models: { vision: string; summary: string; embedding: string };
  embeddingDim: number;
  dailyBudgetUsd: number | null;
  sendImages: boolean;
}

/**
 * Embeddings page — extracted from the AI page so the destructive
 * "Re-embed library" button stands alone. Picks the model + dim and
 * exposes the rebuild action; the model picker doubles as the
 * canonical source for `provider.models.embedding`.
 *
 * The vector index dim has to agree with whatever the model produces
 * — we ship presets so users don't have to remember the magic
 * numbers, but the field is still editable for self-hosted models.
 */
const PRESETS: Record<string, { dim: number; label: string }> = {
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

export function EmbeddingsSection() {
  const toast = useToast();
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const settings = (await window.pond.query("settings.get", {})) as {
      aiProvider?: ProviderState;
    };
    if (settings?.aiProvider) {
      setProvider(settings.aiProvider);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persist(next: ProviderState) {
    setProvider(next);
    await window.pond.query("settings.setAiProvider", next);
  }

  async function reembed() {
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

  if (!provider) {
    return (
      <SectionStack>
        <SectionHeader
          title="Embeddings"
          description="Vector search across your library — pick the model and rebuild the index."
        />
      </SectionStack>
    );
  }

  const presetEntries = Object.entries(PRESETS);
  const isPreset = presetEntries.some(([k]) => k === provider.models.embedding);

  return (
    <SectionStack>
      <SectionHeader
        title="Embeddings"
        description="Vector search across your library — pick the model and rebuild the index."
      />

      <SettingsCard title="Index">
        <Row
          label="Embedding model"
          description="Pick a preset for known dims or choose Custom for a self-hosted endpoint."
          control={
            <Select
              value={isPreset ? provider.models.embedding : "custom"}
              onValueChange={(raw) => {
                if (typeof raw !== "string" || raw === "custom") return;
                const preset = PRESETS[raw];
                if (!preset) return;
                void persist({
                  ...provider,
                  models: { ...provider.models, embedding: raw },
                  embeddingDim: preset.dim,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetEntries.map(([k, v]) => (
                  <SelectItem value={k} key={k}>
                    {v.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Model identifier"
          description="The exact model name passed to the provider's `model` field."
          control={
            <Input
              size="sm"
              value={provider.models.embedding}
              onChange={(e) =>
                void persist({
                  ...provider,
                  models: { ...provider.models, embedding: e.target.value },
                })
              }
            />
          }
        />
        <Row
          label="Vector dim"
          description="Must agree with the chosen model's output. Mismatched dims cause an empty saves_vec on next launch."
          control={
            <Input
              size="sm"
              type="number"
              value={String(provider.embeddingDim)}
              onChange={(e) =>
                void persist({
                  ...provider,
                  embeddingDim: Number.parseInt(e.target.value, 10) || 768,
                })
              }
            />
          }
        />
        <Row
          label="Re-embed library"
          description="Drops saves_vec, recreates it at the configured dim, and re-runs the embed job for every save. Destructive — but the bytes on disk stay put."
          control={
            <Button
              size="sm"
              variant="danger"
              onClick={reembed}
              disabled={busy}
            >
              {busy ? "Working…" : "Re-embed"}
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
