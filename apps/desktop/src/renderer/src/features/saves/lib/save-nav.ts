import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import {
  getLastListPath,
  rememberListPath,
} from "@/features/saves/lib/list-path";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { getAppRouter } from "@/shared/lib/app-router";

export function saveIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/save\/([^/]+)\/?$/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function openSave(
  id: string,
  options: { replace?: boolean } = {},
): void {
  const path = `/save/${encodeURIComponent(id)}`;
  primarySelection.set(id);
  selection.setCursor(id);
  const router = getAppRouter();
  if (!router) return;
  const { pathname, searchStr } = router.state.location;
  rememberListPath(pathname, searchStr);
  if (options.replace) router.history.replace(path);
  else router.history.push(path);
}

/** Moves on when the open Save leaves its results, so a move or trash keeps the preview going. */
export function followDeparture(id: string): () => void {
  return resultNavigation.watchDeparture(id, (next) => {
    if (selection.getCursor() !== id) return;
    if (next) openSave(next, { replace: true });
    else closeSave();
  });
}

/** Drops the step when the viewer has already moved on, so a slow page load cannot jump back. */
export function stepSave(id: string, delta: number): void {
  void resultNavigation.next(id, delta).then(async (next) => {
    if (!next || selection.getCursor() !== id) return;
    await ensureSaves([next]);
    if (selection.getCursor() !== id) return;
    openSave(next);
  });
}

export function closeSave(): void {
  const router = getAppRouter();
  const cursor = selection.getCursor();
  primarySelection.set(cursor);
  if (!router) return;
  const reveal = cursor
    ? () => resultNavigation.reveal(cursor, { focus: true })
    : undefined;
  router.history.push(getLastListPath());
  void reveal?.();
}

export function syncPrimaryFromPath(pathname: string): void {
  const id = saveIdFromPath(pathname);
  const primary = id ?? selection.getCursor();
  if (primarySelection.get() !== primary) primarySelection.set(primary);
  rememberListPath(pathname);
}
