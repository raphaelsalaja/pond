import { expect, it } from "vitest";
import {
  applyChromiumMemoryLimits,
  GPU_DISCARDABLE_CACHE_MB,
  GPU_TILE_BUDGET_MB,
  MEMORY_PURGE_ON_FREEZE,
  SKIA_RESOURCE_CACHE_MB,
} from "./chromium-memory";

it("caps GPU caches and purges a frozen renderer", () => {
  const switches: Array<[string, string | undefined]> = [];
  applyChromiumMemoryLimits({
    appendSwitch(name, value) {
      switches.push([name, value]);
    },
    getSwitchValue: () => "",
  });
  expect(switches).toEqual([
    ["force-gpu-mem-available-mb", String(GPU_TILE_BUDGET_MB)],
    ["skia-resource-cache-limit-mb", String(SKIA_RESOURCE_CACHE_MB)],
    ["force-gpu-mem-discardable-limit-mb", String(GPU_DISCARDABLE_CACHE_MB)],
    ["enable-features", MEMORY_PURGE_ON_FREEZE],
  ]);
});

it("keeps feature flags already on the command line", () => {
  const switches: Array<[string, string | undefined]> = [];
  applyChromiumMemoryLimits({
    appendSwitch(name, value) {
      switches.push([name, value]);
    },
    getSwitchValue: (name) =>
      name === "enable-features" ? "ExistingFeature" : "",
  });
  expect(switches.at(-1)).toEqual([
    "enable-features",
    `ExistingFeature,${MEMORY_PURGE_ON_FREEZE}`,
  ]);
});
