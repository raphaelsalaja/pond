import { formatNumber } from "@/shared/lib/format";
import type { CatalogModel } from "../types";

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function compactTokens(value: number | undefined): string {
  if (!value) {
    return "—";
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return String(value);
}

export function tokenPrice(value: string | undefined): string {
  if (value === undefined || !value.trim()) {
    return "—";
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    return "—";
  }
  return `${priceFormat.format(price * 1_000_000)}/M`;
}

export function priceHint(
  kind: "Input" | "Output",
  value: string | undefined,
): string | undefined {
  const text = tokenPrice(value);
  if (text === "—") {
    return undefined;
  }
  return `${kind} ${text.replace(/\/M$/, "")} per million tokens`;
}

export function contextHint(value: number | undefined): string {
  if (!value) {
    return "Not reported by provider";
  }
  return `${formatNumber(value)} token context window`;
}

export function modelHint(model: CatalogModel): string {
  const parts: Array<string> = [];
  if (model.description) {
    parts.push(model.description);
  }
  if (model.maxOutputTokens) {
    parts.push(`${formatNumber(model.maxOutputTokens)} output tokens`);
  }
  return parts.join(". ");
}

export function selectedIds(
  models: Array<CatalogModel>,
  visibleIds: Array<string> | undefined,
) {
  const selectable = models.filter((model) => model.available !== false);
  return new Set(visibleIds ?? selectable.map((model) => model.id));
}
