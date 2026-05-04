import { useEffect, useState } from "react";
import { Button, Input, useToast } from "../../../ui";
import styles from "../styles.module.css";
import { SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Browser-extension pairing. Token rotation lives here because
 * rotating it revokes every paired install at once — placing it next
 * to other capture-related controls keeps the destructive surface
 * close to its context.
 */
export function ExtensionSection() {
  const toast = useToast();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.pond
      .query("settings.ingestToken", {})
      .then((t) => setToken((t as { token: string }).token ?? ""));
  }, []);

  async function rotate() {
    setBusy(true);
    try {
      const next = (await window.pond.query(
        "settings.rotateIngestToken",
        {},
      )) as { token: string };
      setToken(next.token);
      toast.add({
        title: "Token rotated",
        description: "Update the extension popup with the new token.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Browser extension"
        description="Pair the Pond browser extension so saves from the web land in your library."
      />

      <SettingsCard title="Pairing token">
        <div className={styles.stackedRow}>
          <span className={styles.rowDescription}>
            Paste this token into the extension popup on first run. Rotate the
            token to revoke access across all installs.
          </span>
          <div className={styles.inlineRow}>
            <Input
              variant="code"
              size="sm"
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void navigator.clipboard.writeText(token);
                toast.add({ title: "Token copied", type: "success" });
              }}
            >
              Copy
            </Button>
            <Button size="sm" disabled={busy} onClick={rotate}>
              Rotate
            </Button>
          </div>
          <span className={styles.rowDescription}>
            Ingest endpoint: <code>http://127.0.0.1:41610/api/v2/item/add</code>
          </span>
        </div>
      </SettingsCard>
    </SectionStack>
  );
}
