import { useSyncExternalStore } from "react";

type Platform = "mac" | "other";

let platform: Platform | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function ensure(): void {
  if (platform !== null || pending) return;
  pending = window.pond.appInfo().then((info) => {
    platform = info.platform === "darwin" ? "mac" : "other";
    pending = null;
    emit();
  });
}

export function usePlatform(): Platform {
  ensure();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => platform ?? "other",
    () => "other",
  );
}
