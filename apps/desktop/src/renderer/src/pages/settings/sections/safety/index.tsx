import { Button, Switch, useToast } from "@pond/ui";
import { useEffect, useMemo, useState } from "react";
import { InlineRow } from "@/components/inline-row";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";
import type { SafetyScanStatusWire } from "../../../../../../preload";
import styles from "./styles.module.css";

const IDLE_STATUS: SafetyScanStatusWire = {
  state: "idle",
  total: 0,
  current: 0,
  scored: 0,
  skipped: 0,
  startedAt: null,
  finishedAt: null,
};

export function SafetySection() {
  const toast = useToast();
  const [safety, patch] = usePrefs("safety");
  const [status, setStatus] = useState<SafetyScanStatusWire>(IDLE_STATUS);

  useEffect(() => {
    let cancelled = false;
    void window.pond.safetyScanStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    const off = window.pond.onSafetyScanStatus((s) => setStatus(s));
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const running = status.state === "running";
  const pct = useMemo(() => {
    if (status.total === 0) return 0;
    return Math.min(100, Math.round((status.current / status.total) * 100));
  }, [status.total, status.current]);

  async function startScan() {
    const res = await window.pond.safetyScanStart();
    if (res.ok) {
      toast.add({
        title: `Scoring ${res.total} save${res.total === 1 ? "" : "s"}`,
        description: "Progress streams here; leaving the page is fine.",
        type: "success",
      });
      return;
    }
    if (res.reason === "no_saves") {
      toast.add({
        title: "Nothing to score",
        description: "Every save in your library already has a result.",
        type: "info",
      });
      return;
    }
    toast.add({
      title: "Scan already running",
      description: "Wait for the current run to finish or cancel it first.",
      type: "info",
    });
  }

  async function cancelScan() {
    await window.pond.safetyScanCancel();
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Safety</Settings.Title>
        <Settings.Description>
          Hide sensitive content behind a click-to-reveal blur. The classifier
          runs locally and never leaves your machine.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Blur</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Blur Sensitive Content</Settings.ItemTitle>
              <Settings.ItemDescription>
                Hide flagged covers across grids, the preview pane, and the
                lightbox. Reveals reset when you relaunch Pond.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={safety.blur === "on"}
                onCheckedChange={(v) => patch({ blur: v ? "on" : "off" })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          {safety.blur === "on" ? (
            <>
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Confidence Threshold</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Minimum classifier score before a cover gets blurred. Lower
                    values are more aggressive.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <div className={styles["threshold-row"]}>
                    <input
                      type="range"
                      min={30}
                      max={95}
                      step={5}
                      value={Math.round(safety.threshold * 100)}
                      onChange={(e) =>
                        patch({ threshold: Number(e.target.value) / 100 })
                      }
                      className={styles["threshold-range"]}
                      aria-label="Confidence threshold"
                    />
                    <span className={styles["threshold-value"]}>
                      {Math.round(safety.threshold * 100)}%
                    </span>
                  </div>
                </Settings.ItemControl>
              </Settings.Item>

              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Categories to Blur</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Which top-class labels actually trigger a blur. The
                    classifier reports porn, hentai, and sexy separately so you
                    can opt into the level that matches your use.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <div className={styles["checkbox-row"]}>
                    <CategoryToggle
                      label="Explicit (porn)"
                      checked={safety.categories.porn}
                      onChange={(v) =>
                        patch({
                          categories: { ...safety.categories, porn: v },
                        })
                      }
                    />
                    <CategoryToggle
                      label="Illustrated (hentai)"
                      checked={safety.categories.hentai}
                      onChange={(v) =>
                        patch({
                          categories: { ...safety.categories, hentai: v },
                        })
                      }
                    />
                    <CategoryToggle
                      label="Suggestive (sexy)"
                      checked={safety.categories.sexy}
                      onChange={(v) =>
                        patch({
                          categories: { ...safety.categories, sexy: v },
                        })
                      }
                    />
                  </div>
                </Settings.ItemControl>
              </Settings.Item>
            </>
          ) : null}
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Library</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Scan Existing Library</Settings.ItemTitle>
              <Settings.ItemDescription>
                {status.state === "running"
                  ? (status.message ?? "Working\u2026")
                  : status.state === "done"
                    ? (status.message ?? "Done.")
                    : status.state === "cancelled"
                      ? (status.message ?? "Cancelled.")
                      : status.state === "error"
                        ? (status.message ?? "Error.")
                        : "Run the classifier across every save that hasn't been scored yet. Safe to leave running in the background."}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <InlineRow>
                {running ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void cancelScan()}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  disabled={running}
                  onClick={() => void startScan()}
                >
                  {running
                    ? `${status.current}/${status.total}`
                    : "Scan Library"}
                </Button>
              </InlineRow>
            </Settings.ItemControl>
          </Settings.Item>

          {status.total > 0 ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Progress</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {`${status.scored} scored · ${status.skipped} skipped`}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <div className={styles.progress}>
                  <div className={styles["progress-bar"]} aria-hidden>
                    <div
                      className={styles["progress-fill"]}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span aria-live="polite">{pct}%</span>
                </div>
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}

function CategoryToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {label}
    </label>
  );
}
