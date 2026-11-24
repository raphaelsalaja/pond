import { IconCircleCheck, IconCircleXmark, IconTrash } from "@pond/icons";
import { Button, HoverHighlight, Reveal, Swap } from "@pond/ui";
import { Prompt } from "@pond/ui/prompt";
import type { AssistantChange } from "@shared/assistant";
import { useState } from "react";
import {
  type ReviewPerform,
  review,
  useReview,
} from "@/features/agent/state/review";
import { useFolders } from "@/features/library";
import { cardKeys } from "../card-keys";
import { useSourceCovers } from "../save-preview";
import {
  isPurgeTrash,
  reviewOutcome,
  reviewQuestion,
  reviewSummary,
} from "./lib";
import { ChangeRow } from "./row";
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
  const { working } = useReview();
  const pending = changes.filter((change) => change.status === "pending");
  const [first] = pending;
  const outcome = reviewOutcome(changes);
  const title = first ? reviewQuestion(pending.length) : outcome.text;
  const summary = reviewSummary(first ? pending : changes);
  const all = pending.length > 1;
  const [open, setOpen] = useState(false);
  const undoable = changes.filter(
    (change) => change.status === "applied" && change.undoable !== false,
  );
  const rows = (
    <ul className={styles.rows}>
      {changes.map((change) => (
        <ChangeRow
          key={change.id}
          change={change}
          busy={busy}
          working={working.includes(change.id)}
          folderName={folderName}
          onAction={(action) =>
            void review.run(messageId, [change], action, perform)
          }
          actions={all}
        />
      ))}
      <HoverHighlight render={<li />} />
    </ul>
  );
  const act = (action: "apply" | "dismiss") =>
    void review.run(messageId, pending, action, perform);
  const onKeyDown = cardKeys(
    first && !busy
      ? { submit: () => act("apply"), cancel: () => act("dismiss") }
      : {},
  );
  return (
    <Prompt.Root aria-label={title} onKeyDown={onKeyDown}>
      <Reveal visible={!first} initial={false}>
        <Prompt.Receipt
          icon={
            outcome.tone === "muted" ? (
              <IconCircleXmark size={16} />
            ) : (
              <IconCircleCheck size={16} />
            )
          }
          tone={outcome.tone}
          label={outcome.text}
          detail={summary}
          open={open}
          onOpenChange={setOpen}
          action={
            undoable.length ? (
              <Button
                size="xs"
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
        <Reveal visible={open} initial={false}>
          <div className={styles.unfolded}>{rows}</div>
        </Reveal>
      </Reveal>
      <Reveal visible={Boolean(first)} initial={false}>
        <Prompt.Body>
          <Prompt.Title>
            <Swap value={title}>{title}</Swap>
          </Prompt.Title>
          <Prompt.Description>
            <Swap value={summary}>{summary}</Swap>
          </Prompt.Description>
          {rows}
        </Prompt.Body>
        <Prompt.Footer>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => act("dismiss")}
          >
            {all ? "Dismiss All" : "Dismiss"}
          </Button>
          <Button
            size="sm"
            variant="accent"
            disabled={busy}
            onClick={() => act("apply")}
          >
            {all ? "Apply All" : "Apply"}
          </Button>
        </Prompt.Footer>
      </Reveal>
    </Prompt.Root>
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
  return (
    <Prompt.Root
      tone={pending ? "destructive" : undefined}
      aria-label={pending ? "Empty Trash?" : undefined}
      onKeyDown={onKeyDown}
    >
      <Reveal visible={!pending} initial={false}>
        <Prompt.Receipt
          icon={
            emptied ? <IconTrash size={16} /> : <IconCircleXmark size={16} />
          }
          tone={emptied ? "default" : "muted"}
          label={emptied ? "Emptied Trash" : "Kept Trash"}
        />
      </Reveal>
      <Reveal visible={pending} initial={false}>
        <Prompt.Body>
          <Prompt.Title>Empty Trash?</Prompt.Title>
          <Prompt.Description>
            Every Save in Trash is deleted for good. You can't undo this.
          </Prompt.Description>
        </Prompt.Body>
        <Prompt.Footer>
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
        </Prompt.Footer>
      </Reveal>
    </Prompt.Root>
  );
}
