import { Button } from "@pond/ui";
import { useId } from "react";
import { cardKeys } from "../../card-keys";
import { QuestionCard } from "../../question-card";
import styles from "./styles.module.css";

/**
 * Asks to apply the proposal, on the same card the fish asks its questions with. Approve applies it
 * as written and Deny sets it aside. To change it, you reply to the fish in the chat.
 */
export function Confirm({
  title,
  description,
  busy,
  onApprove,
  onDismiss,
}: {
  title: string;
  description: string;
  busy: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const onKeyDown = cardKeys(
    busy ? {} : { submit: onApprove, cancel: onDismiss },
  );
  return (
    <QuestionCard.Root
      className={styles.card}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <QuestionCard.Header
        title={title}
        titleId={titleId}
        description={description}
      />
      <QuestionCard.Footer>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onDismiss}
        >
          Deny
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={onApprove}>
          Approve
        </Button>
      </QuestionCard.Footer>
    </QuestionCard.Root>
  );
}
