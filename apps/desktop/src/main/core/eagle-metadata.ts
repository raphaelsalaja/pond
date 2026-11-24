import { DEFAULT_COLOR_TOLERANCE } from "@pond/schema/filters/color";
import type {
  ComparatorId,
  Predicate,
  Query,
} from "@pond/schema/filters/types";
import { z } from "zod";

/** Eagle compares color by Delta E, panoramas at 2.5:1, and camera as one string; Pond's fields only come close. */
const APPROXIMATE_PROPERTIES = new Set(["color", "shape", "camera"]);

const EagleRuleSchema = z.object({
  property: z.string(),
  method: z.string(),
  unit: z.string().optional(),
  value: z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
});
export const EagleSmartFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  conditions: z
    .array(
      z.object({
        match: z.enum(["AND", "OR"]).default("AND"),
        boolean: z.enum(["TRUE", "FALSE"]).optional(),
        rules: z.array(EagleRuleSchema),
      }),
    )
    .default([]),
  children: z.array(z.json()).default([]),
});
export const EagleTagGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()).default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});
export const EaglePaletteSchema = z.union([
  z.string(),
  z.object({
    color: z.tuple([
      z.number().min(0).max(255),
      z.number().min(0).max(255),
      z.number().min(0).max(255),
    ]),
  }),
]);
export function eaglePaletteColor(
  palette: z.infer<typeof EaglePaletteSchema>,
): string {
  if (z.string().safeParse(palette).success) {
    return z.string().parse(palette);
  }
  const channels = z
    .object({ color: z.tuple([z.number(), z.number(), z.number()]) })
    .parse(palette).color;
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mapRule(
  rule: z.infer<typeof EagleRuleSchema>,
  folders: ReadonlyMap<string, string>,
): Predicate | Query | null {
  const strings = z.array(z.string()).safeParse(rule.value);
  if (rule.property === "tags" || rule.property === "folders") {
    const field = rule.property === "tags" ? "tags" : "folder";
    if (rule.method === "empty" || rule.method === "not-empty") {
      return {
        field,
        operator: "empty",
        value: null,
        negate: rule.method === "not-empty",
      };
    }
    if (!strings.success || strings.data.length === 0) {
      return null;
    }
    const value =
      field === "folder"
        ? strings.data.map((id) => folders.get(id))
        : strings.data;
    if (value.some((id) => !id)) {
      return null;
    }
    const operators = {
      intersection: "every",
      union: "some",
      equal: "exact",
      identity: "none",
    } satisfies Record<string, ComparatorId>;
    const method = z
      .enum(["intersection", "union", "equal", "identity"])
      .safeParse(rule.method);
    return method.success
      ? {
          field,
          operator: operators[method.data],
          value: value.filter((id): id is string => Boolean(id)),
        }
      : null;
  }
  if (rule.property === "name") {
    const value = z.string().trim().min(1).safeParse(rule.value);
    const operators = {
      equal: "eq",
      startWith: "startsWith",
      endWith: "endsWith",
      contain: "contains",
      uncontain: "contains",
    } satisfies Record<string, ComparatorId>;
    const method = z
      .enum(["equal", "startWith", "endWith", "contain", "uncontain"])
      .safeParse(rule.method);
    return method.success && value.success
      ? {
          field: "title",
          operator: operators[method.data],
          value: value.data,
          negate: rule.method === "uncontain",
        }
      : null;
  }
  if (rule.property === "url" || rule.property === "annotation") {
    const field = rule.property === "url" ? "url" : "note";
    if (rule.method === "empty" || rule.method === "not-empty") {
      return { field, operator: "exists", value: rule.method === "not-empty" };
    }
    const value = z.string().trim().min(1).safeParse(rule.value);
    return value.success && ["contain", "uncontain"].includes(rule.method)
      ? {
          field,
          operator: "contains",
          value: value.data,
          negate: rule.method === "uncontain",
        }
      : null;
  }
  if (["cameraMake", "cameraModel", "lensModel"].includes(rule.property)) {
    const field = z
      .enum(["cameraMake", "cameraModel", "lensModel"])
      .parse(rule.property);
    const value = z.string().trim().min(1).safeParse(rule.value);
    const method = z
      .enum(["equal", "contain", "uncontain"])
      .safeParse(rule.method);
    if (!value.success || !method.success) {
      return null;
    }
    return {
      field,
      operator: method.data === "equal" ? "eq" : "contains",
      value: value.data,
      negate: method.data === "uncontain",
    };
  }
  const numbers = z.array(z.number()).safeParse(rule.value);
  if (
    [
      "width",
      "height",
      "fileSize",
      "duration",
      "focalLength",
      "aperture",
      "iso",
      "bpm",
    ].includes(rule.property) &&
    numbers.success &&
    numbers.data[0] !== undefined
  ) {
    const field = z
      .enum([
        "width",
        "height",
        "fileSize",
        "duration",
        "focalLength",
        "aperture",
        "iso",
        "bpm",
      ])
      .parse(rule.property);
    const operators = {
      "=": "eq",
      ">=": "gte",
      "<=": "lte",
      ">": "gt",
      "<": "lt",
      between: "between",
    } satisfies Record<string, ComparatorId>;
    const method = z
      .enum(["=", ">=", "<=", ">", "<", "between"])
      .safeParse(rule.method);
    if (
      !method.success ||
      (method.data === "between" && numbers.data.length !== 2)
    ) {
      return null;
    }
    if (field === "fileSize" && rule.unit !== "kb" && rule.unit !== "mb") {
      return null;
    }
    if (field === "duration" && !["s", "m", "h"].includes(rule.unit ?? "")) {
      return null;
    }
    const factor =
      field === "fileSize"
        ? rule.unit === "kb"
          ? 1024
          : 1_048_576
        : field === "duration"
          ? rule.unit === "h"
            ? 3600
            : rule.unit === "m"
              ? 60
              : 1
          : 1;
    const values = numbers.data.map((value) => value * factor);
    return {
      field,
      operator: operators[method.data],
      value: method.data === "between" ? values : (values[0] ?? 0),
    };
  }
  if (
    ["createTime", "dateTimeOriginal", "timestamp"].includes(rule.property) &&
    numbers.success &&
    numbers.data[0] !== undefined
  ) {
    const first = numbers.data[0];
    const field = rule.property === "createTime" ? "savedAt" : "takenAt";
    if (rule.method === "within" && Number.isInteger(first) && first > 0) {
      return { field, operator: "gte", value: `-P${first}D` };
    }
    const second = numbers.data[1];
    if (rule.method === "on") {
      return { field, operator: "between", value: [first, first + 86_399_999] };
    }
    if (rule.method === "after") {
      return { field, operator: "gte", value: first };
    }
    if (rule.method === "before") {
      return { field, operator: "lte", value: first + 86_400_000 };
    }
    if (rule.method === "between" && second !== undefined) {
      return {
        field,
        operator: "between",
        value: [first, second + 86_400_000],
      };
    }
  }
  if (
    rule.property === "rating" &&
    ["equal", "unequal"].includes(rule.method)
  ) {
    const value = z
      .enum(["none", "1", "2", "3", "4", "5"])
      .safeParse(rule.value);
    if (value.success) {
      return {
        field: "rating",
        operator: rule.method === "equal" ? "eq" : "neq",
        value: value.data === "none" ? 0 : Number(value.data),
      };
    }
  }
  if (
    rule.property === "fontActivated" &&
    ["activate", "deactivate"].includes(rule.method)
  ) {
    return {
      field: "fontActivated",
      operator: "eq",
      value: rule.method === "activate",
    };
  }
  if (
    rule.property === "color" &&
    ["similar", "accuracy"].includes(rule.method)
  ) {
    const hex = z
      .string()
      .regex(/^#?[0-9a-f]{6}$/i)
      .safeParse(rule.value);
    if (!hex.success) {
      return null;
    }
    return {
      field: "color",
      operator: "near",
      value: {
        hex: hex.data,
        tolerance:
          rule.method === "accuracy"
            ? DEFAULT_COLOR_TOLERANCE / 2
            : DEFAULT_COLOR_TOLERANCE,
      },
    };
  }
  if (rule.property === "shape" && ["equal", "unequal"].includes(rule.method)) {
    const orientation = z
      .enum([
        "square",
        "landscape",
        "portrait",
        "panoramic-landscape",
        "panoramic-portrait",
      ])
      .safeParse(rule.value);
    if (!orientation.success) {
      return null;
    }
    return {
      field: "shape",
      operator: rule.method === "equal" ? "eq" : "neq",
      value: orientation.data,
    };
  }
  if (
    rule.property === "camera" &&
    ["contain", "uncontain"].includes(rule.method)
  ) {
    const value = z.string().trim().min(1).safeParse(rule.value);
    if (!value.success) {
      return null;
    }
    const negate = rule.method === "uncontain";
    return {
      combinator: negate ? "and" : "or",
      rules: (["cameraMake", "cameraModel"] as const).map((field) => ({
        field,
        operator: "contains",
        value: value.data,
        negate,
      })),
    };
  }
  if (rule.property === "type" && ["equal", "unequal"].includes(rule.method)) {
    const value = z.string().trim().min(1).safeParse(rule.value);
    if (!value.success) {
      return null;
    }
    if (["video", "audio", "font"].includes(value.data)) {
      return {
        field: "type",
        operator: rule.method === "equal" ? "eq" : "neq",
        value: value.data,
      };
    }
    if (
      [
        "jpg",
        "png",
        "gif",
        "svg",
        "psd",
        "ai",
        "pdf",
        "bmp",
        "ico",
        "tif",
        "webp",
        "avif",
      ].includes(value.data)
    ) {
      return {
        field: "format",
        operator: rule.method === "equal" ? "some" : "none",
        value: [value.data],
      };
    }
  }
  return null;
}

export function eagleSmartFolderQuery(
  folder: z.input<typeof EagleSmartFolderSchema>,
  folders: ReadonlyMap<string, string> = new Map(),
): Query | null {
  const normalized = EagleSmartFolderSchema.parse(folder);
  const groups: Array<Query> = [];
  for (const condition of normalized.conditions) {
    const rules: Query["rules"] = [];
    for (const rule of condition.rules) {
      const mapped = mapRule(rule, folders);
      if (!mapped) {
        return null;
      }
      rules.push(mapped);
    }
    const group: Query = {
      combinator: condition.match === "AND" ? "and" : "or",
      rules,
    };
    if (condition.boolean === "FALSE") {
      group.not = true;
    }
    groups.push(group);
  }
  return groups.length === 1
    ? (groups[0] ?? null)
    : { combinator: "and", rules: groups };
}

export function unsupportedEagleRules(
  folder: z.infer<typeof EagleSmartFolderSchema>,
  folders: ReadonlyMap<string, string>,
): Array<string> {
  return folder.conditions.flatMap((condition) =>
    condition.rules
      .filter((rule) => !mapRule(rule, folders))
      .map((rule) => `${folder.name}: ${rule.property}/${rule.method}`),
  );
}

export function approximateEagleRules(
  folder: z.infer<typeof EagleSmartFolderSchema>,
  folders: ReadonlyMap<string, string>,
): Array<string> {
  return folder.conditions.flatMap((condition) =>
    condition.rules
      .filter(
        (rule) =>
          APPROXIMATE_PROPERTIES.has(rule.property) && mapRule(rule, folders),
      )
      .map((rule) => `${folder.name}: ${rule.property}/${rule.method}`),
  );
}
