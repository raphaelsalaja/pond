import { fishPath } from "@/features/fish";
import { getAppRouter } from "@/shared/lib/app-router";

/** The Assistant runtime pulls in the AI SDK; menus load at launch, so import it on use. */
export function addSavesToChat(ids: readonly string[], target?: string): void {
  if (!ids.length) return;
  void import("@/features/agent/state/assistant").then(({ assistant }) => {
    const fishId = target ?? assistant.fishId();
    assistant.selectFish(fishId);
    getAppRouter()?.history.push(fishPath(fishId));
    return assistant.attachIds([...ids]);
  });
}

/** Starts a message in the open chat for you to finish, like "Edit your routine: Ping." */
export function draftInChat(text: string): void {
  void import("@/features/agent/state/assistant").then(({ assistant }) => {
    assistant.setDraft(text);
    assistant.requestFocus();
  });
}
