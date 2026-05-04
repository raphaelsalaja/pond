import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/card-thumb";
import { useSaves } from "../../pool/hooks";
import type { AiSuggestion, Save } from "../../pool/types";
import { Button, Tooltip, useToast } from "../../ui";
import styles from "./styles.module.css";

type Field = "tags" | "caption" | "ocr" | "classification" | "summary";

const FIELD_ORDER: Field[] = [
  "classification",
  "tags",
  "caption",
  "summary",
  "ocr",
];

const FIELD_LABEL: Record<Field, string> = {
  classification: "Type",
  tags: "Tags",
  caption: "Caption",
  summary: "Summary",
  ocr: "OCR text",
};

/**
 * Inbox view. Lists every save with at least one un-applied AI
 * suggestion and lets the user accept or reject each suggestion in
 * place. Backed by the `saves.inbox` IPC for the initial roster and
 * the renderer-side pool for live updates as suggestions land.
 *
 * Acceptance routes through `enrich.applySuggestion` (writes the field
 * + flips `appliedAt`); rejection routes through a generic update
 * transaction that clears the suggestion entry — both paths leave a
 * sync action behind for the activity timeline.
 */
export function InboxPage() {
  const allSaves = useSaves();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // The pool is the source of truth — `saves.inbox` is just the seed
  // for first paint. We reactively re-derive the list from the in-memory
  // pool so the inbox shrinks the moment a suggestion is applied.
  const inbox = allSaves.filter(hasPendingSuggestions);

  // Cold-start hint: kick the IPC once on mount so the worker fills the
  // pool with anything we haven't reconciled yet.
  useEffect(() => {
    void window.pond.query("saves.inbox", { limit: 500 });
  }, []);

  const accept = useCallback(
    async (save: Save, field: Field) => {
      setBusyId(save.id);
      try {
        await window.pond.query("enrich.applySuggestion", {
          saveId: save.id,
          field,
          accept: true,
        });
        toast.add({
          title: `Applied ${FIELD_LABEL[field].toLowerCase()}`,
          type: "success",
        });
      } catch (err) {
        toast.add({
          title: "Couldn't apply suggestion",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [toast],
  );

  const reject = useCallback(
    async (save: Save, field: Field) => {
      setBusyId(save.id);
      try {
        await window.pond.query("enrich.applySuggestion", {
          saveId: save.id,
          field,
          accept: false,
        });
      } catch (err) {
        toast.add({
          title: "Couldn't reject suggestion",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [toast],
  );

  if (inbox.length === 0) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>Inbox is clear</h1>
        <p>
          When the AI worker proposes tags, captions, or summaries, they'll land
          here for you to review.
        </p>
        <Link to="/" className={styles.backLink}>
          ← Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Inbox</h1>
        <p className={styles.subtitle}>
          {inbox.length} save{inbox.length === 1 ? "" : "s"} waiting for review.
        </p>
      </header>
      <ul className={styles.list}>
        {inbox.map((save) => (
          <InboxRow
            key={save.id}
            save={save}
            busy={busyId === save.id}
            onAccept={accept}
            onReject={reject}
          />
        ))}
      </ul>
    </div>
  );
}

interface InboxRowProps {
  save: Save;
  busy: boolean;
  onAccept: (save: Save, field: Field) => void;
  onReject: (save: Save, field: Field) => void;
}

function InboxRow({ save, busy, onAccept, onReject }: InboxRowProps) {
  const sug = save.aiSuggestions ?? {};
  return (
    <li className={styles.row}>
      <Link to={`/?id=${save.id}`} className={styles.thumb}>
        <Card.Root save={save}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
      </Link>
      <div className={styles.body}>
        <Link to={`/?id=${save.id}`} className={styles.headline}>
          {save.title ?? save.url}
        </Link>
        <p className={styles.url}>{save.url}</p>
        <div className={styles.suggestions}>
          {FIELD_ORDER.map((field) => {
            const entry = sug[field] as AiSuggestion<unknown> | undefined;
            if (!entry || entry.appliedAt) return null;
            return (
              <SuggestionRow
                key={field}
                field={field}
                entry={entry}
                busy={busy}
                onAccept={() => onAccept(save, field)}
                onReject={() => onReject(save, field)}
              />
            );
          })}
        </div>
      </div>
    </li>
  );
}

function SuggestionRow({
  field,
  entry,
  busy,
  onAccept,
  onReject,
}: {
  field: Field;
  entry: AiSuggestion<unknown>;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={styles.suggestion}>
      <div className={styles.suggestionHead}>
        <span className={styles.fieldLabel}>{FIELD_LABEL[field]}</span>
        {entry.reasoning ? (
          <Tooltip content={entry.reasoning} side="top">
            <span className={styles.fieldHint}>why?</span>
          </Tooltip>
        ) : null}
      </div>
      <div className={styles.suggestionValue}>
        {renderValue(field, entry.value)}
      </div>
      <div className={styles.suggestionActions}>
        <Button size="sm" disabled={busy} onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function renderValue(field: Field, value: unknown): React.ReactNode {
  if (field === "tags" && Array.isArray(value)) {
    return (
      <div className={styles.chips}>
        {(value as string[]).map((t) => (
          <span key={t} className={styles.chip}>
            #{t}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function hasPendingSuggestions(save: Save): boolean {
  if (save.deletedAt) return false;
  const sug = save.aiSuggestions;
  if (!sug) return false;
  for (const key of FIELD_ORDER) {
    const entry = sug[key];
    if (entry && !entry.appliedAt) return true;
  }
  return false;
}
