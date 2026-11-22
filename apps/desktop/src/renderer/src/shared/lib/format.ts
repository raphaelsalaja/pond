import prettyBytes from "pretty-bytes";
import prettyMs from "pretty-ms";

const numberFormatter = new Intl.NumberFormat(undefined, {
  useGrouping: true,
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return numberFormatter.format(n);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "-";
  return prettyBytes(bytes, { binary: true });
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return compactFormatter.format(n);
}

/** Plural category follows the copy's language, not the reader's locale, so `0` never picks `one`. */
const pluralRules = new Intl.PluralRules("en");

export interface PluralForms {
  one: string;
  other: string;
}

export function formatPlural(count: number, forms: PluralForms): string {
  const noun = pluralRules.select(count) === "one" ? forms.one : forms.other;
  return `${formatNumber(count)} ${noun}`;
}

export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return prettyMs(total * 1000, {
    colonNotation: true,
    secondsDecimalDigits: 0,
  });
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  return prettyMs(total, {
    secondsDecimalDigits: total < 10_000 ? 1 : 0,
    millisecondsDecimalDigits: 0,
  });
}

const tsTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const tsDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatTimestampLine(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${tsTime.format(d)} · ${tsDate.format(d)}`;
}

export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? tsDate.format(d) : "";
}

export function formatAbsolute(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}
