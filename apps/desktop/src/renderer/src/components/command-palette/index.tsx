import { Dialog, Input } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSaves } from "@/pool/hooks";
import { useSearchResults } from "@/pool/search";
import type { Save } from "@/pool/types";
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

function Root() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const saves = useSaves();
  const search = useSearchResults(q);

  // Hotkey listener fires even while inputs elsewhere have focus —
  // Cmd+K is universally "open the palette", don't bail on input target.
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

  // Reset query on close so re-opening starts fresh.
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
        id: "a-refresh-metadata",
        label: "Refresh metadata for all saves",
        hint: "Action",
        run: () => {
          close();
          void window.pond.refreshBackfillStart({});
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
          void window.pond.syncRunNow("twitter");
        },
      },
    ],
    [close],
  );

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
        to: `/save/${s.id}`,
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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Content className={styles.dialog}>
        <Shell>
          <SearchRow>
            <Input.Root
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search saves, tags, actions…"
              autoComplete="off"
              spellCheck={false}
            />
          </SearchRow>
          <List>
            {items.length === 0 ? (
              <Empty>No matches</Empty>
            ) : (
              items.map((item, i) => (
                <ListItem
                  key={item.id}
                  data-active={i === active ? "true" : undefined}
                >
                  <ItemButton
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(item)}
                  >
                    <ItemLabel>{item.label}</ItemLabel>
                    {item.hint ? <ItemHint>{item.hint}</ItemHint> : null}
                  </ItemButton>
                </ListItem>
              ))
            )}
          </List>
        </Shell>
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface ShellProps extends React.ComponentPropsWithoutRef<"div"> {}

function Shell({ className, ...props }: ShellProps) {
  return (
    <div
      className={[styles.shell, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface SearchRowProps extends React.ComponentPropsWithoutRef<"div"> {}

function SearchRow({ className, ...props }: SearchRowProps) {
  return (
    <div
      className={[styles["search-row"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ListProps extends React.ComponentPropsWithoutRef<"ul"> {}

function List({ className, ...props }: ListProps) {
  return (
    <ul
      className={[styles.list, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ListItemProps extends React.ComponentPropsWithoutRef<"li"> {
  "data-active"?: "true" | undefined;
}

function ListItem({ className, ...props }: ListItemProps) {
  return (
    <li
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ItemButtonProps extends React.ComponentPropsWithoutRef<"button"> {}

function ItemButton({ className, type = "button", ...props }: ItemButtonProps) {
  return (
    <button
      type={type}
      className={[styles["item-btn"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ItemLabelProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemLabel({ className, ...props }: ItemLabelProps) {
  return (
    <span
      className={[styles["item-label"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ItemHintProps extends React.ComponentPropsWithoutRef<"span"> {}

function ItemHint({ className, ...props }: ItemHintProps) {
  return (
    <span
      className={[styles["item-hint"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface EmptyProps extends React.ComponentPropsWithoutRef<"li"> {}

function Empty({ className, ...props }: EmptyProps) {
  return (
    <li
      className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const CommandPalette = {
  Root,
  Shell,
  SearchRow,
  List,
  Item: ListItem,
  ItemButton,
  ItemLabel,
  ItemHint,
  Empty,
};

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
