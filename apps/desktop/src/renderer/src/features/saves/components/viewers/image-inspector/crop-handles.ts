import { isElement } from "@pond/ui/dom";
import { CROP_HANDLES } from "@/features/saves/lib/image-regions";
import type { CropHandle } from "@/features/saves/lib/image-regions";

export const CROP_HANDLE_LABEL = {
  n: "Resize Top",
  s: "Resize Bottom",
  e: "Resize Right",
  w: "Resize Left",
  nw: "Resize Top Left",
  ne: "Resize Top Right",
  sw: "Resize Bottom Left",
  se: "Resize Bottom Right",
} satisfies Record<CropHandle, string>;

export function cropHandleFromTarget(
  target: EventTarget | null,
): CropHandle | null {
  if (!isElement(target)) {
    return null;
  }
  const value = target.closest("[data-handle]")?.getAttribute("data-handle");
  return CROP_HANDLES.find((handle) => handle === value) ?? null;
}
