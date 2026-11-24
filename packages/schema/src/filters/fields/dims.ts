import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { saves } from "../../db";
import { defineField } from "./descriptor";

export type MediaOrientation =
  | "square"
  | "portrait"
  | "panoramic-portrait"
  | "landscape"
  | "panoramic-landscape";

const ORIENTATION_PRESETS = [
  { id: "square", label: "Square", value: "square" },
  { id: "landscape", label: "Landscape", value: "landscape" },
  { id: "portrait", label: "Portrait", value: "portrait" },
  {
    id: "panoramic-landscape",
    label: "Panoramic landscape",
    value: "panoramic-landscape",
  },
  {
    id: "panoramic-portrait",
    label: "Panoramic portrait",
    value: "panoramic-portrait",
  },
] as const;

const ASPECT_PRESETS = [
  { id: "1:1", label: "1:1", value: "1:1" },
  { id: "4:3", label: "4:3", value: "4:3" },
  { id: "3:4", label: "3:4", value: "3:4" },
  { id: "16:9", label: "16:9", value: "16:9" },
  { id: "9:16", label: "9:16", value: "9:16" },
] as const;

type AspectPresetValue = (typeof ASPECT_PRESETS)[number]["value"];

const ASPECT_TARGETS = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
} satisfies Record<AspectPresetValue, number>;

export const ASPECT_TOLERANCE = 0.06;

export function parseAspectRatio(value: string): number | null {
  const parts = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!parts) {
    return null;
  }
  const width = Number(parts[1]);
  const height = Number(parts[2]);
  const ratio = width / height;
  return width > 0 && height > 0 && Number.isFinite(ratio) ? ratio : null;
}

export function orientationFromDims(
  width: number | null | undefined,
  height: number | null | undefined,
): MediaOrientation | null {
  if (
    width === null ||
    width === undefined ||
    height === null ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const r = width / height;
  if (r >= 2) {
    return "panoramic-landscape";
  }
  if (r <= 0.5) {
    return "panoramic-portrait";
  }
  if (r >= 0.9 && r <= 1.1) {
    return "square";
  }
  if (r > 1) {
    return "landscape";
  }
  return "portrait";
}

export function aspectFromDims(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (
    width === null ||
    width === undefined ||
    height === null ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const r = width / height;
  for (const preset of ASPECT_PRESETS) {
    const target = ASPECT_TARGETS[preset.value];
    if (Math.abs(r - target) / target <= ASPECT_TOLERANCE) {
      return preset.value;
    }
  }
  return null;
}

function ratioSql(): SQL {
  return sql`(cast(${saves.width} as real) / cast(${saves.height} as real))`;
}

function orientationSql(): SQL {
  const r = ratioSql();
  return sql`case
    when ${saves.width} is null or ${saves.height} is null
      or ${saves.width} <= 0 or ${saves.height} <= 0 then null
    when ${r} >= 2 then 'panoramic-landscape'
    when ${r} <= 0.5 then 'panoramic-portrait'
    when ${r} >= 0.9 and ${r} <= 1.1 then 'square'
    when ${r} > 1 then 'landscape'
    else 'portrait'
  end`;
}

function aspectSql(): SQL {
  const r = ratioSql();
  const tol = ASPECT_TOLERANCE;
  const near = (target: number) =>
    sql`abs(${r} - ${target}) / ${target} <= ${tol}`;
  return sql`case
    when ${saves.width} is null or ${saves.height} is null
      or ${saves.width} <= 0 or ${saves.height} <= 0 then null
    when ${near(1)} then '1:1'
    when ${near(4 / 3)} then '4:3'
    when ${near(3 / 4)} then '3:4'
    when ${near(16 / 9)} then '16:9'
    when ${near(9 / 16)} then '9:16'
    else null
  end`;
}

export const orientation = defineField({
  id: "shape",
  type: "enum",
  label: "Shape",
  group: "media",
  presets: ORIENTATION_PRESETS,
  project: (s) => orientationFromDims(s.width, s.height),
  sqlProjection: () => orientationSql(),
});

export const aspect = defineField({
  id: "aspect",
  type: "enum",
  label: "Aspect",
  group: "media",
  presets: ASPECT_PRESETS,
  project: (s) => aspectFromDims(s.width, s.height),
  sqlProjection: () => aspectSql(),
});
