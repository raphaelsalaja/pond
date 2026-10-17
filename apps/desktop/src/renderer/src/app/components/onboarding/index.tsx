import { Button, Dialog } from "@pond/ui";
import { useState } from "react";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { Demo } from "./demo";
import styles from "./styles.module.css";

const KEY = "pond:onboarding:2026";

function firstRun(): boolean {
  try {
    return localStorage.getItem(KEY) !== "complete";
  } catch {
    return false;
  }
}

export function Onboarding({
  preview = false,
  onClose,
}: {
  preview?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(() => preview || firstRun());
  const finish = () => {
    if (!preview) {
      try {
        localStorage.setItem(KEY, "complete");
      } catch {}
    }
    setOpen(false);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !next && finish()}
      onOpenChangeComplete={(next) => !next && onClose?.()}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <div className={styles.hero} aria-hidden>
            <Demo />
          </div>
          <div className={styles.body}>
            <Dialog.Title className={styles.title}>
              Welcome to Pond
            </Dialog.Title>
            <Dialog.Description className={styles.description}>
              Keep everything you save on X, Instagram, YouTube, and the web in
              one library on {THIS_DEVICE}. Connect an account to sync new
              saves, then search them all on-device.
            </Dialog.Description>
            <div className={styles.actions}>
              <Button onClick={finish}>Get Started</Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
