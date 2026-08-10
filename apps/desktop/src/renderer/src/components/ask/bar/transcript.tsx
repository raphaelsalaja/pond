import { IconChevronDownFill18 as JumpDown } from "@pond/icons/fill/18";
import { MessageScroller } from "@shadcn/react/message-scroller";
import type { AskTurn } from "@/stores/ask-store";
import { TurnView } from "./lib/turn-view";
import styles from "./transcript.module.css";

export function Transcript({
  turns,
  busy,
  onRetry,
}: {
  turns: readonly AskTurn[];
  busy: boolean;
  onRetry: (question: string) => void;
}) {
  return (
    <MessageScroller.Provider autoScroll>
      <MessageScroller.Root className={styles.transcript}>
        <MessageScroller.Viewport
          className={styles["transcript-viewport"]}
          data-scroll-fade=""
          aria-label="Chat transcript"
        >
          <MessageScroller.Content
            className={styles["transcript-content"]}
            aria-busy={busy || undefined}
          >
            {turns.map((turn, i) => (
              /** A whole turn anchors: sending scrolls the question near the top with a peek of the previous exchange. */
              <MessageScroller.Item
                key={turn.id}
                messageId={turn.id}
                scrollAnchor
              >
                <TurnView
                  turn={turn}
                  onRetry={
                    i === turns.length - 1 &&
                    turn.status === "error" &&
                    turn.question
                      ? () => onRetry(turn.question)
                      : undefined
                  }
                />
              </MessageScroller.Item>
            ))}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button
          className={styles["transcript-jump"]}
          aria-label="Jump to latest"
        >
          <JumpDown width={14} height={14} />
        </MessageScroller.Button>
      </MessageScroller.Root>
    </MessageScroller.Provider>
  );
}
