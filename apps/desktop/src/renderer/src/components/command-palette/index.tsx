import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSaves } from "../../pool/hooks";
import { useSearchResults } from "../../pool/search";
import type { Save } from "../../pool/types";
import { Dialog, DialogContent, Input } from "../../ui";
import styles from "./styles.module.css";

interface ActionItem {
  kind: "action";
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface NavItem {
  kind: "nav";
  id: string;
  label: string;
  hint?: string;
  to: string;
}

interface SaveItem {
  kind: "save";
  id: string;
  label: string;
  hint?: string;
  to: string;
}

interface TagItem {
  kind: "tag";
  id: string;
  label: string;
  hint?: string;
  to: string;
}

type Item = ActionItem | NavItem | SaveItem | TagItem;

/**
 * Cmd-K palette. Mounted once at the shell; toggled by `Cmd+K` (or
 * `Ctrl+K` on Linux/Windows). Searches across:
 *
 *   - built-in actions (open settings, run backfill, etc.)
 *   - navigation entries (Library, Inbox, Activity, Trash)
 *   - saves (FTS5-backed via `useSearchResults`)
 *   - tags (in-memory pool)
 *
 * Selection model is the standard arrow-key + Enter combo, with
 * keyboard-first focus management — no mouse hover steals the active
 * row index until the user actually moves the cursor over the list.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const saves = useSaves();
  const search = useSearchResults(q);

  // Hotkey listener — needs to fire even while inputs elsewhere have
  // focus (Cmd+K is universally "open the palette"), so we don't bail
  // when target is an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset state on close. We keep the palette mounted so re-opening is
  // instant; clearing the query on close avoids the "wait, why does
  // this say `recipe`?" surprise.
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const navTo = useCallback(
    (path: string) => {
      navigate(path);
      close();
    },
    [navigate, close],
  );

  const builtInNav: NavItem[] = useMemo(
    () => [
      { kind: "nav", id: "n-library", label: "Library", to: "/", hint: "Go" },
      { kind: "nav", id: "n-inbox", label: "Inbox", to: "/inbox", hint: "Go" },
      {
        kind: "nav",
        id: "n-activity",
        label: "Activity",
        to: "/activity",
        hint: "Go",
      },
      { kind: "nav", id: "n-trash", label: "Trash", to: "/trash", hint: "Go" },
      {
        kind: "nav",
        id: "n-settings",
        label: "Settings",
        to: "/settings",
        hint: "Go",
      },
    ],
    [],
  );

  const builtInActions: ActionItem[] = useMemo(
    () => [
      {
        kind: "action",
        id: "a-backfill",
        label: "Run AI backfill",
        hint: "Action",
        run: () => {
          close();
          void window.pond.query("enrich.backfill", {});
        },
      },
      {
        kind: "action",
        id: "a-undo",
        label: "Undo last action",
        hint: "Cmd+Z",
        run: () => {
          close();
          void window.pond.undo();
        },
      },
      {
        kind: "action",
        id: "a-sync-twitter",
        label: "Sync Twitter bookmarks",
        hint: "Action",
        run: () => {
          close();
          // Fire an incremental run by default. The Settings page has
          // its own "Backfill all" button for the rare full re-walk.
          void window.pond.syncRunNow("twitter", "incremental");
        },
      },
    ],
    [close],
  );

  // Build the merged item list. Saves come from FTS when query is non-
  // empty, otherwise we show the most recent few saves so the palette
  // is useful even for "open something I saved 5 minutes ago".
  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const matchesQuery = (label: string) =>
      !needle || label.toLowerCase().includes(needle);

    const navMatches = builtInNav.filter((i) => matchesQuery(i.label));
    const actionMatches = builtInActions.filter((i) => matchesQuery(i.label));

    const saveMatches: SaveItem[] = (search.results ?? saves)
      .filter((r) => !r.deletedAt)
      .slice(0, 8)
      .map((s: Save) => ({
        kind: "save",
        id: `s-${s.id}`,
        label: s.title ?? s.url,
        hint: hostname(s.url),
        to: `/?id=${s.id}`,
      }));

    const tagSet = new Set<string>();
    for (const s of saves) {
      for (const t of s.tags) {
        if (matchesQuery(t)) tagSet.add(t.toLowerCase());
      }
    }
    const tagMatches: TagItem[] = Array.from(tagSet)
      .slice(0, 8)
      .map((t) => ({
        kind: "tag",
        id: `t-${t}`,
        label: `#${t}`,
        hint: "Tag",
        to: `/?tag=${encodeURIComponent(t)}`,
      }));

    return [...actionMatches, ...navMatches, ...tagMatches, ...saveMatches];
  }, [builtInNav, builtInActions, q, saves, search.results]);

  // Keep `active` in bounds when items shrink.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  const run = useCallback(
    (item: Item) => {
      if (item.kind === "action") {
        item.run();
        return;
      }
      navTo(item.to);
    },
    [navTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[active];
        if (item) run(item);
      } else if (e.key === "Escape") {
        close();
      }
    },
    [items, active, run, close],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={styles.dialog}>
        <div className={styles.shell}>
          <div className={styles.searchRow}>
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search saves, tags, actions…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <ul className={styles.list}>
            {items.length === 0 ? (
              <li className={styles.empty}>No matches</li>
            ) : (
              items.map((item, i) => (
                <li
                  key={item.id}
                  className={[
                    styles.item,
                    i === active ? styles.itemActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className={styles.itemBtn}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(item)}
                  >
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.hint ? (
                      <span className={styles.itemHint}>{item.hint}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
