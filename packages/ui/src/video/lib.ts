export const SPEED_OPTIONS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 8,
] as const;

export function frameStepTime(
  time: number,
  delta: number,
  frameRate: number | null | undefined,
): number | null {
  if (!frameRate || !Number.isFinite(frameRate) || frameRate <= 0) return null;
  return Math.max(0, (Math.round(time * frameRate) + delta) / frameRate);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatTime(sec: number): string {
  const total = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bufferedEnd(video: HTMLVideoElement): number {
  const { buffered, currentTime } = video;
  let end = 0;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
      return buffered.end(i);
    }
    end = Math.max(end, buffered.end(i));
  }
  return end;
}

export function stepPlaybackRate(rate: number, direction: 1 | -1): number {
  const speeds: ReadonlyArray<number> = SPEED_OPTIONS;
  const exact = speeds.indexOf(rate);
  if (exact >= 0) {
    return (
      SPEED_OPTIONS[
        Math.max(0, Math.min(SPEED_OPTIONS.length - 1, exact + direction))
      ] ?? rate
    );
  }
  if (direction > 0) {
    return (
      SPEED_OPTIONS.find((value) => value > rate) ??
      SPEED_OPTIONS.at(-1) ??
      rate
    );
  }
  const lower = [...SPEED_OPTIONS].reverse().find((value) => value < rate);
  return lower ?? SPEED_OPTIONS[0] ?? rate;
}

export function stepVolume(volume: number, delta = 0.05): number {
  return clamp(Math.round((volume + delta) * 20) / 20, 0, 1);
}
