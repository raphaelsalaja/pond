// Applies the app icon for the selected color and icon style, skipping changes nothing would show.

import type { AppIconStyle } from "../../shared/app-icons";
import type { AppIconSource } from "./app-icon-source";

export interface AppIconPorts {
  decide(id: string, style: AppIconStyle | null): AppIconSource;
  showImage(path: string): void;
  showBuiltin(): void;
  onError(err: Error): void;
}

export interface AppIconController {
  select(id: string): void;
  setStyle(style: AppIconStyle | null): void;
}

function sourceKey(source: AppIconSource): string {
  return source.kind === "builtin" ? "builtin" : `image:${source.path}`;
}

export function createAppIconController(
  ports: AppIconPorts,
): AppIconController {
  let id: string | null = null;
  let style: AppIconStyle | null = null;
  let applied: string | null = null;

  function apply(): void {
    if (id === null) return;
    const source = ports.decide(id, style);
    const key = sourceKey(source);
    if (key === applied) return;
    try {
      if (source.kind === "builtin") ports.showBuiltin();
      else ports.showImage(source.path);
      applied = key;
    } catch (err) {
      applied = null;
      ports.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  return {
    select(next) {
      id = next;
      apply();
    },
    setStyle(next) {
      style = next;
      apply();
    },
  };
}
