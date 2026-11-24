/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPagePinterestNormalize } from "./normalize";
import type { PinterestPinPage } from "./normalize";

export function buildExpression(pinId: string): string {
  return buildItemExpression(
    inPagePinterestNormalize,
    inPagePinterestHarvest,
    pinId,
  );
}

async function inPagePinterestHarvest(
  _pinId: string,
  norm: ReturnType<typeof inPagePinterestNormalize>,
): Promise<PinterestPinPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        '[data-test-id="pin-closeup-image"], [data-test-id="pinImg"], img[src*="pinimg.com"]',
      )
    ) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  return norm.extractPinPageMeta();
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
