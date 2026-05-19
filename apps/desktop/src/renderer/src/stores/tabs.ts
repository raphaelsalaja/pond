import { create } from "zustand";

export interface Tab {
  id: string;
  path: string;
  pinned: boolean;
}

function findLastPinnedIndex(tabs: Tab[]): number {
  for (let i = tabs.length - 1; i >= 0; i--) {
    if (tabs[i]?.pinned) return i;
  }
  return -1;
}

interface ClosedTab {
  path: string;
  index: number;
}

interface TabState {
  tabs: Tab[];
  activeId: string;
  recentlyClosed: ClosedTab[];
}

interface TabActions {
  open(path: string, opts?: { background?: boolean }): string;
  close(id: string): void;
  closeOthers(id: string): void;
  closeToRight(id: string): void;
  activate(id: string): void;
  activateByIndex(index: number): void;
  activateNext(): void;
  activatePrev(): void;
  pin(id: string): void;
  unpin(id: string): void;
  reorder(fromIndex: number, toIndex: number): void;
  setOrder(ids: string[]): void;
  duplicate(id: string): void;
  reopenClosed(): void;
  updatePath(id: string, path: string): void;
}

export type TabStore = TabState & TabActions;

const STORAGE_KEY = "pond.tabs";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadPersistedState(): TabState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TabState;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    return {
      tabs: parsed.tabs,
      activeId: parsed.activeId,
      recentlyClosed: [],
    };
  } catch {
    return null;
  }
}

// Tab state changes (activate / open / close / updatePath) fire on
// every click, every drag, every router subscription tick. We don't
// need to write the localStorage blob on every one of those — coalesce
// the last value and flush on the next idle tick so rapid switching
// stays off the main thread.
let pendingPersist: TabState | null = null;
let persistHandle: ReturnType<typeof setTimeout> | null = null;
const persistIdle: (cb: () => void) => unknown =
  typeof window !== "undefined" &&
  typeof (window as unknown as { requestIdleCallback?: unknown })
    .requestIdleCallback === "function"
    ? (cb) =>
        (
          window as unknown as {
            requestIdleCallback: (cb: () => void) => number;
          }
        ).requestIdleCallback(cb)
    : (cb) => setTimeout(cb, 100);

function writeNow(state: TabState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: state.tabs,
        activeId: state.activeId,
      }),
    );
  } catch {
    /* storage denied */
  }
}

function persist(state: TabState): void {
  pendingPersist = state;
  if (persistHandle !== null) return;
  persistHandle = setTimeout(() => {
    persistHandle = null;
    const next = pendingPersist;
    pendingPersist = null;
    if (next) persistIdle(() => writeNow(next));
  }, 0);
}

if (typeof window !== "undefined") {
  // Make sure the very latest state survives a quit or page reload —
  // the debounced write might still be pending.
  window.addEventListener("pagehide", () => {
    if (pendingPersist) writeNow(pendingPersist);
  });
}

function defaultState(): TabState {
  const id = uid();
  return {
    tabs: [{ id, path: "/", pinned: false }],
    activeId: id,
    recentlyClosed: [],
  };
}

const initial = loadPersistedState() ?? defaultState();

