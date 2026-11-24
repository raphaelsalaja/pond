/** Chromium scales the visible tile budget with the display, from 512 MB up to a quarter of RAM. */
export const GPU_TILE_BUDGET_MB = 512;

/** Skia raises its resource cache to 256 MB when the machine has at least 4 GB of RAM. */
export const SKIA_RESOURCE_CACHE_MB = 96;

/** The discardable GPU cache uses the same 256 MB high-RAM default. */
export const GPU_DISCARDABLE_CACHE_MB = 128;

/** Desktop builds leave this off, so a frozen renderer keeps decoded pages until it exits. */
export const MEMORY_PURGE_ON_FREEZE = "kMemoryPurgeOnFreeze";

export interface ChromiumCommandLine {
  appendSwitch(name: string, value?: string): void;
  getSwitchValue(name: string): string;
}

export function applyChromiumMemoryLimits(
  commandLine: ChromiumCommandLine,
): void {
  commandLine.appendSwitch(
    "force-gpu-mem-available-mb",
    String(GPU_TILE_BUDGET_MB),
  );
  commandLine.appendSwitch(
    "skia-resource-cache-limit-mb",
    String(SKIA_RESOURCE_CACHE_MB),
  );
  commandLine.appendSwitch(
    "force-gpu-mem-discardable-limit-mb",
    String(GPU_DISCARDABLE_CACHE_MB),
  );
  const existing = commandLine.getSwitchValue("enable-features");
  const features = existing
    ? `${existing},${MEMORY_PURGE_ON_FREEZE}`
    : MEMORY_PURGE_ON_FREEZE;
  commandLine.appendSwitch("enable-features", features);
}
