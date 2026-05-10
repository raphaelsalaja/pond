import { Button, Input, Switch } from "@pond/ui";
import { useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

/**
 * Save behavior. The ingest pipeline (`apps/desktop/src/main/core/
 * ingest.ts`) reads `prefs.saveBehavior.dedupeByUrl` to decide
 * whether to also match by URL when `(source, sourceId)` misses,
 * and applies `defaultTags` to every newly-created save before any
 * AI runs.
 *
 * `autoTag` is honoured by the enrichment worker — when off it
 * skips the AI tag job for incoming saves but still runs the
 * cheap, always-local jobs (palette extraction).
 */
export function SaveBehaviorSection() {
  const [prefs, patch] = usePrefs("saveBehavior");
  const [chip, setChip] = useState("");

  function addTag() {
    const value = chip.trim();
    if (!value) return;
    if (prefs.defaultTags.includes(value)) {
      setChip("");
      return;
    }
    patch({ defaultTags: [...prefs.defaultTags, value] });
    setChip("");
  }

  function removeTag(t: string) {
    patch({ defaultTags: prefs.defaultTags.filter((x) => x !== t) });
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Save Behavior</Settings.Title>
        <Settings.Description>
          Defaults applied to every new save.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Defaults</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Auto-Tag New Saves</Settings.ItemTitle>
              <Settings.ItemDescription>
                Run AI tagging on every incoming save. Palette and reading-time
                jobs always run.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.autoTag}
                onCheckedChange={(v) => patch({ autoTag: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Deduplicate by URL</Settings.ItemTitle>
              <Settings.ItemDescription>
                On a re-bookmark miss for <code>(source, sourceId)</code>, match
                by exact URL before creating a new save.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.dedupeByUrl}
                onCheckedChange={(v) => patch({ dedupeByUrl: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Default Tags</Settings.ItemTitle>
              <Settings.ItemDescription>
                Applied to every new save before any AI runs. Press Enter to
                add.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {prefs.defaultTags.map((t) => (
                  <span
                    key={t}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      background: "var(--ds-gray-2)",
                      border: "1px solid var(--ds-gray-a4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--ds-gray-11)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <Input.Root
                  data-size="sm"
                  placeholder="Add Tag…"
                  value={chip}
                  onChange={(e) => setChip(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  style={{ flex: 1, minWidth: 120 }}
                />
                <Button size="sm" onClick={addTag}>
                  Add
                </Button>
              </div>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
