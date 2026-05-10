import {
  IconChevronDownOutline18,
  IconChevronRightOutline18,
  IconMagnifierOutline18,
} from "@pond/icons/outline";
import { AlertDialog, Button, Input, Select, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/pages/settings/styles.module.css";

interface TagRow {
  name: string;
  color: string | null;
  group: string | null;
  userCount: number;
  aiCount: number;
  createdAt: string | null;
}

interface CanonTag {
  id: string;
  name: string;
  color: string | null;
  group: string | null;
  usageCount?: number;
  createdAt?: string | number | null;
}

interface CountRow {
  name: string;
  userCount: number;
  aiCount: number;
}

const DEFAULT_DOT = "var(--ds-gray-a6)";
const NONE_VALUE = "__none__";
const EMPTY_GROUPS_KEY = "pond.tags.emptyGroups";

export function TagsSection() {
  const toast = useToast();
  const [rows, setRows] = useState<TagRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [emptyGroups, setEmptyGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EMPTY_GROUPS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const newInputRef = useRef<HTMLInputElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(EMPTY_GROUPS_KEY, JSON.stringify([...emptyGroups]));
    } catch {
      /* localStorage may be unavailable in sandboxed contexts */
    }
  }, [emptyGroups]);

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
        createdAt: toIso(t.createdAt),
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
          createdAt: null,
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
    if (!to.trim() || from === to) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const res = (await window.pond.query("tags.rename", { from, to })) as {
        ok: boolean;
        affected: number;
      };
      toast.add({
        title: "Tag renamed",
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
      setEditing(null);
    }
  }

  async function regroup(name: string, group: string | null) {
    setBusy(true);
    try {
      await window.pond.query("tags.update", { name, patch: { group } });
      if (group) {
        setEmptyGroups((prev) => {
          if (!prev.has(group)) return prev;
          const next = new Set(prev);
          next.delete(group);
          return next;
        });
      }
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
      await window.pond.query("tags.create", {
        name,
        group: newGroup,
      });
      if (newGroup) {
        setEmptyGroups((prev) => {
          if (!prev.has(newGroup)) return prev;
          const next = new Set(prev);
          next.delete(newGroup);
          return next;
        });
      }
      setNewName("");
      setNewGroup(null);
      setCreating(false);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  function startCreating() {
    setCreatingGroup(false);
    setCreating(true);
    requestAnimationFrame(() => newInputRef.current?.focus());
  }

  function startCreatingGroup() {
    setCreating(false);
    setCreatingGroup(true);
    requestAnimationFrame(() => newGroupInputRef.current?.focus());
  }

  function commitNewGroup() {
    const name = newGroupName.trim();
    if (!name) {
      setCreatingGroup(false);
      return;
    }
    setEmptyGroups((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    setNewGroupName("");
    setCreatingGroup(false);
  }

  function toggleGroup(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function deleteGroup(name: string) {
    const targets = rows.filter((r) => r.group === name);
    setBusy(true);
    try {
      await Promise.all(
        targets.map((t) =>
          window.pond.query("tags.update", {
            name: t.name,
            patch: { group: null },
          }),
        ),
      );
      setEmptyGroups((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      toast.add({
        title: targets.length ? "Group dissolved" : "Group removed",
        description: targets.length
          ? `${targets.length} tag${targets.length === 1 ? "" : "s"} ungrouped.`
          : undefined,
        type: "success",
      });
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        !filter ? true : r.name.toLowerCase().includes(filter.toLowerCase()),
      ),
    [rows, filter],
  );

  const knownGroups = useMemo(() => {
    const set = new Set<string>(emptyGroups);
    for (const r of rows) if (r.group) set.add(r.group);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, emptyGroups]);

  const { groupedItems, ungrouped } = useMemo(() => {
    const map = new Map<string, TagRow[]>();
    const flat: TagRow[] = [];
    for (const r of visible) {
      if (r.group) {
        const list = map.get(r.group) ?? [];
        list.push(r);
        map.set(r.group, list);
      } else {
        flat.push(r);
      }
    }
    return { groupedItems: map, ungrouped: flat };
  }, [visible]);

  return (
    <div className={styles["tags-page"]}>
      <header className={styles["tags-page-header"]}>
        <h1 className={styles["tags-page-title"]}>Tags</h1>
        <p className={styles["tags-page-subtitle"]}>
          Rename, group, and delete tags across every save.
        </p>
      </header>

      <div>
        <div className={styles["tags-toolbar"]}>
          <div className={styles["tags-filter"]}>
            <span className={styles["tags-filter-icon"]} aria-hidden>
              <IconMagnifierOutline18 width={14} height={14} />
            </span>
            <input
              type="search"
              className={styles["tags-filter-input"]}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name…"
            />
          </div>
          <div className={styles["tags-toolbar-actions"]}>
            <Button
              size="sm"
              variant="ghost"
              onClick={startCreatingGroup}
              disabled={busy || creatingGroup}
            >
              New Group
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={startCreating}
              disabled={busy || creating}
            >
              New Tag
            </Button>
          </div>
        </div>

        <div className={styles["tags-table"]}>
          <div className={styles["tags-table-head"]}>
            <span>
              Name
              <span className={styles["tags-sort-caret"]} aria-hidden>
                <IconChevronDownOutline18 width={12} height={12} />
              </span>
            </span>
            <span className={styles["tags-col-numeric"]}>Saves</span>
            <span className={styles["tags-col-numeric"]}>AI</span>
            <span className={styles["tags-col-date"]}>Created</span>
          </div>

          {creatingGroup ? (
            <div className={styles["tags-create-row"]}>
              <span className={styles["tags-group-glyph"]} aria-hidden />
              <Input.Root
                ref={newGroupInputRef}
                data-size="sm"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNewGroup();
                  if (e.key === "Escape") {
                    setCreatingGroup(false);
                    setNewGroupName("");
                  }
                }}
              />
              <div className={styles["tags-create-actions"]}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreatingGroup(false);
                    setNewGroupName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={commitNewGroup}
                  disabled={!newGroupName.trim()}
                >
                  Add Group
                </Button>
              </div>
            </div>
          ) : null}

          {creating ? (
            <div className={styles["tags-create-row"]}>
              <span
                className={styles["tags-dot"]}
                style={{ background: DEFAULT_DOT }}
                aria-hidden
              />
              <Input.Root
                ref={newInputRef}
                data-size="sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                    setNewGroup(null);
                  }
                }}
              />
              {knownGroups.length > 0 ? (
                <Select.Root
                  value={newGroup ?? NONE_VALUE}
                  onValueChange={(v) =>
                    setNewGroup(v === NONE_VALUE ? null : v)
                  }
                >
                  <Select.Trigger>
                    <Select.Value>{newGroup ?? "No Group"}</Select.Value>
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value={NONE_VALUE}>No Group</Select.Item>
                    {knownGroups.map((g) => (
                      <Select.Item key={g} value={g}>
                        {g}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              ) : null}
              <div className={styles["tags-create-actions"]}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setNewGroup(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={create}
                  disabled={busy || !newName.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : null}

          {knownGroups.map((groupName) => {
            const items = groupedItems.get(groupName) ?? [];
            const isCollapsed = collapsed.has(groupName);
            return (
              <div key={`group-${groupName}`}>
                <div className={styles["tags-group-row"]}>
                  <button
                    type="button"
                    className={styles["tags-group-trigger"]}
                    onClick={() => toggleGroup(groupName)}
                  >
                    <span className={styles["tags-chevron"]} aria-hidden>
                      {isCollapsed ? (
                        <IconChevronRightOutline18 width={12} height={12} />
                      ) : (
                        <IconChevronDownOutline18 width={12} height={12} />
                      )}
                    </span>
                    <span className={styles["tags-group-glyph"]} aria-hidden />
                    <span className={styles["tags-group-name"]}>
                      {groupName}
                    </span>
                    <span className={styles["tags-group-count"]}>
                      {items.length}
                    </span>
                  </button>
                  <div className={styles["tags-group-actions"]}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteGroup(groupName)}
                      disabled={busy}
                    >
                      Dissolve
                    </Button>
                  </div>
                </div>

                {!isCollapsed
                  ? items.map((row, idx) => (
                      <TagRowView
                        key={row.name}
                        row={row}
                        isLast={idx === items.length - 1}
                        nested
                        editing={editing === row.name}
                        busy={busy}
                        knownGroups={knownGroups}
                        onStartRename={() => setEditing(row.name)}
                        onCancelRename={() => setEditing(null)}
                        onRename={(next) => void rename(row.name, next)}
                        onChangeGroup={(g) => void regroup(row.name, g)}
                        onDelete={() => setDeleting(row.name)}
                      />
                    ))
                  : null}
              </div>
            );
          })}

          {ungrouped.map((row) => (
            <TagRowView
              key={row.name}
              row={row}
              editing={editing === row.name}
              busy={busy}
              knownGroups={knownGroups}
              onStartRename={() => setEditing(row.name)}
              onCancelRename={() => setEditing(null)}
              onRename={(next) => void rename(row.name, next)}
              onChangeGroup={(g) => void regroup(row.name, g)}
              onDelete={() => setDeleting(row.name)}
            />
          ))}

          {visible.length === 0 && knownGroups.length === 0 && !creating ? (
            <div className={styles["tags-empty"]}>
              {filter
                ? `No tags match "${filter}".`
                : "No tags yet. Add one above or tag a save."}
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog.Root
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>Delete Tag?</AlertDialog.Title>
          <AlertDialog.Description>
            This removes <strong>{deleting}</strong> from every save and the
            canonical list. Cmd+Z restores it.
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => deleting && void remove(deleting)}
            >
              Delete Tag
            </Button>
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

function TagRowView({
  row,
  nested = false,
  isLast = false,
  editing,
  busy,
  knownGroups,
  onStartRename,
  onCancelRename,
  onRename,
  onChangeGroup,
  onDelete,
}: {
  row: TagRow;
  nested?: boolean;
  isLast?: boolean;
  editing: boolean;
  busy: boolean;
  knownGroups: string[];
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (next: string) => void;
  onChangeGroup: (group: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={[
        styles["tags-row"],
        nested ? styles["tags-row-nested"] : "",
        nested && isLast ? styles["tags-row-nested-last"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles["tags-name"]}>
        {nested ? (
          <span className={styles["tags-tree-stub"]} aria-hidden />
        ) : null}
        <span
          className={styles["tags-dot"]}
          style={{ background: row.color ?? DEFAULT_DOT }}
          aria-hidden
        />
        {editing ? (
          <RenameInput
            initial={row.name}
            onSubmit={onRename}
            onCancel={onCancelRename}
          />
        ) : (
          <button
            type="button"
            className={styles["tags-name-button"]}
            onClick={onStartRename}
          >
            {row.name}
          </button>
        )}
      </div>
      <span className={styles["tags-col-numeric"]}>{row.userCount || ""}</span>
      <span className={styles["tags-col-numeric"]}>{row.aiCount || ""}</span>
      <span className={styles["tags-col-date"]}>
        {formatDate(row.createdAt)}
      </span>
      <div className={styles["tags-actions"]}>
        <Select.Root
          value={row.group ?? NONE_VALUE}
          onValueChange={(v) => onChangeGroup(v === NONE_VALUE ? null : v)}
        >
          <Select.Trigger>
            <Select.Value>{row.group ?? "No Group"}</Select.Value>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={NONE_VALUE}>No Group</Select.Item>
            {knownGroups.map((g) => (
              <Select.Item key={g} value={g}>
                {g}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Button
          size="sm"
          variant="ghost"
          onClick={onStartRename}
          disabled={busy}
        >
          Rename
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
          Delete
        </Button>
      </div>
    </div>
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
    <Input.Root
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
