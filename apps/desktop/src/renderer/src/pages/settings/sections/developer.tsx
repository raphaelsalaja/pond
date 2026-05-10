import { AlertDialog, Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { reloadPrefs, usePrefs } from "@/pool/prefs";

/**
 * Developer surface. None of these are secret; they're just rarely
 * needed and so live behind the System rail group. Houses the
 * diagnostics, the local HTTP API, the `pond://` URL scheme, and the
 * destructive reset actions on a single page so the rail stays slim.
 */

const RAYCAST_SNIPPET = `#!/usr/bin/env osascript
# @raycast.title Save to Pond
# @raycast.argument1 { "type": "text", "placeholder": "URL" }
on run argv
  open location ("pond://capture?url=" & item 1 of argv)
end run`;

export function DeveloperSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("developer");
  const [apiPrefs, patchApi] = usePrefs("api");
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState<string | null>(null);
  const [confirmFactory, setConfirmFactory] = useState(false);

  const apply = useCallback(
    async (next: boolean) => {
      patch({ verboseLogging: next });
      await window.pond.query("developer.applyVerboseLogging", {
        verbose: next,
      });
    },
    [patch],
  );

  async function openLogs() {
    await window.pond.query("developer.openLogs", {});
  }

  async function openInspector() {
    const r = (await window.pond.query("developer.openIpcInspector", {})) as {
      ok: boolean;
      reason?: string;
    };
    if (!r.ok && r.reason) {
      toast.add({
        title: "Inspector failed",
        description: r.reason,
        type: "error",
      });
    }
  }

  /* ----------------------------- API ----------------------------- */

  const loadToken = useCallback(async () => {
    const r = (await window.pond.query("settings.ingestToken", {})) as {
      token?: string | null;
    };
    setToken(r?.token ?? null);
  }, []);

  useEffect(() => {
    void loadToken();
  }, [loadToken]);

  async function applyServer() {
    setApiBusy(true);
    try {
      const r = (await window.pond.query("api.restart", {})) as
        | { ok: true; port: number; host: string }
        | { ok: false; reason: string };
      if (!r.ok) {
        toast.add({
          title: "Couldn't restart API",
          description: r.reason,
          type: "error",
        });
        return;
      }
      toast.add({
        title: "API restarted",
        description: `Listening on http://${r.host}:${r.port}/api/v2/.`,
        type: "success",
      });
    } finally {
      setApiBusy(false);
    }
  }

  async function rotateToken() {
    await window.pond.query("settings.rotateIngestToken", {});
    await loadToken();
    toast.add({ title: "Ingest token rotated", type: "success" });
  }

  function addOrigin() {
    const v = origin.trim();
    if (!v) return;
    if (apiPrefs.allowedOrigins.includes(v)) {
      setOrigin("");
      return;
    }
    patchApi({ allowedOrigins: [...apiPrefs.allowedOrigins, v] });
    setOrigin("");
  }

  function removeOrigin(value: string) {
    patchApi({
      allowedOrigins: apiPrefs.allowedOrigins.filter((x) => x !== value),
    });
  }

  /* --------------------------- URL scheme ------------------------ */

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.add({ title: `${label} copied`, type: "success" });
  }

  /* ------------------------------ Reset -------------------------- */

  async function clearVideoCache() {
    setResetBusy("video");
    try {
      const r = (await window.pond.query("reset.clearVideoCache", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Video cache cleared",
        description: `${r.removed}\u00A0files removed.`,
        type: "success",
      });
    } finally {
      setResetBusy(null);
    }
  }

  async function clearThumbnails() {
    setResetBusy("thumbs");
    try {
      const r = (await window.pond.query("reset.clearThumbnails", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Thumbnails cleared",
        description: `${r.removed}\u00A0files removed.`,
        type: "success",
      });
    } finally {
      setResetBusy(null);
    }
  }

  async function resetPreferences() {
    setResetBusy("prefs");
    try {
      await window.pond.query("reset.preferences", {});
      await reloadPrefs();
      toast.add({ title: "Preferences reset to defaults", type: "success" });
    } finally {
      setResetBusy(null);
    }
  }

  async function factoryReset() {
    setResetBusy("factory");
    try {
      await window.pond.query("reset.factory", {});
      toast.add({
        title: "Pond will relaunch",
        description:
          "Index wiped. Restart Pond to rebuild from your library files.",
        type: "warning",
      });
    } finally {
      setResetBusy(null);
      setConfirmFactory(false);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Developer</Settings.Title>
        <Settings.Description>
          Logs, the local API, the <code>pond://</code> scheme, and reset
          actions.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Diagnostics</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Open Log Directory</Settings.ItemTitle>
              <Settings.ItemDescription>
                Reveal electron-log files in your file manager.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => void openLogs()}>
                Reveal
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Verbose Logging</Settings.ItemTitle>
              <Settings.ItemDescription>
                Capture every IPC call and executor transaction. Slows Pond
                down.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.verboseLogging}
                onCheckedChange={(v) => void apply(v)}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Open IPC Inspector</Settings.ItemTitle>
              <Settings.ItemDescription>
                A read-only view of recent IPC traffic. The log file stays the
                canonical transcript.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => void openInspector()}>
                Open Inspector
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Local HTTP Server</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Port</Settings.ItemTitle>
              <Settings.ItemDescription>
                The TCP port the API listens on. Applied on restart.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input.Root
                data-size="sm"
                type="number"
                value={String(apiPrefs.port)}
                onChange={(e) =>
                  patchApi({
                    port: Math.max(
                      1,
                      Math.min(65535, Number(e.target.value) || 41610),
                    ),
                  })
                }
                style={{ width: 96 }}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Bind Address</Settings.ItemTitle>
              <Settings.ItemDescription>
                Loopback keeps the server on this machine. LAN exposes it on{" "}
                <code>0.0.0.0</code> for other devices on the same network.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={apiPrefs.bindAddress}
                onValueChange={(v) =>
                  patchApi({ bindAddress: v as "loopback" | "lan" })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="loopback">
                    Loopback (127.0.0.1)
                  </Select.Item>
                  <Select.Item value="lan">LAN (0.0.0.0)</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Apply</Settings.ItemTitle>
              <Settings.ItemDescription>
                Restart the server with the current port and bind address.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={applyServer} disabled={apiBusy}>
                {apiBusy ? "Restarting…" : "Restart Server"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>API Authentication</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Ingest Token</Settings.ItemTitle>
              <Settings.ItemDescription>
                {token
                  ? "Bearer token presented by every API request. Rotate to invalidate the old one."
                  : "No token set yet."}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  size="sm"
                  onClick={() => {
                    if (token) void navigator.clipboard.writeText(token);
                    toast.add({ title: "Token copied", type: "success" });
                  }}
                  disabled={!token}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void rotateToken()}
                >
                  Rotate
                </Button>
              </div>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>CORS Allow-List</Settings.SectionTitle>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Additional Origins</Settings.ItemTitle>
          <Settings.ItemDescription>
            Origins beyond <code>chrome-extension://</code>,{" "}
            <code>moz-extension://</code>, and <code>localhost</code>. A
            trailing <code>*</code> works for patterns like{" "}
            <code>https://*.example.com</code>.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {apiPrefs.allowedOrigins.map((o) => (
            <span
              key={o}
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
              {o}
              <button
                type="button"
                aria-label={`Remove ${o}`}
                onClick={() => removeOrigin(o)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--ds-gray-11)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <Input.Root
            data-size="sm"
            placeholder="https://example.com"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOrigin();
              }
            }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Button size="sm" onClick={addOrigin}>
            Add
          </Button>
        </div>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>URL Scheme</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                <code>pond://item/&lt;id&gt;</code>
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Open the matching save in the library window.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                onClick={() => copy("pond://item/<id>", "Item URL")}
              >
                Copy
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                <code>pond://search?q=…</code>
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Open the library with the search bar pre-filled.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                onClick={() => copy("pond://search?q=design", "Search URL")}
              >
                Copy
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                <code>pond://capture?url=…</code>
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Open the quick-capture sheet pre-loaded with the URL.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                onClick={() =>
                  copy("pond://capture?url=https://example.com", "Capture URL")
                }
              >
                Copy
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Raycast</Settings.SectionTitle>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Save-to-Pond Script</Settings.ItemTitle>
          <Settings.ItemDescription>
            Paste into a new Raycast script command to trigger the capture URL
            with the typed argument.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <pre
          style={{
            width: "100%",
            margin: 0,
            padding: 12,
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.5,
            overflow: "auto",
            background: "var(--ds-gray-2)",
            border: "1px solid var(--ds-gray-a4)",
            color: "var(--ds-gray-12)",
          }}
        >
          {RAYCAST_SNIPPET}
        </pre>
        <div>
          <Button size="sm" onClick={() => copy(RAYCAST_SNIPPET, "Snippet")}>
            Copy Snippet
          </Button>
        </div>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Apple Shortcuts</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                Add a Save-to-Pond Shortcut
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Add a single Open URL action set to{" "}
                <code>pond://capture?url=Shortcut Input</code>.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                onClick={() => copy("pond://capture?url=", "URL prefix")}
              >
                Copy URL Prefix
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Caches</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Clear Video Cache</Settings.ItemTitle>
              <Settings.ItemDescription>
                Delete every downloaded MP4 in{" "}
                <code>&lt;library&gt;/_video_cache/</code>. Posters and metadata
                stay so videos can be re-downloaded.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void clearVideoCache()}
                disabled={resetBusy === "video"}
              >
                {resetBusy === "video" ? "Clearing…" : "Clear Cache"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Clear Thumbnails</Settings.ItemTitle>
              <Settings.ItemDescription>
                Delete every cached preview tile under{" "}
                <code>&lt;library&gt;/_thumbs/</code>.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void clearThumbnails()}
                disabled={resetBusy === "thumbs"}
              >
                {resetBusy === "thumbs" ? "Clearing…" : "Clear Thumbnails"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Reset Preferences</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Reset Preferences</Settings.ItemTitle>
              <Settings.ItemDescription>
                Restore every Settings knob to its default. Saves, tags, and AI
                provider config stay untouched.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void resetPreferences()}
                disabled={resetBusy === "prefs"}
              >
                {resetBusy === "prefs" ? "Resetting…" : "Reset"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Danger Zone</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Factory Reset</Settings.ItemTitle>
              <Settings.ItemDescription>
                Drop the SQLite index and prefs blob. Pond rebuilds from the
                metadata.json files on next launch.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <AlertDialog.Root
                open={confirmFactory}
                onOpenChange={setConfirmFactory}
              >
                <AlertDialog.Trigger
                  render={<Button variant="danger">Factory Reset…</Button>}
                />
                <AlertDialog.Content>
                  <AlertDialog.Title>Factory Reset?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This wipes the SQLite index and prefs. Saves on disk stay
                    put. You'll see onboarding on next launch.
                  </AlertDialog.Description>
                  <AlertDialog.Actions>
                    <AlertDialog.Close
                      render={<Button variant="ghost">Cancel</Button>}
                    />
                    <AlertDialog.Close
                      render={
                        <Button
                          variant="danger"
                          disabled={resetBusy === "factory"}
                          onClick={(e) => {
                            e.preventDefault();
                            void factoryReset();
                          }}
                        >
                          {resetBusy === "factory"
                            ? "Resetting…"
                            : "Wipe & Restart"}
                        </Button>
                      }
                    />
                  </AlertDialog.Actions>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
