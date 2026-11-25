/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageArenaNormalize } from "./normalize";
import type { ArenaBlockPage } from "./normalize";

export function buildExpression(blockId: string): string {
  return buildItemExpression(inPageArenaNormalize, inPageArenaHarvest, blockId);
}

async function inPageArenaHarvest(
  _blockId: string,
  norm: ReturnType<typeof inPageArenaNormalize>,
): Promise<ArenaBlockPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (
      document.querySelector(
        "[class*='BlockImage'], [class*='BlockText'], main img, main video",
      )
    ) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  return norm.extractBlockPageMeta();
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
