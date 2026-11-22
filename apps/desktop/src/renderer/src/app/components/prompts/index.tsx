import { Callout } from "@pond/ui";
import { useEffect } from "react";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import {
  promptCard,
  useActivePrompt,
  useExtensionOpen,
} from "@/shared/state/prompts";
import { promptSpec } from "./catalog";
import { pickPrompt } from "./eligibility";
import { hasAskedFor, readPromptSignals, settlePrompt } from "./signals";

const CHECK_DELAY_MS = 20_000;

/** One ask per launch at most; it stays asked only once you act on it or dismiss it. */
function useAskOncePerLaunch(): void {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const signals = await readPromptSignals(Date.now());
        if (!active) return;
        const choice = pickPrompt(signals, hasAskedFor);
        if (choice) promptCard.show(choice);
      } catch {}
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

export function PromptHost() {
  const extensionOpen = useExtensionOpen();
  useAskOncePerLaunch();

  return (
    <BrowserExtensionDialog
      open={extensionOpen}
      onOpenChange={promptCard.setExtensionOpen}
    />
  );
}

export function PromptCard() {
  const id = useActivePrompt();
  if (id === null) return null;
  const spec = promptSpec(id);

  function dismiss() {
    settlePrompt(id);
    promptCard.close();
  }

  function confirm() {
    dismiss();
    void spec.run({ openExtension: () => promptCard.setExtensionOpen(true) });
  }

  return (
    <Callout.Root>
      <Callout.Header>
        <Callout.Title>{spec.title}</Callout.Title>
        <Callout.Close onClick={dismiss} />
      </Callout.Header>
      <Callout.Description>{spec.description}</Callout.Description>
      <Callout.Action onClick={confirm}>{spec.confirm}</Callout.Action>
    </Callout.Root>
  );
}
