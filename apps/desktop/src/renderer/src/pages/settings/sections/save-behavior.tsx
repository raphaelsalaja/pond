import { useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import { Button, Input, Switch } from "../../../ui";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

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
    <SectionStack>
      <SectionHeader
        title="Save behavior"
        description="Defaults Pond applies whenever a new save lands."
      />

      <SettingsCard title="Defaults">
        <Row
          label="Auto-tag new saves"
          description="Run AI tagging on every incoming save. Off keeps the lightweight palette + reading-time jobs running."
          control={
            <Switch
              checked={prefs.autoTag}
              onCheckedChange={(v) => patch({ autoTag: v })}
            />
          }
        />
        <Row
          label="Deduplicate by URL"
          description="When a re-bookmark misses on (source, sourceId), also try an exact URL match before creating a new save."
          control={
            <Switch
              checked={prefs.dedupeByUrl}
              onCheckedChange={(v) => patch({ dedupeByUrl: v })}
            />
          }
        />

        <StackedRow
          label="Default tags"
          description="Applied to every new save before any AI runs. Type a tag and press Enter."
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {prefs.defaultTags.map((t) => (
              <span
                key={t}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: "var(--pond-bg-subtle)",
                  border: "1px solid var(--pond-border)",
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
                    color: "var(--pond-fg-soft)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <Input
              size="sm"
              placeholder="Add tag…"
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
        </StackedRow>
      </SettingsCard>
    </SectionStack>
  );
}
