import { CHROME_WEB_STORE_URL, FIREFOX_ADDONS_URL } from "@pond/schema/native";
import { Button, Dialog } from "@pond/ui";
import type { SafariExtensionStatus } from "@shared/safari-extension-contracts";
import { useCallback, useEffect, useState } from "react";
import { IS_MAC } from "@/shared/lib/platform";
import styles from "./styles.module.css";

const STORES = [
  {
    name: "Chrome Web Store",
    browsers: "Chrome, Arc, Brave, and Edge",
    action: "Add to Chrome",
    url: CHROME_WEB_STORE_URL,
  },
  {
    name: "Firefox Add-ons",
    browsers: "Firefox and Zen",
    action: "Add to Firefox",
    url: FIREFOX_ADDONS_URL,
  },
];

/**
 * Safari has no store page: the extension ships inside Pond.app, so there is nothing to
 * download. Whether it runs is decided by a switch in Safari's own settings, which is why
 * this row reports state and opens Safari instead of offering an install.
 */
function safariDetail(status: SafariExtensionStatus | null): string {
  switch (status?.state) {
    case "enabled":
      return "On, in Safari 18 or later";
    case "disabled":
      return "Installed, but switched off in Safari";
    case "not_registered":
      return status.signature === "ad-hoc"
        ? "Safari ignores unsigned builds"
        : "Open Safari once to finish setting it up";
    case "not_bundled":
      return "Not included in this build";
    default:
      return "Safari 18 or later, on macOS";
  }
}

const SAFARI_STEPS = [
  "Open Safari, then Settings and Extensions.",
  "Turn on Pond.",
  "Allow it for the sites you save from, or choose Always Allow on Every Website.",
];

/** Safari only lists an ad-hoc appex once this is on, and it is off by default. */
const UNSIGNED_STEPS = [
  "Open Safari, then Settings and Advanced.",
  "Turn on Show features for web developers.",
  "In the Developer tab, turn on Allow unsigned extensions.",
  "Then turn on Pond in Extensions.",
];

export function BrowserExtensionDialog({
  open,
  onOpenChange,
  mac = IS_MAC,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mac?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [safari, setSafari] = useState<SafariExtensionStatus | null>(null);
  const [needsUnsigned, setNeedsUnsigned] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSafari(null);
      setNeedsUnsigned(false);
    }
  }

  const refreshSafari = useCallback(() => {
    if (!mac) {
      return;
    }
    void window.pond
      .query("extension.safariStatus", {})
      .then(setSafari)
      .catch(() => setSafari(null));
  }, [mac]);

  useEffect(() => {
    if (!open) {
      return;
    }
    refreshSafari();
    /** Enabling happens in Safari; re-read on return so the row updates without a reopen. */
    window.addEventListener("focus", refreshSafari);
    return () => window.removeEventListener("focus", refreshSafari);
  }, [open, refreshSafari]);

  async function openStore(url: string): Promise<void> {
    setError(null);
    const result = await window.pond.openExternal(url);
    if (!result.ok) {
      setError("Pond couldn't open the store page. Try again.");
    }
  }

  /**
   * Jumps straight to Pond in Safari's settings. When Safari refuses — which it does for a
   * build it does not list — fall back to opening Safari and explain the likely reason
   * rather than leaving the button looking broken.
   */
  async function openSafariSettings(): Promise<void> {
    setError(null);
    const result = await window.pond.query("extension.openSafariSettings", {});
    if (result.ok) return;
    setNeedsUnsigned(result.reason === "unsigned-build");
    setError(result.error);
    await window.pond.query("extension.openSafari", {});
  }

  const safariState = safari?.state ?? null;
  const safariOff =
    safariState === "disabled" || safariState === "not_registered";
  const steps = needsUnsigned
    ? UNSIGNED_STEPS
    : safariOff
      ? SAFARI_STEPS
      : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => !next && setError(null)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <div className={styles.body}>
            <Dialog.Title className={styles.title}>
              Browser Extension
            </Dialog.Title>
            <Dialog.Description>
              Save pages and images from your browser into your library.
            </Dialog.Description>
            {error ? <p className={styles.error}>{error}</p> : null}
            <ul className={styles.stores}>
              {STORES.map((store) => (
                <li key={store.name} className={styles.store}>
                  <div className={styles.text}>
                    <span className={styles.name}>{store.name}</span>
                    <span className={styles.browsers}>{store.browsers}</span>
                  </div>
                  <Button onClick={() => void openStore(store.url)}>
                    {store.action}
                  </Button>
                </li>
              ))}
              {mac ? (
                <li className={styles.store}>
                  <div className={styles.text}>
                    <span className={styles.name}>
                      Safari
                      {safariState === "enabled" ? (
                        <span className={styles.badge}>Enabled</span>
                      ) : null}
                    </span>
                    <span className={styles.browsers}>
                      {safariDetail(safari)}
                    </span>
                  </div>
                  {safariState === "enabled" ||
                  safariState === "not_bundled" ? null : (
                    <Button onClick={() => void openSafariSettings()}>
                      Open Safari Settings
                    </Button>
                  )}
                </li>
              ) : null}
            </ul>
            {steps ? (
              <ol className={styles.steps}>
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
