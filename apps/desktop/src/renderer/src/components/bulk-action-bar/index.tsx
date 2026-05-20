import { Button, Input, Tooltip, useToast } from "@pond/ui";
import { useCallback, useState } from "react";
import { pool } from "@/pool/pool";
import { selection, useSelectedIds, useSelectionSize } from "@/pool/selection";
import styles from "./styles.module.css";

function Root() {
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

  if (size === 0) return null;

  return (
    <Bar>
      <Count>{size} selected</Count>
      <Divider />
      <Input
        data-size="sm"
        placeholder="Add tag…"
        value={tagDraft}
        onChange={(e) => setTagDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void addTag(tagDraft);
        }}
        disabled={busy}
        style={{ width: 140 }}
      />
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button
              size="sm"
              onClick={() => void addTag(tagDraft)}
              disabled={busy || !tagDraft.trim()}
            >
              Add tag
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup>Add this tag to every selected save</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button
              size="sm"
              variant="danger"
              onClick={() => void trash()}
              disabled={busy}
            >
              Trash
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup>Move every selected save to trash</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Divider />
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
              Done
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup>Clear selection (Esc)</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Bar>
  );
}

interface BarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Bar({ className, ...props }: BarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={[styles.bar, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface CountProps extends React.ComponentPropsWithoutRef<"span"> {}

function Count({ className, ...props }: CountProps) {
  return (
    <span
      className={[styles.count, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface DividerProps extends React.ComponentPropsWithoutRef<"div"> {}

function Divider({ className, ...props }: DividerProps) {
  return (
    <div
      aria-hidden
      className={[styles.divider, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const BulkActionBar = {
  Root,
  Bar,
  Count,
  Divider,
};
