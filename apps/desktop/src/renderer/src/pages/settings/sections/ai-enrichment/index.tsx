import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { useAiProvider } from "@/pool/ai-provider";
import { usePrefs } from "@/pool/prefs";
import {
  type AiAutonomy,
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
} from "../_types";

interface EnrichStatus {
  pending: number;
  running: number;
  done: number;
  error: number;
}

export function AiEnrichmentSection() {
  const toast = useToast();
  const { provider } = useAiProvider();
  const [personality, patchPersonality] = usePrefs("aiPersonality");
  const [captions, patchCaptions] = usePrefs("captions");
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [status, setStatus] = useState<EnrichStatus | null>(null);
  const [busy, setBusy] = useState(false);

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
    void (window.pond.query("settings.get", {}) as Promise<SettingsRow>).then(
      (s) => {
        setSettings({
          ...s,
          videoDownload: s.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
        });
      },
    );
    void refreshStatus();
    const handle = setInterval(refreshStatus, 4000);
    return () => clearInterval(handle);
  }, [refreshStatus]);

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

  const isOff = provider.kind === "off";

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Enrichment</Settings.Title>
        <Settings.Description>
          What the model does to each save after it lands.
        </Settings.Description>
      </Settings.Header>

      {settings ? (
        <Settings.Section>
          <Settings.SectionTitle>Autonomy</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Mode</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Suggest queues review; Auto writes straight to the save.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Select.Root
                  value={settings.aiAutonomy.tagging}
                  onValueChange={(v) => void setAutonomy(v as AiAutonomy)}
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
                        <Select.Item value="off">Off</Select.Item>
                        <Select.Item value="suggest">Suggest</Select.Item>
                        <Select.Item value="auto-apply">
                          Auto-Apply Tags
                        </Select.Item>
                        <Select.Item value="auto">
                          Auto (All Fields)
                        </Select.Item>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
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
                    <Select.Icon>
                      <IconChevronExpandYOutline12 />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner sideOffset={6}>
                      <Select.Popup>
                        <Select.Item value="neutral">Neutral</Select.Item>
                        <Select.Item value="playful">Playful</Select.Item>
                        <Select.Item value="terse">Terse</Select.Item>
                        <Select.Item value="academic">Academic</Select.Item>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
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
                    <Select.Icon>
                      <IconChevronExpandYOutline12 />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner sideOffset={6}>
                      <Select.Popup>
                        <Select.Item value="kebab">kebab-case</Select.Item>
                        <Select.Item value="snake">snake_case</Select.Item>
                        <Select.Item value="natural">
                          Natural Language
                        </Select.Item>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>

          <Settings.ItemDetails>
            <Settings.ItemTitle>System Prompt Addition</Settings.ItemTitle>
            <Settings.ItemDescription>
              Prepended to every prompt. Leave blank for the defaults.
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
        <Settings.SectionTitle>Captions</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Image Alt Text</Settings.ItemTitle>
              <Settings.ItemDescription>
                Alt text on import. Shared with Media › Photos.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={captions.autoAltText}
                onCheckedChange={(v) => patchCaptions({ autoAltText: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Video Transcripts</Settings.ItemTitle>
              <Settings.ItemDescription>
                Transcribe videos. Shared with Media › Videos.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={captions.videoTranscripts}
                onCheckedChange={(v) => patchCaptions({ videoTranscripts: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Language</Settings.ItemTitle>
              <Settings.ItemDescription>
                BCP-47 hint for vision and transcription.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input
                data-size="sm"
                value={captions.language}
                onChange={(e) => patchCaptions({ language: e.target.value })}
                style={{ width: 96 }}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

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
    </Settings.Page>
  );
}
