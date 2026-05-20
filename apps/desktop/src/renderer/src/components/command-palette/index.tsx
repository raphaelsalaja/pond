import { Dialog, Kbd, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useSave } from "@/pool/hooks";
import { usePrefs } from "@/pool/prefs";
import { useSelectedIds } from "@/pool/selection";
import type { Save } from "@/pool/types";
import { Command as Cmd } from "./cmdk";
import { ACTION_COMMANDS } from "./registry/actions";
import { useSaveCommands, useTagCommands } from "./registry/dynamic";
import { NAVIGATION_COMMANDS } from "./registry/navigation";
import { SAVE_CONTEXT_COMMANDS } from "./registry/save-context";
import { SETTINGS_COMMANDS } from "./registry/settings";
import { SOURCE_COMMANDS } from "./registry/sources";
import {
  type Command,
  type CommandScope,
  GROUP_ORDER,
  type PaletteCtx,
  SCOPE_LABEL,
  SCOPE_ORDER,
} from "./registry/types";
import styles from "./styles.module.css";
import { useChords } from "./use-chords";

const DETAIL_PATTERNS: readonly string[] = [
  "/detail/:id",
  "/source/:source/detail/:id",
  "/untagged/detail/:id",
  "/recents/detail/:id",
  "/random/detail/:id",
  "/trash/detail/:id",
  "/save/:id",
  "/source/:source/save/:id",
  "/untagged/save/:id",
  "/recents/save/:id",
  "/random/save/:id",
  "/trash/save/:id",
  "/item/:id",
];

function useFocusedSaveId(): string | null {
  const location = useLocation();
  for (const pattern of DETAIL_PATTERNS) {
    const match = matchPath({ path: pattern, end: true }, location.pathname);
    if (match?.params?.id) return match.params.id;
  }
  return null;
}

function Root() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<CommandScope>("all");
  const navigate = useNavigate();
  const location = useLocation();
  const selectedIds = useSelectedIds();
  const focusedFromUrl = useFocusedSaveId();
  const focusedSaveId: string | null =
    selectedIds.length === 1 ? (selectedIds[0] ?? null) : focusedFromUrl;
  const focusedSave = useSave(focusedSaveId) ?? null;
  const [, patchPreferences] = usePrefs("preferences");
  const toastManager = useToast();

  const close = useCallback(() => setOpen(false), []);

  const ctx = useMemo<PaletteCtx>(
    () => ({
      navigate,
      close,
      pond: window.pond,
      selectedIds,
      focusedSaveId,
      focusedSave: (focusedSave as Save | null) ?? null,
      setTheme: (theme) => patchPreferences({ theme }),
      toast: {
        success: (msg) => toastManager.add({ title: msg, type: "success" }),
        warn: (msg) => toastManager.add({ title: msg, type: "error" }),
      },
    }),
    [
      navigate,
      close,
      selectedIds,
      focusedSaveId,
      focusedSave,
      patchPreferences,
      toastManager,
    ],
  );

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

  useEffect(() => {
    if (open) {
      setSearch("");
      setScope("all");
    }
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not a read.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const tagCommands = useTagCommands(open);
  const saveCommands = useSaveCommands(search);

  const staticCommands = useMemo<Command[]>(
    () => [
      ...NAVIGATION_COMMANDS,
      ...SAVE_CONTEXT_COMMANDS,
      ...ACTION_COMMANDS,
      ...SETTINGS_COMMANDS,
      ...SOURCE_COMMANDS,
    ],
    [],
  );

  const allCommands = useMemo<Command[]>(
    () => [...staticCommands, ...tagCommands, ...saveCommands],
    [staticCommands, tagCommands, saveCommands],
  );

  useChords(staticCommands, () => ctx);

  const visibleCommands = useMemo(() => {
    return allCommands.filter((c) => {
      if (c.when && !c.when(ctx)) return false;
      if (scope === "all") return true;
      return c.scope === scope || c.scope === "all";
    });
  }, [allCommands, scope, ctx]);

  const grouped = useMemo(() => {
    const map = new Map<Command["group"], Command[]>();
    for (const c of visibleCommands) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return GROUP_ORDER.flatMap((group) => {
      const list = map.get(group);
      if (!list || list.length === 0) return [];
      return [{ group, items: list }];
    });
  }, [visibleCommands]);

  const onScopeKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const i = SCOPE_ORDER.indexOf(scope);
        const len = SCOPE_ORDER.length;
        const next = SCOPE_ORDER[(i + dir + len) % len] ?? "all";
        setScope(next);
      } else if (e.key === "Escape" && scope !== "all") {
        e.preventDefault();
        setScope("all");
      }
    },
    [scope],
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Content className={styles.dialog}>
        <div className={styles.shell}>
          <ScopeTabs scope={scope} onScopeChange={setScope} />
          <Cmd
            label="Pond command palette"
            shouldFilter
            loop
            onKeyDown={onScopeKey}
          >
            <div className={styles["search-row"]}>
              <Cmd.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command or search…"
                className={styles["search-input"]}
                autoFocus
              />
            </div>
            <Cmd.List className={styles.list}>
              <Cmd.Empty>
                <span className={styles["empty-headline"]}>
                  No commands match
                </span>
                <span className={styles["empty-hint"]}>
                  Try a different scope or search term
                </span>
              </Cmd.Empty>
              {grouped.map(({ group, items }) => (
                <Cmd.Group key={group} heading={group}>
                  {items.map((c) => (
                    <Cmd.Item
                      key={c.id}
                      value={c.id}
                      keywords={[c.label, ...(c.keywords ?? [])]}
                      onSelect={() => void c.perform(ctx)}
                    >
                      <span className={styles["item-main"]}>
                        <span className={styles["item-label"]}>{c.label}</span>
                        {c.description ? (
                          <span className={styles["item-description"]}>
                            {c.description}
                          </span>
                        ) : null}
                      </span>
                      {c.shortcut ? (
                        <Kbd.Cluster keys={c.shortcut} />
                      ) : c.chord ? (
                        <Kbd.Cluster
                          keys={c.chord.map((k) => k.toUpperCase())}
                          separator="then"
                        />
                      ) : null}
                    </Cmd.Item>
                  ))}
                </Cmd.Group>
              ))}
            </Cmd.List>
          </Cmd>
          <Footer />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ScopeTabs({
  scope,
  onScopeChange,
}: {
  scope: CommandScope;
  onScopeChange: (s: CommandScope) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Command scopes">
      {SCOPE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={s === scope}
          data-active={s === scope ? "true" : undefined}
          className={styles.tab}
          onClick={() => onScopeChange(s)}
        >
          {SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <div className={styles.footer}>
      <span className={styles["footer-hint"]}>
        <Kbd.Cluster keys={["↑", "↓"]} />
        Navigate
      </span>
      <span className={styles["footer-hint"]}>
        <Kbd.Cluster keys={["↵"]} />
        Run
      </span>
      <span className={styles["footer-hint"]}>
        <Kbd.Cluster keys={["⇥"]} />
        Switch tab
      </span>
      <span className={styles["footer-hint"]}>
        <Kbd.Cluster keys={["⎋"]} />
        Close
      </span>
    </div>
  );
}

export const CommandPalette = { Root };
