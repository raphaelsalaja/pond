export function createNavigationMailbox<T = string>() {
  const listeners = new Set<(path: T) => void>();
  let pending: T | undefined;
  return {
    receive(path: T): void {
      if (!listeners.size) pending = path;
      else for (const listener of listeners) listener(path);
    },
    subscribe(listener: (path: T) => void): () => void {
      listeners.add(listener);
      if (pending !== undefined) {
        const path = pending;
        pending = undefined;
        listener(path);
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
