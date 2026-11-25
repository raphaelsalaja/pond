import type { CombineImagesOptions } from "./combine-images-contracts";

const COMBINABLE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/webp",
]);

const COMBINABLE_EXTENSIONS = [
  ".avif",
  ".gif",
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
];

export function isCombinableImage(
  mimeType: string | null | undefined,
  path: string,
): boolean {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (COMBINABLE_TYPES.has(mime)) return true;
  const lower = path.toLowerCase();
  return COMBINABLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export interface CombineSource {
  width: number;
  height: number;
}

export interface CombinePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CombineLayout {
  width: number;
  height: number;
  items: Array<CombinePlacement>;
}

export type CombineLayoutOptions = Pick<
  CombineImagesOptions,
  "direction" | "alignment" | "width" | "height" | "spacing" | "margin"
>;

/**
 * Width and height are canvas totals including margin; one anchors the scale and the other follows.
 * @remarks The cross axis wins when both are set. Margin and spacing never scale.
 */
export function layoutCombinedImages(
  sources: ReadonlyArray<CombineSource>,
  options: CombineLayoutOptions,
): CombineLayout {
  const horizontal = options.direction === "horizontal";
  const crossOf = (size: CombineSource) =>
    horizontal ? size.height : size.width;
  const mainOf = (size: CombineSource) =>
    horizontal ? size.width : size.height;
  const cross = Math.max(1, ...sources.map(crossOf));
  const natural = sources.map((source) => {
    const factor =
      options.alignment === "stretch"
        ? cross / Math.max(1, crossOf(source))
        : 1;
    return { main: mainOf(source) * factor, cross: crossOf(source) * factor };
  });
  const length = Math.max(
    1,
    natural.reduce((sum, size) => sum + size.main, 0),
  );
  const gaps = options.spacing * Math.max(0, sources.length - 1);
  const edges = options.margin * 2;
  const crossTarget = horizontal ? options.height : options.width;
  const mainTarget = horizontal ? options.width : options.height;
  const scale = Math.max(
    1 / cross,
    crossTarget !== null
      ? (crossTarget - edges) / cross
      : mainTarget !== null
        ? (mainTarget - edges - gaps) / length
        : 1,
  );
  const band = Math.max(1, Math.round(cross * scale));
  let cursor = options.margin;
  const items = natural.map((size) => {
    const main = Math.max(1, Math.round(size.main * scale));
    const across = Math.max(1, Math.round(size.cross * scale));
    const offset =
      options.alignment === "end"
        ? band - across
        : options.alignment === "center"
          ? Math.round((band - across) / 2)
          : 0;
    const placement = horizontal
      ? {
          left: cursor,
          top: options.margin + offset,
          width: main,
          height: across,
        }
      : {
          left: options.margin + offset,
          top: cursor,
          width: across,
          height: main,
        };
    cursor += main + options.spacing;
    return placement;
  });
  const span = Math.max(edges, cursor - options.spacing + options.margin);
  const breadth = band + edges;
  return horizontal
    ? { width: span, height: breadth, items }
    : { width: breadth, height: span, items };
}
