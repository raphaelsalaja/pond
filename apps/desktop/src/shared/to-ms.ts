import type { WireJson } from "./wire";

function isDate(value: WireJson): value is Date {
  return Object.prototype.toString.call(value) === "[object Date]";
}

function isContainer(
  value: WireJson,
): value is Exclude<WireJson, string | number | boolean | null | Date> {
  return typeof value === "object" && value !== null && !isDate(value);
}

export function toMs(v: WireJson | undefined): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (isDate(v)) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (isContainer(v) || v === true || v === false) {
    return null;
  }

  const text = String(v).trim();
  if (!text) return null;
  const num = Number(text);
  if (Number.isFinite(num)) return num;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}
