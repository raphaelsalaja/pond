export function frameRateFromProbe(output: string): number | null {
  const match = output.match(/Video:[^\n]*?\s(\d+(?:\.\d+)?)\s+fps\b/i);
  const fps = Number(match?.[1]);
  if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) {
    return null;
  }
  if (fps === 23.98) {
    return 24_000 / 1001;
  }
  if (fps === 29.97) {
    return 30_000 / 1001;
  }
  if (fps === 59.94) {
    return 60_000 / 1001;
  }
  return fps;
}
