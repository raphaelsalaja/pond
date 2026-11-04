import { useEffect, useState } from "react";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { ASK_TOAST_ID, ask, toastManager } from "@/shared/lib/toast";
import { anotherDialogOpen } from "@/shared/state/notices";
import { promptToast, useActivePrompt } from "@/shared/state/prompts";
import { supportDialog } from "@/shared/state/support";
import {
  hasAskedForSupport,
  markAskedForSupport,
} from "../support-dialog/eligibility";
import { promptAsk, promptSpec } from "./catalog";
import { pickPrompt, promptsSettledBy } from "./eligibility";
import { hasAsked, markAsked, readPromptSignals } from "./signals";

const CHECK_DELAY_MS = 20_000;

/** One automatic ask per launch at most, and never while a dialog or another ask is up. */
function useAskOncePerLaunch(): void {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const signals = await readPromptSignals(Date.now());
        if (!active || anotherDialogOpen()) return;
        const choice = pickPrompt(signals, (id) =>
          id === "support" ? hasAskedForSupport() : hasAsked(id),
        );
        if (choice === "support") {
          markAskedForSupport();
          supportDialog.open();
        } else if (choice) {
          for (const id of promptsSettledBy(choice)) markAsked(id);
          promptToast.open(choice);
        }
      } catch {}
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

export function PromptHost() {
  const id = useActivePrompt();
  const [extensionOpen, setExtensionOpen] = useState(false);
  useAskOncePerLaunch();

  useEffect(() => {
    if (id === null) {
      toastManager.close(ASK_TOAST_ID);
      return;
    }
    const spec = promptSpec(id);
    ask(
      promptAsk(spec, {
        onConfirm: () =>
          spec.run({ openExtension: () => setExtensionOpen(true) }),
        onClose: promptToast.close,
      }),
    );
  }, [id]);

  return (
    <BrowserExtensionDialog
      open={extensionOpen}
      onOpenChange={setExtensionOpen}
    />
  );
}
