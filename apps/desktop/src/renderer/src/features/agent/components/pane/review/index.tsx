import { Button } from "@pond/ui";
import type { AssistantChange } from "@shared/assistant";
import {
  type ReviewPerform,
  review,
  useReview,
} from "@/features/agent/state/review";
import { useFolders } from "@/features/library";
import { cardKeys } from "../card-keys";
import { QuestionCard } from "../question-card";
import { useSourceCovers } from "../save-preview";
import { Confirm } from "./confirm";
import {
  isPurgeTrash,
  proposalClauses,
  reviewOutcome,
  reviewQuestion,
  reviewSummary,
} from "./lib";
import { Proposal } from "./proposal";
import styles from "./styles.module.css";

function useFolderName() {
  const folders = useFolders();
  return (id: string) =>
    folders.find((folder) => folder.id === id)?.name ?? "Deleted Folder";
}

function useChangeCovers(changes: readonly AssistantChange[]) {
  useSourceCovers(changes.flatMap((change) => change.saveId || []));
}

export function ChangeReview({
  messageId,
  changes,
  disabled = false,
  perform,
}: {
  messageId: string;
  changes: AssistantChange[];
  disabled?: boolean;
  perform?: ReviewPerform;
}) {
  const { working, error } = useReview();
  useChangeCovers(changes);
  const busy = disabled || working.length > 0;
  const purges = changes.filter(isPurgeTrash);
  const rest = changes.filter((change) => !isPurgeTrash(change));
  return (
    <div className={styles.review}>
      {purges.map((change) => (
        <TrashPrompt
          key={change.id}
          messageId={messageId}
          change={change}
          busy={busy}
          perform={perform}
        />
      ))}
      {rest.length ? (
        <LibraryReview
          messageId={messageId}
          changes={rest}
          busy={busy}
          perform={perform}
        />
      ) : null}
      {error?.messageId === messageId ? (
        <p className={styles.error} role="alert">
          {error.text}
        </p>
      ) : null}
    </div>
  );
}

/** The fish says what it will change, citing each Save, then asks you to approve it or say what to do instead. */
function LibraryReview({
  messageId,
  changes,
  busy,
  perform,
}: {
  messageId: string;
  changes: AssistantChange[];
  busy: boolean;
  perform?: ReviewPerform;
}) {
  const folderName = useFolderName();
  const pending = changes.filter((change) => change.status === "pending");
  const outcome = reviewOutcome(changes);
  const undoable = changes.filter(
    (change) => change.status === "applied" && change.undoable !== false,
  );
  const approve = () => void review.run(messageId, pending, "apply", perform);
  return (
    <div className={styles.library}>
      <Proposal clauses={proposalClauses(changes, folderName)} />
      {/* Enters on its own; a height reveal would clip the card's shadow. */}
      {pending.length ? (
        <Confirm
          title={reviewQuestion(pending.length)}
          description={reviewSummary(pending)}
          busy={busy}
          onApprove={approve}
          onDismiss={() =>
            void review.run(messageId, pending, "dismiss", perform)
          }
        />
      ) : null}
      {pending.length === 0 ? (
        <QuestionCard.Summary
          className={styles.card}
          aria-label={outcome.text}
          label={outcome.text}
          detail={reviewSummary(changes)}
          muted={outcome.tone === "muted"}
          action={
            undoable.length ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void review.run(messageId, undoable, "undo", perform)
                }
              >
                Undo
              </Button>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

function TrashPrompt({
  messageId,
  change,
  busy,
  perform,
}: {
  messageId: string;
  change: AssistantChange;
  busy: boolean;
  perform?: ReviewPerform;
}) {
  const pending = change.status === "pending";
  const emptied = change.status === "applied";
  const act = (action: "apply" | "dismiss") =>
    void review.run(messageId, [change], action, perform);
  const onKeyDown = cardKeys(
    pending && !busy
      ? { submit: () => act("apply"), cancel: () => act("dismiss") }
      : {},
  );
  if (!pending)
    return (
      <QuestionCard.Summary
        label={emptied ? "Emptied Trash" : "Kept Trash"}
        detail={
          emptied ? "Every Save in Trash was deleted" : "Nothing was deleted"
        }
        muted={!emptied}
      />
    );
  return (
    <QuestionCard.Root aria-label="Empty Trash?" onKeyDown={onKeyDown}>
      <QuestionCard.Header
        title="Empty Trash?"
        description="Every Save in Trash is deleted for good. You can't undo this."
      />
      <QuestionCard.Footer>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => act("dismiss")}
        >
          Keep Trash
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => act("apply")}
        >
          Empty Trash
        </Button>
      </QuestionCard.Footer>
    </QuestionCard.Root>
  );
}
