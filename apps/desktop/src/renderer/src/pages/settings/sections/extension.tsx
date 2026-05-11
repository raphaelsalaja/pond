import { Button, Input, useToast } from "@pond/ui";
import { useEffect, useMemo, useState } from "react";
import { Settings } from "@/components/settings";
import { getSourceLabel, SourceBadge } from "@/components/source-badge";
import styles from "@/pages/settings/styles.module.css";
import { ALL_SOURCES } from "./_types";

/**
 * Browser-extension pairing + capture surfaces. Token rotation lives
 * here because rotating it revokes every paired install at once —
 * placing it next to the other capture-related controls keeps the
 * destructive surface close to its context.
 *
 * The popup defers all of this admin to here: it only knows how to
 * paste a `pond://pair?...` link and probe `/api/v2/library/info`.
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
                Open the Pond extension and paste this on first run. Auto-fills
                the endpoint and token in one step.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div className={styles["inline-row"]}>
                <Input.Root
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
              </div>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Pairing token</Settings.ItemTitle>
              <Settings.ItemDescription>
                The raw token. Rotate to revoke access across every install.
                Ingest endpoint:{" "}
                <code>http://127.0.0.1:41610/api/v2/item/add</code>
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
              </div>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Auto-captured Sites</Settings.SectionTitle>
        <Settings.List>
          {ALL_SOURCES.map(({ id }) => (
            <Settings.Item key={id}>
              <SourceBadge.Root source={id} data-size="md" />
              <Settings.ItemDetails>
                <Settings.ItemTitle>{getSourceLabel(id)}</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {SOURCE_HINTS[id] ?? "Auto-saved when bookmarked or liked."}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
            </Settings.Item>
          ))}
          <Settings.Item>
            <SourceBadge.Root source="article" data-size="md" />
            <Settings.ItemDetails>
              <Settings.ItemTitle>Articles</Settings.ItemTitle>
              <Settings.ItemDescription>
                Right-click any page and pick &ldquo;Save this page to
                Pond&rdquo;.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}

const SOURCE_HINTS: Record<string, string> = {
  twitter: "Bookmark or like a tweet to capture it.",
  instagram: "Save a post, reel, or bookmarked story.",
  pinterest: "Save a pin to capture it.",
  arena: "Add a block to a channel to capture it.",
  cosmos: "Add to a cluster to capture it.",
  tiktok: "Save or like a video to capture it.",
  youtube: "Add to Watch Later or like a video.",
  reddit: "Save a post to capture it.",
};
