import { Button, Tooltip, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/card-thumb";
import { EmptyState } from "@/components/empty-state";
import { LibraryChrome, Shell } from "@/components/shell";
import { useSaves } from "@/pool/hooks";
import type { AiSuggestion, Save } from "@/pool/types";
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

export function InboxPage() {
  const allSaves = useSaves();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const inbox = allSaves.filter(hasPendingSuggestions);

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
      <Shell.Main>
        <LibraryChrome />
        <EmptyState.Root data-tone="page">
          <EmptyState.Title>Inbox is clear</EmptyState.Title>
          <EmptyState.Description>
            When the AI worker proposes tags, captions, or summaries,
            they&rsquo;ll land here for you to review.
          </EmptyState.Description>
          <EmptyState.Actions>
            <Link to="/">← Back to library</Link>
          </EmptyState.Actions>
        </EmptyState.Root>
      </Shell.Main>
    );
  }

  return (
    <Shell.Main>
      <LibraryChrome />
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Inbox</h1>
          <p className={styles.subtitle}>
            {inbox.length} save{inbox.length === 1 ? "" : "s"} waiting for
            review.
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
    </Shell.Main>
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
      <Link to={`/save/${save.id}`} className={styles.thumb}>
        <Card.Root save={save}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
      </Link>
      <div className={styles.body}>
        <Link to={`/save/${save.id}`} className={styles.headline}>
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
      <div className={styles["suggestion-head"]}>
        <span className={styles["field-label"]}>{FIELD_LABEL[field]}</span>
        {entry.reasoning ? (
          <Tooltip.Root content={entry.reasoning} side="top">
            <span className={styles["field-hint"]}>why?</span>
          </Tooltip.Root>
        ) : null}
      </div>
      <div className={styles["suggestion-value"]}>
        {renderValue(field, entry.value)}
      </div>
      <div className={styles["suggestion-actions"]}>
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
