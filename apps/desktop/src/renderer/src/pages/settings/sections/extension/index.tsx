import { Button, Input, useToast } from "@pond/ui";
import { useEffect, useMemo, useState } from "react";
import { InlineRow } from "@/components/inline-row";
import { Settings } from "@/components/settings";

export function ExtensionSection() {
  const toast = useToast();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.pond
      .query("settings.ingestToken", {})
      .then((t) => setToken((t as { token: string }).token ?? ""));
  }, []);

  const pairingLink = useMemo(() => {
    if (!token) return "";
    const u = new URL("pond://pair");
    u.searchParams.set("port", "41610");
    u.searchParams.set("token", token);
    return u.toString();
  }, [token]);

  async function copy(text: string, what: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.add({ title: `Copied ${what}`, type: "success" });
  }

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
        description: "Paste the new pairing link into the extension popup.",
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
        <Settings.SectionTitle>Pairing</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Pairing link</Settings.ItemTitle>
              <Settings.ItemDescription>
                Paste into the Pond extension on first run.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <InlineRow>
                <Input
                  data-variant="code"
                  data-size="sm"
                  readOnly
                  value={pairingLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  disabled={!pairingLink}
                  onClick={() => void copy(pairingLink, "pairing link")}
                >
                  Copy link
                </Button>
              </InlineRow>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Pairing token</Settings.ItemTitle>
              <Settings.ItemDescription>
                Rotate to revoke access across every install.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <InlineRow>
                <Input
                  data-variant="code"
                  data-size="sm"
                  readOnly
                  value={token}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  disabled={busy || !token}
                  onClick={() => void copy(token, "token")}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void rotate()}
                >
                  Rotate
                </Button>
              </InlineRow>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
