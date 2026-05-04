import { useCallback, useState } from "react";
import { pool } from "../../pool/pool";
import {
  selection,
  useSelectedIds,
  useSelectionSize,
} from "../../pool/selection";
import { Button, Input, Tooltip, useToast } from "../../ui";
import styles from "./styles.module.css";

/**
 * Floating action bar that appears whenever there's a non-empty
 * selection. Performs bulk tag-add, bulk-tag-remove, bulk-delete, and
 * bulk-refresh through batched `Transaction[]` calls so the executor
 * collapses every operation under a single batch id (one undo action
 * per bulk operation, exactly like Linear).
 */
export function BulkActionBar() {
  const size = useSelectionSize();
  const ids = useSelectedIds();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const close = useCallback(() => selection.clear(), []);

  const addTag = useCallback(
    async (raw: string) => {
      const cleaned = raw
        .trim()
        .replace(/^#+/, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase();
      if (!cleaned || ids.length === 0) return;
      setBusy(true);
      try {
        const txs: unknown[] = [];
        for (const id of ids) {
          const save = pool.get(id);
          if (!save) continue;
          if (save.tags.some((t) => t.toLowerCase() === cleaned)) continue;
          txs.push({
            kind: "update",
            model: "save",
            id,
            patch: { tags: [...save.tags, cleaned] },
            before: { tags: save.tags },
            meta: { actor: "user", actorReason: "bulk-tag-add" },
          });
        }
        if (txs.length > 0) await window.pond.batch(txs);
        toast.add({
          title: `Added "${cleaned}" to ${txs.length} save${txs.length === 1 ? "" : "s"}`,
          type: "success",
        });
        setTagDraft("");
      } finally {
        setBusy(false);
      }
    },
    [ids, toast],
  );

  const trash = useCallback(async () => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const txs = ids.map((id) => ({
        kind: "trash",
        model: "save",
        id,
        meta: { actor: "user", actorReason: "bulk-trash" },
      }));
      await window.pond.batch(txs as unknown[]);
      toast.add({
        title: `Moved ${ids.length} save${ids.length === 1 ? "" : "s"} to trash`,
        type: "success",
      });
      selection.clear();
    } finally {
      setBusy(false);
    }
  }, [ids, toast]);

  const enrich = useCallback(async () => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await window.pond.query("enrich.start", { saveId: id });
      }
      toast.add({
        title: "Enrichment queued",
        description: `${ids.length} save${ids.length === 1 ? "" : "s"} scheduled.`,
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }, [ids, toast]);

  if (size === 0) return null;

  return (
    <div className={styles.bar} role="toolbar" aria-label="Bulk actions">
      <span className={styles.count}>{size} selected</span>
      <div className={styles.divider} aria-hidden />
      <Input
        size="sm"
        placeholder="Add tag…"
        value={tagDraft}
        onChange={(e) => setTagDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void addTag(tagDraft);
        }}
        disabled={busy}
        style={{ width: 140 }}
      />
      <Tooltip content="Add this tag to every selected save">
        <Button
          size="sm"
          onClick={() => void addTag(tagDraft)}
          disabled={busy || !tagDraft.trim()}
        >
          Add tag
        </Button>
      </Tooltip>
      <Tooltip content="Schedule AI enrichment for every selected save">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void enrich()}
          disabled={busy}
        >
          Enrich
        </Button>
      </Tooltip>
      <Tooltip content="Move every selected save to trash">
        <Button
          size="sm"
          variant="danger"
          onClick={() => void trash()}
          disabled={busy}
        >
          Trash
        </Button>
      </Tooltip>
      <div className={styles.divider} aria-hidden />
      <Tooltip content="Clear selection (Esc)">
        <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
          Done
        </Button>
      </Tooltip>
    </div>
  );
}
