import { DEFAULT_APP_ICON } from "@shared/app-icons";
import type { LibraryIconId } from "./icons";

export type LibraryMark =
  | { kind: "image"; src: string | null }
  | { kind: "pond"; tint: string }
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; icon: LibraryIconId };

const SIZE = 256;
/** Matches the 88px `.tile` so the saved logo keeps the preview's proportions. */
const PREVIEW_TILE = 88;
export const PREVIEW_GLYPH = 60;
export const PREVIEW_EMOJI = 52;

export function markKey(mark: LibraryMark): string {
  if (mark.kind === "image") return `image:${mark.src ?? "default"}`;
  if (mark.kind === "pond") return `pond:${mark.tint}`;
  if (mark.kind === "emoji") return `emoji:${mark.emoji}`;
  return `icon:${mark.icon}`;
}

/** The default tint is what a Library without a stored logo already shows. */
export function isDefaultMark(mark: LibraryMark): boolean {
  if (mark.kind === "image") return mark.src === null;
  return mark.kind === "pond" && mark.tint === DEFAULT_APP_ICON;
}

/** Library logos are stored as image data URLs, so emoji and icon marks are drawn into a PNG. */
export async function markToLogo(
  mark: LibraryMark,
  tile: HTMLElement | null,
): Promise<string | null> {
  if (isDefaultMark(mark)) return null;
  if (mark.kind === "image") return mark.src;
  if (mark.kind === "pond") {
    const result = await window.pond.query("library.identity.pondLogo", {
      tint: mark.tint,
    });
    if (!result.ok) throw new Error("Couldn't load the Pond logo. Try again.");
    return result.icon;
  }
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const preview = tile?.querySelector(`[data-mark="${markKey(mark)}"]`);
  if (!tile || !preview) throw new Error("Logo preview is missing.");

  context.fillStyle = resolveColor(tile, "--tile-color");
  context.fillRect(0, 0, SIZE, SIZE);
  const scale = SIZE / PREVIEW_TILE;

  if (mark.kind === "emoji") {
    const family = getComputedStyle(
      preview.firstElementChild ?? preview,
    ).fontFamily;
    context.font = `${PREVIEW_EMOJI * scale}px ${family}`;
    context.textAlign = "center";
    const metrics = context.measureText(mark.emoji);
    const offset =
      (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    context.fillText(mark.emoji, SIZE / 2, SIZE / 2 + offset);
    return canvas.toDataURL("image/png");
  }

  const glyph = preview.querySelector("svg");
  if (!glyph) throw new Error("Logo preview is missing.");
  const extent = PREVIEW_GLYPH * scale;
  const image = await svgImage(
    glyph,
    extent,
    resolveColor(tile, "--glyph-color"),
  );
  context.drawImage(image, (SIZE - extent) / 2, (SIZE - extent) / 2);
  return canvas.toDataURL("image/png");
}

/** Custom properties keep relative-color syntax unresolved; a probe's computed `color` is concrete. */
function resolveColor(host: HTMLElement, property: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${property})`;
  host.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

async function svgImage(
  svg: SVGSVGElement,
  size: number,
  color: string,
): Promise<HTMLImageElement> {
  /** SAFETY: a deep clone of an `<svg>` element is an `<svg>` element. */
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  clone.style.color = color;
  const markup = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  return image;
}
