import { Dialog } from "@pond/ui";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  commandMenu,
  useCommandMenuOpen,
} from "@/features/library/state/command-menu";
import { openSave } from "@/features/saves/navigation";
import { useSaveLookup } from "@/features/search";
import { usePrefs } from "@/shared/state/prefs";
import { ResultsList } from "./results-list";
import { SearchField } from "./search-field";
import styles from "./styles.module.css";
import type { MenuEntry, MenuPage } from "./types";
import { useKeyboardMode } from "./use-keyboard-mode";
import { useMenuModel } from "./use-menu-model";

const PAGE_STEP = 8;

const PLACEHOLDERS = {
  root: "Search Pond or type a command…",
  actions: "Search actions…",
  folders: "Search folders…",
  views: "Search saved views…",
} satisfies Record<MenuPage["kind"] | "root", string>;

interface Frame {
  page: MenuPage;
  query: string;
  activeId: string | undefined;
}

interface MenuProps {
  useLookup: typeof useSaveLookup;
  onOpenSave: (id: string) => void;
}

function runAfterClose(run: () => void): void {
  commandMenu.close();
  requestAnimationFrame(run);
}

function actionsPage(entry: MenuEntry): MenuPage | null {
  if (entry.actions) {
    return {
      kind: "actions",
      key: `actions:${entry.id}`,
      title: entry.label,
      context: entry.noun,
      entries: entry.actions(),
    };
  }
  return entry.page?.() ?? null;
}

function resultsAnnouncement(query: string, count: number): string {
  if (!query) return "";
  if (count === 0) return "No results found";
  return count === 1 ? "1 result" : `${count} results`;
}

function CommandMenu({
  backRef,
  useLookup,
  onOpenSave,
}: MenuProps & { backRef: RefObject<(() => boolean) | null> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardMode();
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<readonly Frame[]>([]);
  const [direction, setDirection] = useState<"forward" | "back">();
  const [activeId, setActiveId] = useState<string>();
  const [focused, setFocused] = useState(true);
  const page = stack.at(-1)?.page ?? null;
  const trimmed = query.trim();
  const [ai] = usePrefs("ai");
  const lookup = useLookup(page ? "" : trimmed, {
    retrieve: Boolean(ai.semanticSearch || ai.enableClip),
  });
  const { model, resultCount } = useMenuModel({
    query: trimmed,
    page,
    lookup,
    onOpenSave,
  });
  const { entries } = model;
  const found = entries.findIndex((item) => item.entry.id === activeId);
  const activeIndex = found >= 0 ? found : 0;
  const active = entries[activeIndex]?.entry;

  function openPage(next: MenuPage): void {
    setStack((frames) => [
      ...frames,
      { page: next, query, activeId: active?.id },
    ]);
    setQuery("");
    setActiveId(undefined);
    setDirection("forward");
  }

  function back(): boolean {
    const frame = stack.at(-1);
    if (!frame) return false;
    setStack(stack.slice(0, -1));
    setQuery(frame.query);
    setActiveId(frame.activeId);
    setDirection("back");
    return true;
  }

  function execute(index: number): void {
    const entry = entries[index]?.entry;
    if (!entry) return;
    const next = entry.page?.();
    if (next) openPage(next);
    else if (entry.run) runAfterClose(entry.run);
  }

  function openActions(): boolean {
    const next = active && actionsPage(active);
    if (!next) return false;
    openPage(next);
    return true;
  }

  function moveTo(index: number): void {
    const entry = entries[index]?.entry;
    if (entry) setActiveId(entry.id);
  }

  function move(delta: number): void {
    const count = entries.length;
    if (count > 0) moveTo((activeIndex + delta + count) % count);
  }

  function jump(delta: number): void {
    const last = entries.length - 1;
    moveTo(Math.min(Math.max(activeIndex + delta, 0), last));
  }

  const latest = useRef({ execute, moveTo, back });
  useLayoutEffect(() => {
    latest.current = { execute, moveTo, back };
    backRef.current = stack.length > 0 ? back : null;
  });
  useLayoutEffect(
    () => () => {
      backRef.current = null;
    },
    [backRef],
  );

  const onActivate = useCallback((index: number) => {
    latest.current.moveTo(index);
  }, []);
  const onExecute = useCallback((index: number) => {
    latest.current.execute(index);
  }, []);
  const onBack = useCallback(() => {
    latest.current.back();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const { nativeEvent, key, metaKey, ctrlKey, shiftKey, altKey } = event;
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    const input = event.currentTarget;
    const collapsed = input.selectionStart === input.selectionEnd;
    const atStart = collapsed && input.selectionStart === 0;
    const atEnd = collapsed && input.selectionEnd === input.value.length;
    const chord = ctrlKey && !metaKey && !altKey && !shiftKey;

    let handled = true;
    if (key === "ArrowDown" && metaKey) jump(entries.length);
    else if (key === "ArrowUp" && metaKey) jump(-entries.length);
    else if (key === "ArrowDown" || (chord && (key === "n" || key === "j")))
      move(1);
    else if (key === "ArrowUp" || (chord && (key === "p" || key === "k")))
      move(-1);
    else if (key === "Home") jump(-entries.length);
    else if (key === "End") jump(entries.length);
    else if (key === "PageDown") jump(PAGE_STEP);
    else if (key === "PageUp") jump(-PAGE_STEP);
    else if (key === "Enter" && metaKey) openActions();
    else if (key === "Enter") execute(activeIndex);
    else if (key === "Tab" && shiftKey) back();
    else if (key === "Tab") openActions();
    else if (key === "ArrowRight" && atEnd) handled = openActions();
    else if (key === "ArrowLeft" && atStart) handled = back();
    else if (key === "Backspace" && query === "") handled = back();
    else handled = false;
    if (handled) event.preventDefault();
  }

  return (
    <>
      <SearchField
        inputRef={inputRef}
        value={query}
        placeholder={PLACEHOLDERS[page?.kind ?? "root"]}
        crumb={
          page
            ? {
                title: page.title,
                context: page.kind === "actions" ? page.context : undefined,
              }
            : undefined
        }
        busy={!page && Boolean(trimmed) && lookup.searching}
        activeDescendant={active?.id}
        onBack={onBack}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActiveId(undefined);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <ResultsList
        model={model}
        activeIndex={activeIndex}
        pageKey={page?.key ?? "root"}
        direction={direction}
        inactive={!focused}
        keyboard={keyboard}
        onActivate={onActivate}
        onExecute={onExecute}
      />
      <div className={styles["sr-only"]} aria-live="polite">
        {resultsAnnouncement(trimmed, resultCount)}
      </div>
    </>
  );
}

export function CommandMenuHost({
  useLookup = useSaveLookup,
  onOpenSave = openSave,
}: Partial<MenuProps> = {}) {
  const open = useCommandMenuOpen();
  const backRef = useRef<(() => boolean) | null>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) return;
        if (details.reason === "escape-key" && backRef.current?.()) {
          details.cancel();
          return;
        }
        commandMenu.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label="Search Pond">
          <Dialog.Title className={styles["sr-only"]}>Search Pond</Dialog.Title>
          <CommandMenu
            backRef={backRef}
            useLookup={useLookup}
            onOpenSave={onOpenSave}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
