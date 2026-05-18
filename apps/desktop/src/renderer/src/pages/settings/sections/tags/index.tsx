import {
  IconChevronDownOutline18,
  IconDotsOutline18,
  IconMagnifierOutline18,
} from "@pond/icons/outline/18";
import {
  AlertDialog,
  Button,
  Dialog,
  Input,
  Menu,
  Popover,
  useToast,
} from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

interface CanonTag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  group?: string | null;
  usageCount?: number;
  createdAt?: string | number | null;
}

interface CountRow {
  name: string;
  userCount: number;
  aiCount: number;
}

interface LabelRow {
  name: string;
  color: string | null;
  description: string | null;
  userCount: number;
  aiCount: number;
  createdAt: string | null;
}

const DEFAULT_DOT = "var(--ds-gray-a6)";

const LABEL_COLORS = [
  "#6e6e6e",
  "#eb5757",
  "#f2994a",
  "#f2c94c",
  "#219653",
  "#2f80ed",
  "#56ccf2",
  "#bb6bd9",
  "#9b51e0",
  "#ff6900",
  "#fcb900",
  "#7bdcb5",
  "#0693e3",
  "#abb8c3",
  "#eb144c",
  "#1f2937",
] as const;

export function TagsSection() {
  const toast = useToast();
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [colorMenuFor, setColorMenuFor] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [canonical, counts] = (await Promise.all([
      window.pond.query("tags.list", {}),
      window.pond.query("tags.allFromSaves", {}),
    ])) as [CanonTag[], CountRow[]];
    const countByLower = new Map<string, CountRow>();
    for (const c of counts) {
      countByLower.set(c.name.toLowerCase(), c);
    }
    const byName = new Map<string, LabelRow>();
    for (const t of canonical) {
      const lowered = t.name.toLowerCase();
      const countsFor = countByLower.get(lowered);
      byName.set(lowered, {
        name: t.name,
        color: t.color ?? null,
        description: t.description ?? null,
        userCount: countsFor?.userCount ?? t.usageCount ?? 0,
        aiCount: countsFor?.aiCount ?? 0,
        createdAt: toIso(t.createdAt),
      });
      countByLower.delete(lowered);
    }
    for (const [lowered, c] of countByLower) {
      byName.set(lowered, {
        name: lowered,
        color: null,
        description: null,
        userCount: c.userCount,
        aiCount: c.aiCount,
        createdAt: null,
      });
    }
    setRows(
      Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const desc = (r.description ?? "").toLowerCase();
      return r.name.toLowerCase().includes(q) || desc.includes(q);
    });
  }, [rows, filter]);

  const selectedInView = useMemo(
    () => visible.filter((r) => selected.has(r.name)),
    [visible, selected],
  );

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const n = selectedInView.length;
    el.indeterminate = n > 0 && n < visible.length;
    el.checked = visible.length > 0 && n === visible.length;
  }, [selectedInView.length, visible.length]);

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) for (const r of visible) next.add(r.name);
      else for (const r of visible) next.delete(r.name);
      return next;
    });
  }

  function toggleRow(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  async function rename(from: string, to: string) {
    if (!to.trim() || from === to) {
      setEditingName(null);
      return;
    }
    setBusy(true);
    try {
      const res = (await window.pond.query("tags.rename", { from, to })) as {
        ok: boolean;
        affected: number;
      };
      toast.add({
        title: "Label renamed",
        description: `${res.affected} save${res.affected === 1 ? "" : "s"} updated.`,
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
      setEditingName(null);
    }
  }

  async function patchColor(name: string, color: string | null) {
    setBusy(true);
    try {
      await window.pond.query("tags.update", {
        name,
        patch: { color },
      });
      setColorMenuFor(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchDescription(name: string, description: string | null) {
    setBusy(true);
    try {
      await window.pond.query("tags.update", {
        name,
        patch: { description: description?.trim() || null },
      });
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(names: string[]) {
    setBusy(true);
    try {
      let total = 0;
      for (const name of names) {
        const res = (await window.pond.query("tags.delete", {
          name,
        })) as { affected: number };
        total += res.affected ?? 0;
      }
      toast.add({
        title: names.length === 1 ? "Label deleted" : "Labels deleted",
        description: `Removed from ${total} save${total === 1 ? "" : "s"}.`,
        type: "success",
      });
      setSelected(new Set());
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
      setCreating(false);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runMerge() {
    const names = [...selected];
    if (!mergeTarget || names.length < 2) return;
    const sources = names.filter((n) => n !== mergeTarget);
    if (sources.length === 0) return;
    setBusy(true);
    try {
      for (const from of sources) {
        await window.pond.query("tags.merge", { from, to: mergeTarget });
      }
      toast.add({
        title: "Labels merged",
        description: `Kept ${mergeTarget}.`,
        type: "success",
      });
      setMergeOpen(false);
      setSelected(new Set());
      void refresh();
    } catch (err) {
      toast.add({
        title: "Merge failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  function startCreating() {
    setCreating(true);
    requestAnimationFrame(() => newInputRef.current?.focus());
  }

  function openMerge() {
    const names = [...selected];
    if (names.length < 2) return;
    setMergeTarget(names[0] ?? "");
    setMergeOpen(true);
  }

  return (
    <div className={styles["labels-page"]}>
      <header className={styles["labels-page-header"]}>
        <h1 className={styles["labels-page-title"]}>Labels</h1>
        <p className={styles["labels-page-subtitle"]}>
          Colors, descriptions, and bulk merge across every save.
        </p>
      </header>

      <div>
        <div className={styles["labels-toolbar"]}>
          <div className={styles["labels-filter"]}>
            <span className={styles["labels-filter-icon"]} aria-hidden>
              <IconMagnifierOutline18 width={14} height={14} />
            </span>
            <Input
              type="search"
              data-size="sm"
              className={styles["labels-filter-input"]}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or description…"
              spellCheck={false}
            />
          </div>
          <div className={styles["labels-toolbar-actions"]}>
            <Button
              size="sm"
              variant="primary"
              onClick={startCreating}
              disabled={busy || creating}
            >
              New label
            </Button>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className={styles["labels-bulk-bar"]} role="toolbar">
            <span className={styles["labels-bulk-count"]}>
              {selected.size} selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || selected.size < 2}
              onClick={openMerge}
            >
              Merge…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleting([...selected])}
            >
              Delete…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className={styles["labels-table"]}>
          <div className={styles["labels-table-head"]}>
            <span className={styles["labels-head-check"]}>
              <input
                ref={headerCheckRef}
                type="checkbox"
                className={styles["labels-checkbox"]}
                aria-label="Select all visible labels"
                onChange={(e) => toggleSelectAll(e.target.checked)}
              />
            </span>
            <span className={styles["labels-head-swatch"]} aria-hidden />
            <span>
              Name
              <span className={styles["labels-sort-caret"]} aria-hidden>
                <IconChevronDownOutline18 width={12} height={12} />
              </span>
            </span>
            <span>Description</span>
            <span className={styles["labels-col-numeric"]}>Saves</span>
            <span className={styles["labels-col-date"]}>Created</span>
            <span className={styles["labels-head-menu"]} aria-hidden />
          </div>

          {creating ? (
            <div className={styles["labels-create-row"]}>
              <span className={styles["labels-head-check"]} aria-hidden />
              <span
                className={styles["labels-dot"]}
                style={{ background: DEFAULT_DOT }}
                aria-hidden
              />
              <Input
                ref={newInputRef}
                data-size="sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
              />
              <div className={styles["labels-create-actions"]}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !newName.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : null}

          {visible.map((row) => (
            <LabelRowView
              key={row.name}
              row={row}
              busy={busy}
              checked={selected.has(row.name)}
              editingName={editingName === row.name}
              colorMenuOpen={colorMenuFor === row.name}
              onToggleCheck={(c) => toggleRow(row.name, c)}
              onOpenColorMenu={(o) => setColorMenuFor(o ? row.name : null)}
              onPickColor={(c) => void patchColor(row.name, c)}
              onPatchDescription={(d) => void patchDescription(row.name, d)}
              onStartRename={() => setEditingName(row.name)}
              onCancelRename={() => setEditingName(null)}
              onRename={(next) => void rename(row.name, next)}
              onDelete={() => setDeleting([row.name])}
            />
          ))}

          {visible.length === 0 && !creating ? (
            <div className={styles["labels-empty"]}>
              {filter
                ? `No labels match "${filter}".`
                : "No labels yet. Add one above or label a save."}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog.Root open={mergeOpen} onOpenChange={setMergeOpen}>
        <Dialog.Content className={styles["labels-merge-dialog"]}>
          <Dialog.Title>Merge labels</Dialog.Title>
          <Dialog.Description>
            Choose the label to keep. The others are merged into it and removed
            from this list.
          </Dialog.Description>
          <div className={styles["labels-merge-field"]}>
            <label
              className={styles["labels-merge-label"]}
              htmlFor="merge-target"
            >
              Keep
            </label>
            <select
              id="merge-target"
              className={styles["labels-merge-select"]}
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
            >
              {[...selected].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className={styles["labels-merge-actions"]}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMergeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || selected.size < 2}
              onClick={() => void runMerge()}
            >
              Merge
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>
            {deleting && deleting.length > 1
              ? "Delete labels?"
              : "Delete label?"}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {deleting && deleting.length > 1 ? (
              <>
                This removes <strong>{deleting.length} labels</strong> from
                every save and from the catalog. Cmd+Z restores it.
              </>
            ) : (
              <>
                This removes <strong>{deleting?.[0]}</strong> from every save
                and the catalog. Cmd+Z restores it.
              </>
            )}
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => deleting?.length && void remove(deleting)}
            >
              Delete
            </Button>
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

function LabelRowView({
  row,
  busy,
  checked,
  editingName,
  colorMenuOpen,
  onToggleCheck,
  onOpenColorMenu,
  onPickColor,
  onPatchDescription,
  onStartRename,
  onCancelRename,
  onRename,
  onDelete,
}: {
  row: LabelRow;
  busy: boolean;
  checked: boolean;
  editingName: boolean;
  colorMenuOpen: boolean;
  onToggleCheck: (checked: boolean) => void;
  onOpenColorMenu: (open: boolean) => void;
  onPickColor: (color: string | null) => void;
  onPatchDescription: (description: string | null) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={styles["labels-row"]}
      data-active={editingName || editingDesc || menuOpen || colorMenuOpen}
    >
      <span className={styles["labels-head-check"]}>
        <input
          type="checkbox"
          className={styles["labels-checkbox"]}
          checked={checked}
          aria-label={`Select ${row.name}`}
          onChange={(e) => onToggleCheck(e.target.checked)}
        />
      </span>
      <Popover.Root open={colorMenuOpen} onOpenChange={onOpenColorMenu}>
        <Popover.Trigger
          render={
            <button
              type="button"
              className={styles["labels-swatch-btn"]}
              aria-label={`Color for ${row.name}`}
              disabled={busy}
            >
              <span
                className={styles["labels-dot"]}
                style={{ background: row.color ?? DEFAULT_DOT }}
              />
            </button>
          }
        />
        <Popover.Content
          className={styles["labels-color-popup"]}
          sideOffset={6}
        >
          <div className={styles["labels-color-grid"]}>
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={styles["labels-color-opt"]}
                style={{ background: c }}
                aria-label={`Use ${c}`}
                onClick={() => onPickColor(c)}
              />
            ))}
          </div>
          <Popover.Separator />
          <Popover.Item type="button" onClick={() => onPickColor(null)}>
            <Popover.ItemLabel>Clear color</Popover.ItemLabel>
          </Popover.Item>
        </Popover.Content>
      </Popover.Root>
      <div className={styles["labels-name-cell"]}>
        {editingName ? (
          <RenameInput
            initial={row.name}
            onSubmit={onRename}
            onCancel={onCancelRename}
          />
        ) : (
          <button
            type="button"
            className={styles["labels-text-trigger"]}
            onClick={onStartRename}
          >
            {row.name}
          </button>
        )}
      </div>
      <div className={styles["labels-desc-cell"]}>
        {editingDesc ? (
          <DescriptionInput
            initial={row.description ?? ""}
            onSubmit={(next) => {
              const cleaned = next.trim() || null;
              const prev = row.description?.trim() || null;
              if (cleaned !== prev) onPatchDescription(cleaned);
              setEditingDesc(false);
            }}
            onCancel={() => setEditingDesc(false)}
          />
        ) : (
          <button
            type="button"
            className={[
              styles["labels-text-trigger"],
              row.description ? "" : styles["labels-text-empty"],
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setEditingDesc(true)}
          >
            {row.description ?? "Add label description…"}
          </button>
        )}
      </div>
      <span className={styles["labels-col-numeric"]}>
        {row.userCount || ""}
      </span>
      <span className={styles["labels-col-date"]}>
        {formatDate(row.createdAt)}
      </span>
      <div className={styles["labels-row-menu"]}>
        <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Menu.Trigger
            render={
              <button
                type="button"
                className={styles["labels-menu-trigger"]}
                aria-label={`Actions for ${row.name}`}
                disabled={busy}
              >
                <IconDotsOutline18 width={14} height={14} />
              </button>
            }
          />
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={6}>
              <Menu.Popup>
                <Menu.Item onClick={onStartRename}>
                  <Menu.ItemLabel>Rename</Menu.ItemLabel>
                </Menu.Item>
                <Menu.Item onClick={() => setEditingDesc(true)}>
                  <Menu.ItemLabel>Edit description</Menu.ItemLabel>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item onClick={onDelete}>
                  <Menu.ItemLabel>Delete…</Menu.ItemLabel>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}

function DescriptionInput({
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
    <Input
      data-size="sm"
      value={value}
      autoFocus
      placeholder="Add label description…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value);
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

function RenameInput({
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
    <Input
      data-size="sm"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value.trim());
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

const DATE_FMT_SHORT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const DATE_FMT_WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    ? DATE_FMT_SHORT.format(date)
    : DATE_FMT_WITH_YEAR.format(date);
}
