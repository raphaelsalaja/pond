import { Badge, Button, Empty, EmptyPreview } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import { Section } from "@/shared/components/inspector-section";
import { fishRuns, runGroup, runSentence, runsByDay } from "../../../lib/runs";
import { useNow } from "../../../lib/use-now";
import styles from "./styles.module.css";

const badges = {
  failed: { tone: "negative", label: "Failed" },
  review: { tone: "accent", label: "Changes" },
  done: { tone: "neutral", label: "Done" },
} as const;

export function FishActivity({
  fish,
  onNewRoutine,
  onOpenChat,
}: {
  fish: FishSummary;
  onNewRoutine?: () => void;
  onOpenChat?: (chatId: string) => void;
}) {
  const now = useNow();
  const runs = fishRuns(fish);
  if (!runs.length)
    return (
      <Empty.Root size="card">
        <Empty.Media>
          <EmptyPreview.Root layout="list">
            <EmptyPreview.Row>
              <EmptyPreview.Thumb variant="round" />
              <EmptyPreview.Lines>
                <EmptyPreview.Line width={60} />
                <EmptyPreview.Line width={38} tone="thin" />
              </EmptyPreview.Lines>
            </EmptyPreview.Row>
          </EmptyPreview.Root>
        </Empty.Media>
        <Empty.Title>No Runs Yet</Empty.Title>
        <Empty.Description>
          {fish.routines.length
            ? `${fish.name}'s runs show up here.`
            : `Ask ${fish.name} in chat to set a routine, and its runs show up here.`}
        </Empty.Description>
        {!fish.routines.length && onNewRoutine ? (
          <Empty.Action>
            <Button variant="secondary" size="sm" onClick={onNewRoutine}>
              New Routine
            </Button>
          </Empty.Action>
        ) : null}
      </Empty.Root>
    );
  return runsByDay(runs, now).map(({ day, runs }) => (
    <Section key={day} title={day} collapsible={false}>
      <ul className={styles.runs}>
        {runs.map((run) => {
          const badge = badges[runGroup(run)];
          const chatId = run.chatId;
          return (
            <li key={`${run.at}-${run.chatId}`} className={styles.run}>
              <span className={styles.text}>
                <span className={styles.sentence}>{runSentence(run)}</span>
                <span className={styles.meta}>
                  <Badge.Root tone={badge.tone}>{badge.label}</Badge.Root>
                  <time dateTime={new Date(run.at).toISOString()}>
                    {new Date(run.at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </span>
                {run.status === "failed" && run.error ? (
                  <span className={styles.error}>{run.error}</span>
                ) : null}
              </span>
              {chatId && onOpenChat ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onOpenChat(chatId)}
                >
                  Open Chat
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  ));
}
