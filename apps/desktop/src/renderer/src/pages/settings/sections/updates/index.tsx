import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { Button, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

interface AppInfo {
  version: string;
}

export function UpdatesSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("updates");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.pond.appInfo().then((i) => setInfo(i as AppInfo));
  }, []);

  const apply = useCallback(async () => {
    await window.pond.query("updates.applyPrefs", {});
  }, []);

  const onPatch = useCallback(
    (delta: Partial<typeof prefs>) => {
      patch(delta);
      setTimeout(() => void apply(), 50);
    },
    [patch, apply],
  );

  async function checkNow() {
    setBusy(true);
    try {
      const r = (await window.pond.query("updates.checkNow", {})) as
        | { ok: true; version?: string }
        | { ok: false; reason: string };
      if (!r.ok) {
        toast.add({
          title: "Update check failed",
          description:
            r.reason === "dev_build"
              ? "Dev builds don't check the update server. Run a release build."
              : r.reason,
          type: "warning",
        });
        return;
      }
      toast.add({
        title: r.version
          ? `Update available: ${r.version}`
          : "Pond is up to date",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Updates</Settings.Title>
        <Settings.Description>
          {info
            ? `You're running Pond ${info.version}.`
            : "Pick a release channel and check for new builds."}
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Update Channel</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Channel</Settings.ItemTitle>
              <Settings.ItemDescription>
                Stable ships every few weeks. Beta gets fixes sooner.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={prefs.channel}
                onValueChange={(v) =>
                  onPatch({ channel: v as "stable" | "beta" })
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
                      <Select.Item value="stable">Stable</Select.Item>
                      <Select.Item value="beta">Beta</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Auto-Install Updates</Settings.ItemTitle>
              <Settings.ItemDescription>
                Download updates as they appear. Apply on next launch.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.autoInstall}
                onCheckedChange={(v) => onPatch({ autoInstall: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Check for Updates</Settings.ItemTitle>
              <Settings.ItemDescription>
                Ping the update server for a newer build.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={checkNow} disabled={busy}>
                {busy ? "Checking…" : "Check Now"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
