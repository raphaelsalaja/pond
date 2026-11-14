import { resolveFileIndex } from "@/features/saves/lib/actions";
import {
  endSaveDragSession,
  startSaveDragSession,
} from "@/features/saves/state/drag-session";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

const SAVES = { one: "Save", other: "Saves" };

export const SAVE_DRAG_TYPE = "application/x-pond-save";

export interface SaveDragDataTransfer {
  readonly types: readonly string[];
  effectAllowed: DataTransfer["effectAllowed"];
  getData(format: string): string;
  setData(format: string, data: string): void;
  setDragImage?(image: Element, x: number, y: number): void;
}

export interface SaveDragStartEvent {
  readonly dataTransfer: SaveDragDataTransfer | null;
  preventDefault(): void;
}

let draggingIds: string[] = [];
let dragPreview: HTMLElement | null = null;
let removeSessionListeners: (() => void) | null = null;
let dragAnnouncement: HTMLElement | null = null;

export function draggingSaveIds(): string[] {
  return draggingIds;
}

export function clearDraggingSaveIds(): void {
  endSaveDrag();
}

export function isLibrarySaveDrag(
  dataTransfer: SaveDragDataTransfer | null | undefined,
): boolean {
  if (draggingIds.length) return true;
  return Array.from(dataTransfer?.types ?? []).includes(SAVE_DRAG_TYPE);
}

export function saveDropIds(
  dataTransfer: SaveDragDataTransfer | null | undefined,
): string[] {
  const fromMime = dataTransfer?.getData(SAVE_DRAG_TYPE).trim();
  if (fromMime) return fromMime.split(",").filter(Boolean);
  return draggingIds;
}

function cardImage(id: string): HTMLImageElement | null {
  const card = [
    ...document.querySelectorAll<HTMLElement>("[data-save-id]"),
  ].find((candidate) => candidate.dataset.saveId === id);
  return card?.querySelector("img") ?? null;
}

function createDragPreview(ids: readonly string[]): HTMLElement {
  const preview = document.createElement("div");
  preview.dataset.saveDragPreview = "";
  preview.setAttribute("aria-hidden", "true");
  preview.style.cssText =
    "position:fixed;top:-160px;left:-160px;width:92px;height:72px;pointer-events:none;z-index:2147483647;";

  for (const [index, id] of ids.slice(0, 3).entries()) {
    const layer = document.createElement("div");
    const offset = index * 5;
    layer.style.cssText = `position:absolute;inset:${offset}px ${12 - offset}px ${12 - offset}px ${offset}px;overflow:hidden;background:var(--ds-gray-3,#e5e5e5);border:1px solid color-mix(in srgb,var(--ds-gray-12,#111),transparent 82%);border-radius:10px;box-shadow:0 4px 12px rgb(0 0 0 / 20%);`;
    const image = cardImage(id);
    if (image) {
      /** SAFETY: cloning an img element always yields an img element. */
      const clone = image.cloneNode() as HTMLImageElement;
      clone.removeAttribute("id");
      clone.style.cssText =
        "display:block;width:100%;height:100%;object-fit:cover;";
      layer.append(clone);
    }
    preview.append(layer);
  }

  const count = document.createElement("span");
  count.textContent = formatPlural(ids.length, SAVES);
  count.style.cssText =
    "position:absolute;right:0;bottom:0;display:flex;align-items:center;min-height:24px;padding:0 8px;color:white;font:600 11px/1 system-ui,sans-serif;background:var(--ds-accent-9,#1677ff);border:2px solid white;border-radius:999px;box-shadow:0 2px 8px rgb(0 0 0 / 24%);white-space:nowrap;";
  preview.append(count);
  document.body.append(preview);
  return preview;
}

function announce(message: string): void {
  if (!dragAnnouncement) {
    dragAnnouncement = document.createElement("span");
    dragAnnouncement.dataset.saveDragAnnouncement = "";
    dragAnnouncement.setAttribute("role", "status");
    dragAnnouncement.setAttribute("aria-live", "polite");
    dragAnnouncement.setAttribute("aria-atomic", "true");
    dragAnnouncement.style.cssText =
      "position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    document.body.append(dragAnnouncement);
  }
  dragAnnouncement.textContent = "";
  requestAnimationFrame(() => {
    if (dragAnnouncement) dragAnnouncement.textContent = message;
  });
}

