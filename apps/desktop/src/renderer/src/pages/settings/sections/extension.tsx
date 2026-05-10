import { Button, Input, useToast } from "@pond/ui";
import { useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import styles from "@/pages/settings/styles.module.css";

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
        description: "Paste the new token into the extension popup.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Browser Extension</Settings.Title>
        <Settings.Description>
          Pair the browser extension so web saves land here.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Pairing Token</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemDescription>
                Paste into the extension popup on first run. Rotate to revoke
                access across every install.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div className={styles["inline-row"]}>
                <Input.Root
                  data-variant="code"
                  data-size="sm"
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
              <Settings.ItemDescription>
                Ingest endpoint:{" "}
                <code>http://127.0.0.1:41610/api/v2/item/add</code>
              </Settings.ItemDescription>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