export const useTabStore = create<TabStore>((set, get) => ({
  ...initial,

  open(path, opts) {
    const id = uid();
    const tab: Tab = { id, path, pinned: false };
    set((s) => {
      const next = { ...s, tabs: [...s.tabs, tab] };
      if (!opts?.background) next.activeId = id;
      persist(next);
      return next;
    });
    return id;
  },

  close(id) {
    const s = get();
    if (s.tabs.length <= 1) return;

    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const tab = s.tabs[idx]!;
    if (tab.pinned) return;

    const nextTabs = s.tabs.filter((t) => t.id !== id);
    let nextActive = s.activeId;
    if (s.activeId === id) {
      const neighbor = nextTabs[Math.min(idx, nextTabs.length - 1)];
      if (neighbor) nextActive = neighbor.id;
    }

    const next: TabState = {
      tabs: nextTabs,
      activeId: nextActive,
      recentlyClosed: [
        { path: tab.path, index: idx },
        ...s.recentlyClosed,
      ].slice(0, 10),
    };
    persist(next);
    set(next);
  },

  closeOthers(id) {
    const s = get();
    const kept = s.tabs.filter((t) => t.id === id || t.pinned);
    if (kept.length === s.tabs.length) return;
    const next: TabState = {
      tabs: kept,
      activeId: id,
      recentlyClosed: s.recentlyClosed,
    };
    persist(next);
    set(next);
  },

  closeToRight(id) {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const kept = s.tabs.filter((t, i) => i <= idx || t.pinned);
    let nextActive = s.activeId;
    if (!kept.find((t) => t.id === nextActive)) {
      nextActive = id;
    }
    const next: TabState = {
      tabs: kept,
      activeId: nextActive,
      recentlyClosed: s.recentlyClosed,
    };
    persist(next);
    set(next);
  },

  activate(id) {
    const s = get();
    if (!s.tabs.find((t) => t.id === id)) return;
    const next: TabState = { ...s, activeId: id };
    persist(next);
    set(next);
  },

  activateByIndex(index) {
    const s = get();
    const tab = s.tabs[index];
    if (!tab) return;
    const next: TabState = { ...s, activeId: tab.id };
    persist(next);
    set(next);
  },

  activateNext() {
    const s = get();
    if (s.tabs.length === 0) return;
    const idx = s.tabs.findIndex((t) => t.id === s.activeId);
    const target = s.tabs[(idx + 1) % s.tabs.length];
    if (!target) return;
    const next: TabState = { ...s, activeId: target.id };
    persist(next);
    set(next);
  },

  activatePrev() {
    const s = get();
    if (s.tabs.length === 0) return;
    const idx = s.tabs.findIndex((t) => t.id === s.activeId);
    const target = s.tabs[(idx - 1 + s.tabs.length) % s.tabs.length];
    if (!target) return;
    const next: TabState = { ...s, activeId: target.id };
    persist(next);
    set(next);
  },

  pin(id) {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1 || s.tabs[idx]?.pinned) return;

    const tab = { ...s.tabs[idx]!, pinned: true };
    const without = s.tabs.filter((_, i) => i !== idx);
    const lastPinned = findLastPinnedIndex(without);
    const insertAt = lastPinned + 1;
    const nextTabs = [
      ...without.slice(0, insertAt),
      tab,
      ...without.slice(insertAt),
    ];

    const next: TabState = { ...s, tabs: nextTabs };
    persist(next);
    set(next);
  },

  unpin(id) {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1 || !s.tabs[idx]?.pinned) return;

    const tab = { ...s.tabs[idx]!, pinned: false };
    const without = s.tabs.filter((_, i) => i !== idx);
    const lastPinned = findLastPinnedIndex(without);
    const insertAt = lastPinned + 1;
    const nextTabs = [
      ...without.slice(0, insertAt),
      tab,
      ...without.slice(insertAt),
    ];

    const next: TabState = { ...s, tabs: nextTabs };
    persist(next);
    set(next);
  },

  reorder(fromIndex, toIndex) {
    const s = get();
    if (fromIndex === toIndex) return;
    const tabs = [...s.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    if (!moved) return;

    const lastPinned = findLastPinnedIndex(tabs);
    if (moved.pinned && toIndex > lastPinned + 1) return;
    if (!moved.pinned && toIndex <= lastPinned) return;

    tabs.splice(toIndex, 0, moved);
    const next: TabState = { ...s, tabs };
    persist(next);
    set(next);
  },

  // Replace the order of a contiguous slice of tabs. Used by the
  // motion `Reorder.Group` — we render pinned and unpinned tabs as
  // two independent groups, each calling this with its own subset
  // of ids. Pin separation is enforced by the rendering split, so
  // this action just splices `ids` back into the positions they
  // currently occupy without any extra validation.
  setOrder(ids) {
    const s = get();
    if (ids.length === 0) return;

    const byId = new Map(s.tabs.map((t) => [t.id, t]));
    const reordered: Tab[] = [];
    for (const id of ids) {
      const tab = byId.get(id);
      if (!tab) return;
      reordered.push(tab);
    }

    const subset = new Set(ids);
    const nextTabs: Tab[] = [];
    let cursor = 0;
    for (const t of s.tabs) {
      if (subset.has(t.id)) {
        const pick = reordered[cursor++];
        if (!pick) return;
        nextTabs.push(pick);
      } else {
        nextTabs.push(t);
      }
    }

    let changed = false;
    for (let i = 0; i < nextTabs.length; i++) {
      if (nextTabs[i] !== s.tabs[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    const next: TabState = { ...s, tabs: nextTabs };
    persist(next);
    set(next);
  },

  duplicate(id) {
    const s = get();
    const tab = s.tabs.find((t) => t.id === id);
    if (!tab) return;
    get().open(tab.path);
  },

  reopenClosed() {
    const s = get();
    const [entry, ...rest] = s.recentlyClosed;
    if (!entry) return;

    const id = uid();
    const tab: Tab = { id, path: entry.path, pinned: false };
    const insertAt = Math.min(entry.index, s.tabs.length);
    const tabs = [...s.tabs.slice(0, insertAt), tab, ...s.tabs.slice(insertAt)];

    const next: TabState = { tabs, activeId: id, recentlyClosed: rest };
    persist(next);
    set(next);
  },

  updatePath(id, path) {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (s.tabs[idx]?.path === path) return;
    const tabs = s.tabs.map((t) => (t.id === id ? { ...t, path } : t));
    const next: TabState = { ...s, tabs };
    persist(next);
    set(next);
  },
}));
