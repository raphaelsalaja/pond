export function gifLoopRange(start: number, end: number): [number, number] {
  const a = Math.max(0, Math.floor(start));
  const b = Math.max(0, Math.floor(end));
  return a <= b ? [a, b] : [b, a];
}

export function clampGifFrame(
  index: number,
  count: number,
  loop: [number, number] | null,
): number {
  if (count <= 0) return 0;
  const [rawStart, rawEnd] = loop ?? [0, count - 1];
  const start = Math.max(0, Math.min(rawStart, count - 1));
  const end = Math.max(start, Math.min(rawEnd, count - 1));
  return Math.max(start, Math.min(index, end));
}

export function nextGifFrame(
  index: number,
  count: number,
  loop: [number, number] | null,
): number {
  if (count <= 0) return 0;
  const current = clampGifFrame(index, count, loop);
  const [rawStart, rawEnd] = loop ?? [0, count - 1];
  const start = Math.max(0, Math.min(rawStart, count - 1));
  const end = Math.max(start, Math.min(rawEnd, count - 1));
  return current >= end ? start : current + 1;
}
