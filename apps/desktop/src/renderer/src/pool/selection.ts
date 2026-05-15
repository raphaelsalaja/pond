import { useSyncExternalStore } from "react";

class SelectionStore {
  private ids = new Set<string>();
  private anchor: string | null = null;
  private listeners = new Set<() => void>();
  private cached: string[] | null = null;

  snapshot(): string[] {
    if (!this.cached) this.cached = Array.from(this.ids);
    return this.cached;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  size(): number {
    return this.ids.size;
  }

  set(ids: Iterable<string>): void {
    this.ids = new Set(ids);
    this.cached = null;
    this.notify();
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.cached = null;
    this.notify();
  }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.cached = null;
    this.notify();
  }

  clear(): void {
    if (this.ids.size === 0 && this.anchor === null) return;
    this.ids.clear();
    this.anchor = null;
    this.cached = null;
    this.notify();
  }

  setAnchor(id: string): void {
    this.anchor = id;
  }

  getAnchor(): string | null {
    return this.anchor;
  }

  setRange(allIds: string[], from: string, to: string): void {
    const fromIdx = allIds.indexOf(from);
    const toIdx = allIds.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    this.ids = new Set(allIds.slice(lo, hi + 1));
    this.cached = null;
    this.notify();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

export const selection = new SelectionStore();

export function useSelectionSize(): number {
  return useSyncExternalStore(
    (cb) => selection.subscribe(cb),
    () => selection.size(),
    () => selection.size(),
  );
}

export function useSelectedIds(): string[] {
  return useSyncExternalStore(
    (cb) => selection.subscribe(cb),
    () => selection.snapshot(),
    () => selection.snapshot(),
  );
}

export function useIsSelected(id: string): boolean {
  return useSyncExternalStore(
    (cb) => selection.subscribe(cb),
    () => selection.has(id),
    () => selection.has(id),
  );
}
