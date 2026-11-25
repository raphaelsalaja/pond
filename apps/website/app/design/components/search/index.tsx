"use client";

import { IconMagnifier } from "@pond/icons";
import { Button, Dialog, Input, Keyboard } from "@pond/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { INTRODUCTION, pageGroups, reveal, TOKENS } from "../pages";
import styles from "./styles.module.css";

interface Entry {
  href: string;
  name: string;
  group?: string;
}

function entries(): Array<Entry> {
  return [
    INTRODUCTION,
    TOKENS,
    ...pageGroups().flatMap((group) =>
      group.pages.map((page) => ({ ...page, group: group.label })),
    ),
  ];
}

export function Search() {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const all = useMemo(() => entries(), []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.group?.toLowerCase().includes(needle),
    );
  }, [all, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    close();
    router.push(entry.href, { scroll: false });
    reveal(entry.href);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <Dialog.Trigger
        render={
          <Button
            variant="secondary"
            size="sm"
            width="full"
            className={styles.trigger}
          />
        }
      >
        <IconMagnifier size={14} />
        Search
        <Keyboard.Cluster keys={["⌘", "K"]} className={styles.keys} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Search</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <div className={styles.body}>
            <Input.Root>
              <Input.Icon>
                <IconMagnifier size={14} />
              </Input.Icon>
              <Input.Field
                autoFocus
                placeholder="Search…"
                aria-label="Search pages"
                aria-controls={listId}
                value={query}
                onValueChange={(value) => {
                  setQuery(value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((index) =>
                      Math.min(index + 1, results.length - 1),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(results[active]);
                  }
                }}
              />
            </Input.Root>
            {results.length === 0 ? (
              <p className={styles.empty}>No results found</p>
            ) : (
              <ul id={listId} className={styles.results}>
                {results.map((entry, index) => (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      scroll={false}
                      className={styles.result}
                      data-active={index === active || undefined}
                      onClick={() => {
                        close();
                        reveal(entry.href);
                      }}
                      onPointerMove={() => setActive(index)}
                    >
                      <span>{entry.name}</span>
                      {entry.group ? (
                        <span className={styles.group}>{entry.group}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
