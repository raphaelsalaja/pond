import { Button, Dialog, Settings, Tooltip } from "@pond/ui";
import { useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";

export function RaycastRow() {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyToken() {
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      const { token } = await window.pond.query("settings.ingestToken", {});
      if (!token) {
        throw new Error("Couldn't read the Local API Token. Try again.");
      }
      const result = await window.pond.query("clipboard.writeText", {
        text: token,
      });
      if (!result.ok) throw new Error("Couldn't copy the token. Try again.");
      setCopied(true);
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't copy the token. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken() {
    setBusy(true);
    setCopied(false);
    setError(null);
    try {
      const { token } = await window.pond.query(
        "settings.rotateIngestToken",
        {},
      );
      const result = await window.pond.query("clipboard.writeText", {
        text: token,
      });
      if (!result.ok) {
        throw new Error("Couldn't copy the new token. Try again.");
      }
      setCopied(true);
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't rotate the token. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>
          Raycast
          <Tooltip.Info
            label="It connects the Raycast extension to Pond's local API."
            aria-label="About Raycast"
          />
        </Settings.ItemTitle>
        <Settings.ItemDescription>
          Treat the token like a password.
          {error ? (
            <>
              <br />
              <span role="alert">{error}</span>
            </>
          ) : null}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          loading={busy}
          onClick={() => void copyToken()}
        >
          {copied ? "Copied" : "Copy Token"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            Dialog.confirm({
              title: "Rotate Local API Token",
              description:
                "Existing local integrations stop working until you give them the new token.",
              confirmLabel: "Rotate",
              onConfirm: rotateToken,
            })
          }
        >
          Rotate Token
        </Button>
      </Settings.ItemControl>
    </>
  );
}
