/// <reference lib="dom" />

import type { JsonObject, JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import type { BrowserValidators } from "../lib/browser-validation";
import { buildItemExpression } from "../lib/expression";

interface BehancePage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: { publishedAt?: string; authorUrl?: string };
}

interface BehanceSize {
  url?: string;
  width?: number | null;
}

export function buildExpression(projectId: string): string {
  return buildItemExpression(
    (validators) => validators,
    inPageBehanceHarvest,
    projectId,
  );
}

/** The store keeps every module size; the widest is the `source` upload, ahead of `max_3840` and `disp`. */
async function inPageBehanceHarvest(
  _projectId: string,
  norm: BrowserValidators,
): Promise<BehancePage | null> {
  const deadline = Date.now() + 12_000;
  let raw: string | null | undefined;
  while (Date.now() < deadline) {
    raw = document.getElementById("beconfig-store_state")?.textContent;
    if (raw) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  if (!raw) {
    return null;
  }
  const isRecord = (value: unknown): value is JsonObject =>
    norm.object.safeParse(value).success;
  const textAt = (record: JsonObject, key: string): string | undefined =>
    norm.text.safeParse(record[key]).data || undefined;
  const numberAt = (record: JsonObject, key: string): number | undefined =>
    norm.number.safeParse(record[key]).data;
  const isSize = (value: unknown): value is BehanceSize =>
    isRecord(value) &&
    (value.url === undefined || norm.text.safeParse(value.url).success) &&
    (value.width === undefined ||
      value.width === null ||
      numberAt(value, "width") !== undefined);
  const sizesIn = (holder: JsonObject, key: string): Array<BehanceSize> => {
    const group = holder[key];
    const sizes: Array<unknown> =
      isRecord(group) && Array.isArray(group.allAvailable)
        ? group.allAvailable
        : [];
    return sizes.filter(isSize);
  };
  const store: unknown = JSON.parse(raw);
  const state = isRecord(store) ? store.project : undefined;
  const found = isRecord(state) ? state.project : undefined;
  if (!found) {
    return null;
  }
  const project: JsonObject = isRecord(found) ? found : {};
  const pick = (sizes: Array<BehanceSize>) =>
    sizes.reduce<BehanceSize | undefined>(
      (best, s) => (!best || (s.width ?? 0) > (best.width ?? 0) ? s : best),
      undefined,
    )?.url;
  const mediaUrls: BehancePage["mediaUrls"] = [];
  const modules: Array<unknown> = Array.isArray(project.modules)
    ? project.modules
    : [];
  for (const module of modules) {
    if (!isRecord(module) || module.__typename !== "ImageModule") {
      continue;
    }
    const url = pick(sizesIn(module, "imageSizes"));
    if (url) {
      mediaUrls.push({ url, type: "image" });
    }
  }
  if (mediaUrls.length === 0) {
    const cover = pick(sizesIn(project, "covers"));
    if (cover) {
      mediaUrls.push({ url: cover, type: "image" });
    }
  }
  const owners: unknown = project.owners;
  const first: unknown = Array.isArray(owners) ? owners[0] : undefined;
  const owner = isRecord(first) ? first : undefined;
  const page: BehancePage = { mediaUrls, meta: {} };
  const name = textAt(project, "name");
  if (name) {
    page.title = name;
  }
  const description = textAt(project, "description");
  if (description) {
    page.description = description;
  }
  const displayName = owner ? textAt(owner, "displayName") : undefined;
  if (displayName) {
    page.author = displayName;
  }
  const authorUrl = owner ? textAt(owner, "url") : undefined;
  if (authorUrl) {
    page.meta.authorUrl = authorUrl;
  }
  const publishedOn = numberAt(project, "publishedOn");
  if (publishedOn) {
    page.meta.publishedAt = new Date(publishedOn * 1000).toISOString();
  }
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
