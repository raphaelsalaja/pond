import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CardThumb } from "../../components/card-thumb";
import { optimistic } from "../../pool/bootstrap";
import { useSaves } from "../../pool/hooks";
import { pool } from "../../pool/pool";
import type { Save } from "../../pool/types";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  Tooltip,
  useToast,
} from "../../ui";
import styles from "./styles.module.css";

/**
 * Trash view. Shows every row whose `deletedAt` is set, sorted most-
 * recently-trashed first. The top bar surfaces two destructive bulk
 * actions (Empty Trash + Restore All); per-card hover affordances cover
 * the per-row Restore / Delete Forever flow.
 *
 * All trash mutations route through `window.pond.tx` (single item) or
 * the bulk `saves.emptyTrash` / `saves.restoreAll` IPC queries (which
 * coalesce many `purge` / `untrash` txs under one batchId).
 */
export function TrashView() {
  const saves = useSaves();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<Save | null>(null);

  const selectedId = searchParams.get("id");
  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("id", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const focus = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("id", id);
      next.set("focus", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const trashed = useMemo(
    () =>
      saves
        .filter((s) => s.deletedAt)
        .sort((a, b) => deletedAtMs(b) - deletedAtMs(a)),
    [saves],
  );

  async function restore(id: string) {
    const prev = pool.get(id);
    if (!prev) return;
    setBusy(id);
    try {
      await optimistic(
        () => {
          pool.upsert({ ...prev, deletedAt: null } as typeof prev);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "untrash",
            model: "save",
            id,
          }),
      );
      toast.add({ title: "Restored", type: "success" });
    } finally {
      setBusy(null);
    }
  }

  async function purge(save: Save) {
    const prev = pool.get(save.id);
    if (!prev) return;
    setBusy(save.id);
    try {
      await optimistic(
        () => {
          pool.delete(save.id);
        },
        () => {
          pool.upsert(prev);
        },
        async () =>
          window.pond.tx({
            kind: "purge",
            model: "save",
            id: save.id,
            before: save as unknown as Save,
          }),
      );
      toast.add({ title: "Deleted forever", type: "success" });
    } finally {
      setBusy(null);
      setConfirmPurge(null);
    }
  }

  async function emptyTrash() {
    setBulkBusy(true);
    try {
      await window.pond.query("saves.emptyTrash");
      toast.add({ title: "Trash emptied", type: "success" });
    } finally {
      setBulkBusy(false);
      setConfirmEmpty(false);
    }
  }

  async function restoreAll() {
    if (trashed.length === 0) return;
    setBulkBusy(true);
    try {
      await window.pond.query("saves.restoreAll");
      toast.add({ title: "Restored everything", type: "success" });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className={styles.trash}>
      <div className={styles.toolbar}>
        <Toolbar aria-label="Trash actions">
          <ToolbarGroup align="start">
            <h2 className={styles.title}>Trash</h2>
            <span className={styles.count}>
              {trashed.length} item{trashed.length === 1 ? "" : "s"}
            </span>
          </ToolbarGroup>
          <ToolbarGroup align="end">
            <ToolbarButton
              disabled={trashed.length === 0 || bulkBusy}
              onClick={() => void restoreAll()}
            >
              Restore All
            </ToolbarButton>
            <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="danger"
                    disabled={trashed.length === 0 || bulkBusy}
                  >
                    Empty Trash
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete {trashed.length} item
                  {trashed.length === 1 ? "" : "s"}. This cannot be undone.
                </AlertDialogDescription>
                <AlertDialogActions>
                  <AlertDialogClose
                    render={<Button variant="ghost">Cancel</Button>}
                  />
                  <AlertDialogClose
                    render={
                      <Button
                        variant="danger"
                        disabled={bulkBusy}
                        onClick={(e) => {
                          e.preventDefault();
                          void emptyTrash();
                        }}
                      >
                        Delete forever
                      </Button>
                    }
                  />
                </AlertDialogActions>
              </AlertDialogContent>
            </AlertDialog>
          </ToolbarGroup>
        </Toolbar>
      </div>

      {trashed.length === 0 ? (
        <div className="pond-empty">
          <p>Trash is empty.</p>
        </div>
      ) : (
        <ul className="pond-grid">
          {trashed.map((save) => (
            <li
              key={save.id}
              className={`pond-card ${
                selectedId === save.id ? "pond-card--selected" : ""
              }`.trim()}
              onContextMenu={(e) => {
                e.preventDefault();
                void window.pond.showSaveContextMenu(save.id);
              }}
            >
              <button
                type="button"
                className="pond-card__select"
                aria-pressed={selectedId === save.id}
                onClick={() => select(save.id)}
                onDoubleClick={() => focus(save.id)}
              >
                <CardBody save={save} />
              </button>
              <div className={styles.cardActions}>
                <Tooltip content="Restore">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={busy === save.id}
                    onClick={(e) => {
                      e.preventDefault();
                      void restore(save.id);
                    }}
                    aria-label="Restore"
                  >
                    Restore
                  </Button>
                </Tooltip>
                <Tooltip content="Delete forever">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy === save.id}
                    onClick={(e) => {
                      e.preventDefault();
                      setConfirmPurge(save);
                    }}
                    aria-label="Delete forever"
                  >
                    Delete
                  </Button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={confirmPurge !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmPurge(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete forever?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently delete "{confirmPurge?.title ?? confirmPurge?.url}".
            This cannot be undone.
          </AlertDialogDescription>
          <AlertDialogActions>
            <AlertDialogClose
              render={<Button variant="ghost">Cancel</Button>}
            />
            <AlertDialogClose
              render={
                <Button
                  variant="danger"
                  disabled={busy === confirmPurge?.id}
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirmPurge) void purge(confirmPurge);
                  }}
                >
                  Delete forever
                </Button>
              }
            />
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CardBody({ save }: { save: Save }) {
  return (
    <>
      <div className="pond-card__media">
        <CardThumb save={save} />
        {save.files.length > 1 ? (
          <span
            className="pond-card__count"
            role="status"
            aria-label={`${save.files.length} media files`}
          >
            {save.files.length}
          </span>
        ) : null}
      </div>
      <div className="pond-card__meta">
        <span className="pond-card__title">{save.title ?? save.url}</span>
        <span className="pond-card__time">{save.source}</span>
      </div>
    </>
  );
}

function deletedAtMs(save: Save): number {
  if (!save.deletedAt) return 0;
  const t = new Date(save.deletedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}
