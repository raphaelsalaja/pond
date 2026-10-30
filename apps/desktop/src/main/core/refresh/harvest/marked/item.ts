/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageMarkedNormalize, type MarkedRefPage } from "./normalize";

export function buildExpression(refId: string): string {
  return buildItemExpression(inPageMarkedNormalize, inPageMarkedHarvest, refId);
}

/** The ref page renders client-side and its share tags describe the site, so the harvest asks `getRef` like the page does. */
async function inPageMarkedHarvest(
  refId: string,
  norm: ReturnType<typeof inPageMarkedNormalize>,
): Promise<MarkedRefPage | null> {
  const res = await fetch("/api/data/getRef", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ args: [refId] }),
  });
  if (!res.ok) return null;
  const body: { data?: JsonValue } = await res.json();
  const ref = norm.parseRef(body.data ?? null);
  return ref ? norm.refPage(ref) : null;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
