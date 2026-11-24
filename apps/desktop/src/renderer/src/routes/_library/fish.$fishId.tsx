import { createFileRoute } from "@tanstack/react-router";
import log from "electron-log/renderer";
import { useEffect } from "react";
import { AgentPane } from "@/features/agent/components/pane";
import { assistant } from "@/features/agent/state/assistant";
import { fish as fishStore, useFish } from "@/features/fish";

export const Route = createFileRoute("/_library/fish/$fishId")({
  staticData: { details: "fish" },
  component: FishPage,
});

function FishPage() {
  const { fishId } = Route.useParams();
  const run = useFish(fishId)?.lastRun;
  const unseenChat = run && !run.seen ? run.chatId : null;
  const unseenAt = run && !run.seen ? run.at : null;

  useEffect(() => {
    assistant.selectFish(fishId);
  }, [fishId]);

  /** Opening the newest run's chat marks it seen, so a later visit starts where you left off. */
  useEffect(() => {
    if (unseenAt === null || !unseenChat) {
      return;
    }
    void assistant.openChat(unseenChat);
    void fishStore.markSeen(fishId).catch((cause: unknown) => {
      log.warn("[pond fish] marking the run seen failed", cause);
    });
  }, [fishId, unseenChat, unseenAt]);

  return <AgentPane />;
}
