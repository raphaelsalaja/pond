import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { Button, Input, Select, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

const RAYCAST_SNIPPET = `#!/usr/bin/env osascript
# @raycast.title Save to Pond
# @raycast.argument1 { "type": "text", "placeholder": "URL" }
on run argv
  open location ("pond://capture?url=" & item 1 of argv)
end run`;

export function AutomationSection() {
  const toast = useToast();
  const [apiPrefs, patchApi] = usePrefs("api");
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [apiBusy, setApiBusy] = useState(false);

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

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.add({ title: `${label} copied`, type: "success" });
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Automation</Settings.Title>
        <Settings.Description>
          Wire Pond into Raycast, Shortcuts, scripts, and HTTP clients.
        </Settings.Description>
      </Settings.Header>

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
              <Input
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
                Loopback stays local; LAN exposes the server to your network.
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
                  <Select.Icon>
                    <IconChevronExpandYOutline12 />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={6}>
                    <Select.Popup>
                      <Select.Item value="loopback">
                        Loopback (127.0.0.1)
                      </Select.Item>
                      <Select.Item value="lan">LAN (0.0.0.0)</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
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
                  ? "Bearer token presented by every API request."
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
            Extra origins allowed beyond extensions and localhost.
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
          <Input
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
            Paste into a Raycast script to capture from anywhere.
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
                Open URL action set to <code>pond://capture?url=…</code>.
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
    </Settings.Page>
  );
}
