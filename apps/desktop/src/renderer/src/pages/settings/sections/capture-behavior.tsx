import { Button, Input, Switch } from "@pond/ui";
import { useCallback, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

/**
 * Capture-time controls in one place. Splits into two sections:
 *
 *   - Menu Bar — how Pond is reachable when its window is closed
 *     (tray icon, login item). Each toggle pings
 *     `quickCapture.applyPrefs` so main re-binds without a restart.
 *   - Defaults — what the ingest pipeline does to every newly-created
 *     save before any AI runs. `autoTag` gates the AI tag job in the
 *     enrichment worker; `dedupeByUrl` is read by
 *     `apps/desktop/src/main/core/ingest.ts`; `defaultTags` are
 *     applied to the save row at create time.
 */
export function CaptureBehaviorSection() {
  const [quick, patchQuick] = usePrefs("quickCapture");
  const [save, patchSave] = usePrefs("saveBehavior");
  const [chip, setChip] = useState("");
  const [busyApply, setBusyApply] = useState(false);

  const applyQuickPrefs = useCallback(async () => {
    setBusyApply(true);
    try {
      await window.pond.query("quickCapture.applyPrefs", {});
    } finally {
      setBusyApply(false);
    }
  }, []);

  const onQuickPatch = useCallback(
    (delta: Partial<typeof quick>) => {
      patchQuick(delta);
      // Defer the re-apply so the optimistic prefs cache update lands
      // first; main reads the freshly-persisted blob.
      setTimeout(() => void applyQuickPrefs(), 50);
    },
    [patchQuick, applyQuickPrefs],
  );

  function addTag() {
    const value = chip.trim();
    if (!value) return;
    if (save.defaultTags.includes(value)) {
      setChip("");
      return;
    }
    patchSave({ defaultTags: [...save.defaultTags, value] });
    setChip("");
  }

  function removeTag(t: string) {
    patchSave({ defaultTags: save.defaultTags.filter((x) => x !== t) });
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Capture Behavior</Settings.Title>
        <Settings.Description>
          How Pond launches and what it does with each new save.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Menu Bar</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Show Menu-Bar Icon</Settings.ItemTitle>
              <Settings.ItemDescription>
                Keep Pond reachable from the system tray with the window hidden.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={quick.menuBarIcon}
                onCheckedChange={(v) => onQuickPatch({ menuBarIcon: v })}
                disabled={busyApply}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Launch at Login</Settings.ItemTitle>
              <Settings.ItemDescription>
                Start Pond when you sign in to your computer.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={quick.launchAtLogin}
                onCheckedChange={(v) => onQuickPatch({ launchAtLogin: v })}
                disabled={busyApply}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

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
                checked={save.autoTag}
                onCheckedChange={(v) => patchSave({ autoTag: v })}
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
                checked={save.dedupeByUrl}
                onCheckedChange={(v) => patchSave({ dedupeByUrl: v })}
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
                {save.defaultTags.map((t) => (
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
