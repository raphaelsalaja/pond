/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { z } from "zod";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { selectRepositoryPreview } from "./open-graph";

const RepoExtrasSchema = z
  .object({
    homepage: z.string().optional().catch(undefined),
    readme: z.string().optional().catch(undefined),
  })
  .catch({});

/** What the browser fallback hands back: the rendered page, for the same parse the direct fetch uses. */
export const RepoPageHtmlSchema = z.object({
  html: z.string(),
  url: z.string(),
});

export function buildPageExpression(repoId: string): string {
  return buildItemExpression(() => ({}), inPageRepoHtml, repoId);
}

async function inPageRepoHtml(): Promise<{ html: string; url: string }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready =
      document.querySelector("article.markdown-body") ||
      Array.from(document.querySelectorAll("h2")).some(
        (heading) => heading.textContent?.trim() === "About",
      );
    if (ready) break;
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  return { html: document.documentElement.outerHTML, url: location.href };
}

/** Turns the blob `parseRepoPage` reads from either transport into a Capture. */
export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx): Capture | null {
  const capture = captureFromPageDom(raw, ctx);
  if (!capture) return null;
  capture.media = selectRepositoryPreview(capture.media);
  const { homepage, readme } = RepoExtrasSchema.parse(raw);
  if (homepage) capture.extras = { ...capture.extras, externalLink: homepage };
  if (readme) capture.article = { html: readme };
  return capture;
}
