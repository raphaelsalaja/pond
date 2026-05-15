import { useSyncExternalStore } from "react";

class RevealStore {
  private ids = new Set<string>();
  private listeners = new Set<() => void>();

  has(id: string): boolean {
    return this.ids.has(id);
  }

  reveal(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.notify();
  }

  conceal(id: string): void {
    if (!this.ids.has(id)) return;
    this.ids.delete(id);
    this.notify();
  }

  reset(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
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

export const reveal = new RevealStore();

export function useIsRevealed(id: string): boolean {
  return useSyncExternalStore(
    (cb) => reveal.subscribe(cb),
    () => reveal.has(id),
    () => reveal.has(id),
  );
}
