import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
  Input,
  useToast,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Settings → Tags. Real CRUD over the `tags` table:
 *   - rename — walks every `saves.tags` array via `tags.rename` IPC,
 *   - merge — fold-into-other tag,
 *   - recolor / regroup — update the canonical row,
 *   - delete — strip from every save.
 *
 * The list is composed from `tags.list` (canonical) merged with
 * `tags.allFromSaves` (live counts). Anything that's tagged in a save
 * but missing from the canonical table still shows up so the user can
 * promote it.
 */

interface TagRow {
  name: string;
  color: string | null;
  group: string | null;
  userCount: number;
  aiCount: number;
}

interface CanonTag {
  id: string;
  name: string;
  color: string | null;
  group: string | null;
  usageCount?: number;
}

interface CountRow {
  name: string;
  userCount: number;
  aiCount: number;
}

export function TagsSection() {
  const toast = useToast();
  const [rows, setRows] = useState<TagRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    const [canonical, counts] = (await Promise.all([
      window.pond.query("tags.list", {}),
      window.pond.query("tags.allFromSaves", {}),
    ])) as [CanonTag[], CountRow[]];
    const byName = new Map<string, TagRow>();
    for (const t of canonical) {
      byName.set(t.name.toLowerCase(), {
        name: t.name,
        color: t.color ?? null,
        group: t.group ?? null,
        userCount: t.usageCount ?? 0,
        aiCount: 0,
      });
    }
    for (const c of counts) {
      const key = c.name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.userCount = c.userCount;
        existing.aiCount = c.aiCount;
      } else {
        byName.set(key, {
          name: c.name,
          color: null,
          group: null,
          userCount: c.userCount,
          aiCount: c.aiCount,
        });
      }
    }
    setRows(
      Array.from(byName.values()).sort(
        (a, b) =>
          b.userCount + b.aiCount - (a.userCount + a.aiCount) ||
          a.name.localeCompare(b.name),
      ),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function rename(from: string, to: string) {
    if (!to.trim() || from === to) return;
    setBusy(true);
    try {
      const res = (await window.pond.query("tags.rename", { from, to })) as {
        ok: boolean;
        affected: number;
      };
      toast.add({
        title: "Tag renamed",
        description: `${res.affected} write${res.affected === 1 ? "" : "s"}.`,
        type: "success",
      });
      void refresh();
    } catch (err) {
      toast.add({
        title: "Rename failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
      setEditing(null);
    }
  }

  async function recolor(name: string, color: string | null) {
    setBusy(true);
    try {
      await window.pond.query("tags.update", { name, patch: { color } });
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function regroup(name: string, group: string | null) {
    setBusy(true);
    try {
      await window.pond.query("tags.update", { name, patch: { group } });
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    setBusy(true);
    try {
      const res = (await window.pond.query("tags.delete", { name })) as {
        affected: number;
      };
      toast.add({
        title: "Tag deleted",
        description: `Removed from ${res.affected} save${res.affected === 1 ? "" : "s"}.`,
        type: "success",
      });
      void refresh();
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await window.pond.query("tags.create", { name });
      setNewName("");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const visible = rows.filter((r) =>
    !filter ? true : r.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <SectionStack>
      <SectionHeader
        title="Tags"
        description="Rename, recolour, group, or delete tags. Changes propagate across every save and the on-disk metadata."
      />

      <SettingsCard title="Add tag">
        <Row
          label="New tag"
          description="Creates the canonical entry. Tags also auto-create when used on a save."
          control={
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                size="sm"
                placeholder="design"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button
                size="sm"
                onClick={create}
                disabled={busy || !newName.trim()}
              >
                Add
              </Button>
            </div>
          }
        />
      </SettingsCard>

      <SettingsCard title={`All tags (${rows.length})`}>
        <Row
          label="Filter"
          description="Substring match on the tag name."
          control={
            <Input
              size="sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="search…"
            />
          }
        />
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((row) => (
            <li
              key={row.name}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 1fr 80px auto",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid var(--pond-border-subtle, #2222)",
                alignItems: "center",
              }}
            >
              {editing === row.name ? (
                <RenameRow
                  initial={row.name}
                  onSubmit={(next) => void rename(row.name, next)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <span style={{ fontWeight: 500 }}>{row.name}</span>
              )}
              <Input
                size="sm"
                value={row.group ?? ""}
                placeholder="group"
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (row.group ?? null)) {
                    void regroup(row.name, next);
                  }
                }}
                defaultValue={row.group ?? ""}
              />
              <Input
                size="sm"
                type="text"
                placeholder="#hex"
                defaultValue={row.color ?? ""}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (row.color ?? null)) {
                    void recolor(row.name, next);
                  }
                }}
              />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {row.userCount} · {row.aiCount} ai
              </span>
              <div
                style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(row.name)}
                  disabled={busy}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(row.name)}
                  disabled={busy}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {visible.length === 0 ? (
            <li style={{ padding: "12px 0", opacity: 0.7 }}>
              No tags yet. Add one above or tag a save in the preview pane.
            </li>
          ) : null}
        </ul>
      </SettingsCard>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete tag?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes <strong>{deleting}</strong> from every save and the
            canonical tag list. Undo (Cmd+Z) will restore it.
          </AlertDialogDescription>
          <AlertDialogActions>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => deleting && void remove(deleting)}
            >
              Delete tag
            </Button>
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
    </SectionStack>
  );
}

function RenameRow({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <Input
        size="sm"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(value.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" onClick={() => onSubmit(value.trim())}>
        Save
      </Button>
    </div>
  );
}
