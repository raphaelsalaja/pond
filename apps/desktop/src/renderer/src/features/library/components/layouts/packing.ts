export interface CardLayoutItem {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  mediaHeight: number;
}

export interface CardLayoutResult {
  items: Array<CardLayoutItem>;
  totalHeight: number;
}

export interface AspectEntry {
  id: string;
  aspect: number;
}

export const LIBRARY_SAVE_GAP = 16;

function columnMetrics(
  containerWidth: number,
  columnMinimum: number,
  gap: number,
) {
  const count = Math.max(
    1,
    Math.floor((containerWidth + gap) / (columnMinimum + gap)),
  );
  return {
    count,
    width: (containerWidth - gap * (count - 1)) / count,
  };
}

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

export function packGrid(
  ids: ReadonlyArray<string>,
  containerWidth: number,
  columnMinimum: number,
  gap: number,
  chromeHeight: number,
): CardLayoutResult {
  if (containerWidth <= 0 || ids.length === 0) {
    return { items: [], totalHeight: 0 };
  }
  const columns = columnMetrics(containerWidth, columnMinimum, gap);
  const mediaHeight = columns.width;
  const height = mediaHeight + chromeHeight;
  const items = ids.map((id, index) => {
    const column = index % columns.count;
    const row = Math.floor(index / columns.count);
    return {
      id,
      width: columns.width,
      height,
      mediaHeight,
      top: row * (height + gap),
      left: column * (columns.width + gap),
    };
  });
  const rows = Math.ceil(ids.length / columns.count);
  return {
    items,
    totalHeight: rows * height + (rows - 1) * gap,
  };
}

export function packList(
  ids: ReadonlyArray<string>,
  containerWidth: number,
  rowHeight: number,
  previewHeight: number,
): CardLayoutResult {
  if (containerWidth <= 0 || ids.length === 0) {
    return { items: [], totalHeight: 0 };
  }
  return {
    items: ids.map((id, index) => ({
      id,
      top: index * rowHeight,
      left: 0,
      width: containerWidth,
      height: rowHeight,
      mediaHeight: previewHeight,
    })),
    totalHeight: ids.length * rowHeight,
  };
}

export function packWaterfall(
  entries: ReadonlyArray<AspectEntry>,
  containerWidth: number,
  columnMinimum: number,
  gap: number,
  chromeHeight: number,
): CardLayoutResult {
  if (containerWidth <= 0 || entries.length === 0) {
    return { items: [], totalHeight: 0 };
  }
  const columns = columnMetrics(containerWidth, columnMinimum, gap);
  const heights = Array.from({ length: columns.count }, () => 0);
  const items: Array<CardLayoutItem> = [];

  for (const entry of entries) {
    const mediaHeight = columns.width / safeAspect(entry.aspect);
    let target = 0;
    for (let index = 1; index < columns.count; index += 1) {
      if ((heights[index] ?? 0) < (heights[target] ?? 0)) {
        target = index;
      }
    }
    const top = heights[target] ?? 0;
    items.push({
      id: entry.id,
      top,
      left: target * (columns.width + gap),
      width: columns.width,
      height: mediaHeight + chromeHeight,
      mediaHeight,
    });
    heights[target] = top + mediaHeight + chromeHeight + gap;
  }

  return {
    items,
    totalHeight: Math.max(0, Math.max(...heights) - gap),
  };
}

export function packJustified(
  entries: ReadonlyArray<AspectEntry>,
  containerWidth: number,
  targetHeight: number,
  gap: number,
  chromeHeight: number,
): CardLayoutResult {
  if (containerWidth <= 0 || entries.length === 0) {
    return { items: [], totalHeight: 0 };
  }

  const items: Array<CardLayoutItem> = [];
  let row: Array<AspectEntry> = [];
  let aspectSum = 0;
  let top = 0;

  const flush = (mediaHeight: number) => {
    let left = 0;
    for (const entry of row) {
      const width = safeAspect(entry.aspect) * mediaHeight;
      items.push({
        id: entry.id,
        top,
        left,
        width,
        height: mediaHeight + chromeHeight,
        mediaHeight,
      });
      left += width + gap;
    }
    top += mediaHeight + chromeHeight + gap;
    row = [];
    aspectSum = 0;
  };

  for (const entry of entries) {
    const normalized = { ...entry, aspect: safeAspect(entry.aspect) };
    row.push(normalized);
    aspectSum += normalized.aspect;
    const naturalWidth = aspectSum * targetHeight + gap * (row.length - 1);
    if (naturalWidth >= containerWidth) {
      const available = containerWidth - gap * (row.length - 1);
      flush(available / aspectSum);
    }
  }
  if (row.length > 0) {
    flush(targetHeight);
  }

  return {
    items,
    totalHeight: Math.max(0, top - gap),
  };
}

export function stackSections(
  lead: CardLayoutResult | undefined,
  rest: CardLayoutResult,
  spacing: number,
) {
  const dividerTop = lead?.totalHeight ?? 0;
  const offset = dividerTop + spacing;
  if (!lead && offset === 0) {
    return { ...rest, dividerTop };
  }
  return {
    items: [
      ...(lead?.items ?? []),
      ...rest.items.map((item) => ({ ...item, top: item.top + offset })),
    ],
    totalHeight: offset + rest.totalHeight,
    dividerTop,
  };
}
