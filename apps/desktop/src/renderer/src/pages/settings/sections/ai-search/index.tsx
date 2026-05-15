import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useState } from "react";
import { Settings } from "@/components/settings";
import { useAiProvider } from "@/pool/ai-provider";
import { usePrefs } from "@/pool/prefs";

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

export function AiSearchSection() {
  const toast = useToast();
  const { provider, patchProvider, ready } = useAiProvider();
  const [searchPrefs, patchSearch] = usePrefs("search");
  const [busy, setBusy] = useState(false);

  const reembed = useCallback(async () => {
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
    } catch (err) {
      toast.add({
        title: "Re-embed failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const isOff = provider.kind === "off";

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Search & Embeddings</Settings.Title>
        <Settings.Description>
          How queries blend full-text and vector recall.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Search</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Hybrid Search</Settings.ItemTitle>
              <Settings.ItemDescription>
                Blend SQLite FTS with vector embeddings for better recall.
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
                Max rows per search. Lower is snappier on big libraries.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input
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

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Embeddings</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Embedding Model</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Preset for known dims, or Custom for self-hosted.
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
                    patchProvider({
                      models: { ...provider.models, embedding: raw },
                      embeddingDim: preset.dim,
                    });
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Icon>
                      <IconChevronExpandYOutline12 />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner sideOffset={6}>
                      <Select.Popup>
                        {Object.entries(EMBEDDING_PRESETS).map(([k, v]) => (
                          <Select.Item value={k} key={k}>
                            {v.label}
                          </Select.Item>
                        ))}
                        <Select.Item value="custom">Custom…</Select.Item>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Model Identifier</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Exact model name sent to the provider.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input
                  data-size="sm"
                  value={provider.models.embedding}
                  onChange={(e) =>
                    patchProvider({
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
                  Must match the model's output dimension.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input
                  data-size="sm"
                  type="number"
                  value={String(provider.embeddingDim)}
                  onChange={(e) =>
                    patchProvider({
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
                  Recreate <code>saves_vec</code> and re-embed every save.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void reembed()}
                  disabled={busy || !ready}
                >
                  {busy ? "Working…" : "Re-Embed"}
                </Button>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}
    </Settings.Page>
  );
}
