import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
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
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

/**
 * Local HTTP server (the same one the browser extension talks to).
 * Restarts whenever port / bind changes; allowed origins flow into
 * the CORS check in `apps/desktop/src/main/http/server.ts`.
 *
 * Bind defaults to loopback. Switching to LAN exposes the API on
 * 0.0.0.0 — useful for capturing into Pond from another device on
 * your network, but the user has to opt in explicitly.
 */
export function ApiSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("api");
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
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
        description: `Listening on http://${r.host}:${r.port}/api/v2/`,
        type: "success",
      });
    } finally {
      setBusy(false);
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
    if (prefs.allowedOrigins.includes(v)) {
      setOrigin("");
      return;
    }
    patch({ allowedOrigins: [...prefs.allowedOrigins, v] });
    setOrigin("");
  }

  function removeOrigin(value: string) {
    patch({
      allowedOrigins: prefs.allowedOrigins.filter((x) => x !== value),
    });
  }

  return (
    <SectionStack>
      <SectionHeader
        title="API"
        description="Programmatic access to your library. The browser extension and any third-party tooling go through this server."
      />

      <SettingsCard title="Local HTTP server">
        <Row
          label="Port"
          description="Local TCP port the API listens on. Restart applies the change."
          control={
            <Input
              size="sm"
              type="number"
              value={String(prefs.port)}
              onChange={(e) =>
                patch({
                  port: Math.max(
                    1,
                    Math.min(65535, Number(e.target.value) || 41610),
                  ),
                })
              }
              style={{ width: 96 }}
            />
          }
        />
        <Row
          label="Bind address"
          description="Loopback restricts the server to this machine. LAN exposes it on 0.0.0.0 for other devices on the same network."
          control={
            <Select
              value={prefs.bindAddress}
              onValueChange={(v) =>
                patch({ bindAddress: v as "loopback" | "lan" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loopback">Loopback (127.0.0.1)</SelectItem>
                <SelectItem value="lan">LAN (0.0.0.0)</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Apply"
          description="Closes and restarts the server with the current port + bind."
          control={
            <Button size="sm" onClick={applyServer} disabled={busy}>
              {busy ? "Restarting…" : "Restart server"}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Authentication">
        <Row
          label="Ingest token"
          description={
            token
              ? `Bearer token presented by every API request. Click rotate to invalidate the old one.`
              : "No token set yet."
          }
          control={
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
          }
        />
      </SettingsCard>

      <SettingsCard title="CORS allow-list">
        <StackedRow
          label="Additional origins"
          description="Origins beyond chrome-extension://, moz-extension://, and localhost. Trailing * is allowed (e.g. https://*.example.com)."
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {prefs.allowedOrigins.map((o) => (
              <span
                key={o}
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
                {o}
                <button
                  type="button"
                  aria-label={`Remove ${o}`}
                  onClick={() => removeOrigin(o)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--pond-fg-soft)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <Input
              size="sm"
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
        </StackedRow>
      </SettingsCard>
    </SectionStack>
  );
}
