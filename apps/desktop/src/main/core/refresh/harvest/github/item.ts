/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { Capture } from "@pond/schema/raw";
import { z } from "zod";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { selectRepositoryPreview } from "./open-graph";

interface GithubRepoPage {
  title: string;
  description?: string;
  author: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: { authorName: string; authorUrl: string; authorAvatar: string };
  homepage?: string;
  readme?: string;
}

const RepoExtrasSchema = z
  .object({
    homepage: z.string().optional().catch(undefined),
    readme: z.string().optional().catch(undefined),
  })
  .catch({});

export function buildExpression(repoId: string): string {
  return buildItemExpression(() => ({}), inPageGithubHarvest, repoId);
}

async function inPageGithubHarvest(): Promise<GithubRepoPage | null> {
  /** Long enough for search and Fish to read a README, short enough to keep the save row small. */
  const TEXT_LIMIT = 12_000;
  const deadline = Date.now() + 10_000;
  const meta = (name: string): string =>
    document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const aboutHeading = (): Element | undefined =>
    Array.from(document.querySelectorAll("h2")).find(
      (heading) => heading.textContent?.trim() === "About",
    );
  const readme = (): HTMLElement | null =>
    document.querySelector<HTMLElement>("article.markdown-body");
  while (Date.now() < deadline) {
    if (readme() || aboutHeading()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  /** A missing or private repo serves a 404 page without the repo meta. */
  const name = meta("octolytics-dimension-repository_nwo");
  if (!name.includes("/")) return null;
  const owner = name.split("/")[0] ?? "";

  const section = aboutHeading()?.parentElement;
  const about = section?.querySelector("p")?.textContent?.trim() ?? "";
  const topics = Array.from(
    section?.querySelectorAll<HTMLAnchorElement>('a[href^="/topics/"]') ?? [],
  )
    .map((a) => a.textContent?.trim() ?? "")
    .filter(Boolean);
  const homepage = Array.from(
    section?.querySelectorAll<HTMLAnchorElement>("a[href^='http']") ?? [],
  )
    .map((a) => a.href)
    .find((href) => !/^https?:\/\/([^/]+\.)?github\.com\b/.test(href));

  const page: GithubRepoPage = {
    title: name,
    author: owner,
    mediaUrls: [],
    meta: {
      authorName: owner,
      authorUrl: `https://github.com/${owner}`,
      authorAvatar: `https://github.com/${owner}.png`,
    },
  };
  const body = readme();
  const text = [
    about,
    topics.length > 0 ? `Topics: ${topics.join(", ")}` : "",
    body?.innerText?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (text) {
    page.description =
      text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
  }
  if (homepage) page.homepage = homepage;
  if (body) page.readme = readmeHtml(body);

  for (const url of openGraphImages()) {
    page.mediaUrls.push({ url, type: "image" });
  }
  return page;

  /** Resolves links and images against the page, and moves heading anchors onto their headings. */
  function readmeHtml(source: HTMLElement): string {
    const copy = source.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return "";
    for (const chrome of copy.querySelectorAll(
      ".zeroclipboard-container, clipboard-copy",
    )) {
      chrome.remove();
    }
    for (const anchor of copy.querySelectorAll("a.anchor")) {
      const heading = anchor.parentElement?.querySelector(
        "h1, h2, h3, h4, h5, h6",
      );
      if (heading && anchor.id && !heading.id) heading.id = anchor.id;
      anchor.remove();
    }
    const ids = new Set(
      Array.from(copy.querySelectorAll("[id]"), (element) => element.id),
    );
    for (const link of copy.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        const target = `user-content-${href.slice(1)}`;
        if (ids.has(target)) link.setAttribute("href", `#${target}`);
        continue;
      }
      link.setAttribute("href", link.href);
    }
    for (const img of copy.querySelectorAll<HTMLImageElement>("img[src]")) {
      img.setAttribute("src", img.src);
    }
    return copy.innerHTML;
  }

  function openGraphImages(): string[] {
    return Array.from(
      document.querySelectorAll(
        'meta[property="og:image"], meta[name="og:image"]',
      ),
    )
      .map((element) => element.getAttribute("content")?.trim() ?? "")
      .filter((url) => url.length > 0);
  }
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx): Capture | null {
  const capture = captureFromPageDom(raw, ctx);
  if (!capture) return null;
  capture.media = selectRepositoryPreview(capture.media);
  const { homepage, readme } = RepoExtrasSchema.parse(raw);
  if (homepage) capture.extras = { ...capture.extras, externalLink: homepage };
  if (readme) capture.article = { html: readme };
  return capture;
}