export function announceSaveDragTarget(
  folderName: string,
  count: number,
): void {
  announce(`Add ${formatPlural(count, SAVES)} to ${folderName}`);
}

function installSessionListeners(): void {
  removeSessionListeners?.();
  const finish = () => endSaveDrag();
  window.addEventListener("dragend", finish, { once: true });
  window.addEventListener("drop", finish, { once: true });
  removeSessionListeners = () => {
    window.removeEventListener("dragend", finish);
    window.removeEventListener("drop", finish);
    removeSessionListeners = null;
  };
}

const NATIVE_DRAG_IDLE_MS = 60_000;

/**
 * A native drag fires no dragend here, so a drop, click, Escape or idle timeout ends it.
 * @remarks Pointer releases only count before the OS drag starts or after it visibly left, since Chromium can report one as the drag takes over.
 */
function installNativeSessionListeners(): void {
  removeSessionListeners?.();
  let live = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const finish = () => endSaveDrag();
  const touch = () => {
    live = true;
    clearTimeout(idle);
    idle = setTimeout(finish, NATIVE_DRAG_IDLE_MS);
  };
  const released = (event: PointerEvent) => {
    if (live && event.buttons === 0) endSaveDrag();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") endSaveDrag();
  };
  idle = setTimeout(finish, NATIVE_DRAG_IDLE_MS);
  window.addEventListener("drop", finish);
  window.addEventListener("dragend", finish);
  window.addEventListener("dragenter", touch, true);
  window.addEventListener("dragover", touch, true);
  window.addEventListener("pointerdown", finish, true);
  window.addEventListener("pointermove", released, true);
  window.addEventListener("keydown", keydown, true);
  removeSessionListeners = () => {
    clearTimeout(idle);
    window.removeEventListener("drop", finish);
    window.removeEventListener("dragend", finish);
    window.removeEventListener("dragenter", touch, true);
    window.removeEventListener("dragover", touch, true);
    window.removeEventListener("pointerdown", finish, true);
    window.removeEventListener("pointermove", released, true);
    window.removeEventListener("keydown", keydown, true);
    removeSessionListeners = null;
  };
}

export function endSaveDrag(): void {
  draggingIds = [];
  endSaveDragSession();
  removeSessionListeners?.();
  document.body.removeAttribute("data-save-dragging");
  dragPreview?.remove();
  dragPreview = null;
}

export function beginSaveDrag(id: string, event?: SaveDragStartEvent): void {
  endSaveDrag();
  const selected = selection.has(id) ? [...selection.snapshot()] : [id];
  draggingIds = selected;
  document.body.dataset.saveDragging = String(selected.length);
  announce(`${formatPlural(selected.length, SAVES)} ready to add to a folder`);
  const ids = selected.filter((saveId) => {
    const save = pool.get(saveId);
    return save ? resolveFileIndex(save) != null : false;
  });
  startSaveDragSession({ ids: selected, hasFiles: ids.length > 0 });
  if (ids.length > 0) {
    /** `startDrag` only adds files to Chromium's drag; running both strands this window in a drag that never ends. */
    event?.preventDefault();
    installNativeSessionListeners();
    const fileIndexes: Record<string, number> = {};
    for (const saveId of ids) {
      const save = pool.get(saveId);
      const index = save ? resolveFileIndex(save) : null;
      if (index != null) fileIndexes[saveId] = index;
    }
    const session = draggingIds;
    void window.pond
      .query("saves.startDrag", { ids, fileIndex: 0, fileIndexes })
      .catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((result) => {
        if (result.ok || draggingIds !== session) return;
        endSaveDrag();
        notify({
          id: "save-drag",
          title: "Couldn't start the drag",
          description: result.error,
        });
      });
    return;
  }
  const dataTransfer = event?.dataTransfer;
  if (dataTransfer) {
    dataTransfer.setData(SAVE_DRAG_TYPE, selected.join(","));
    dataTransfer.effectAllowed = "copy";
    if (dataTransfer.setDragImage) {
      dragPreview = createDragPreview(selected);
      dataTransfer.setDragImage(dragPreview, 46, 36);
    }
  }
  installSessionListeners();
}
