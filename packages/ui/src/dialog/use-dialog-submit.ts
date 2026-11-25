import { useState } from "react";
import type { RefObject } from "react";

export function useDialogSubmit(
  pendingRef: RefObject<boolean>,
  close: () => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: () => void | Promise<void>) {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      pendingRef.current = false;
      close();
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Couldn't complete this action. Try again.",
      );
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  return { busy, error, submit };
}
