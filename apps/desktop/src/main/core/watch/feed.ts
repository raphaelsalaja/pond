import { normalizeFeedUrl } from "@pond/schema/watches";
import { z } from "zod";
import { readResponseBodyWithinBudget } from "../../lib/response-body";
import { normalizeEnqueueItems } from "../pipeline/enqueue-input";
import type { FetchWatchPage, WatchHarvestResult } from "./types";

const TextSchema = z.union([
  z.string(),
  z
    .object({ "#text": z.string().default("") })
    .transform((node) => node["#text"]),
]);
const LinkSchema = z.union([
  z.string().transform((href) => ({ href, rel: "alternate", base: undefined })),
  z
    .object({
      "@href": z.string().optional(),
      "@rel": z.string().default("alternate"),
      "@base": z.string().optional(),
      "#text": z.string().optional(),
    })
    .transform((node) => ({
      href: node["@href"] ?? node["#text"],
      rel: node["@rel"],
      base: node["@base"],
    })),
]);
const EntrySchema = z.object({
  link: z.array(LinkSchema).default([]),
  guid: z
    .union([
      z.string(),
      z
        .object({ "#text": z.string(), "@isPermaLink": z.string().optional() })
        .transform((node) =>
          node["@isPermaLink"] === "false" ? "" : node["#text"],
        ),
    ])
    .optional(),
  "@base": z.string().optional(),
});
const ChannelSchema = z.object({
  title: TextSchema.optional(),
  item: z.array(EntrySchema).default([]),
  "@base": z.string().optional(),
});
const FeedSchema = z.union([
  z
    .object({ rss: z.object({ channel: ChannelSchema }) })
    .transform(({ rss }) => ({
      title: rss.channel.title,
      entries: rss.channel.item,
      base: rss.channel["@base"],
    })),
  z
    .object({
      feed: z.object({
        title: TextSchema.optional(),
        entry: z.array(EntrySchema).default([]),
        "@base": z.string().optional(),
      }),
    })
    .transform(({ feed }) => ({
      title: feed.title,
      entries: feed.entry,
      base: feed["@base"],
    })),
]);

/** Feeds never need custom entities, and rejecting them keeps a public DTD or HTML in CDATA readable. */
const DECLARES_ENTITIES = /<!ENTITY/i;

type FeedResult =
  | (Extract<WatchHarvestResult, { ok: true }> & { title: string | null })
  | Extract<WatchHarvestResult, { ok: false }>;

function decodeFeed(body: Uint8Array, contentType: string | null): string {
  const prefix = Buffer.from(body.subarray(0, 4)).toString("hex");
  const bom = prefix.startsWith("efbbbf")
    ? "utf8"
    : prefix.startsWith("feff")
      ? "utf-16be"
      : prefix.startsWith("fffe")
        ? "utf-16le"
        : undefined;
  const charset =
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i.exec(
      contentType ?? "",
    );
  const signature =
    prefix === "003c003f"
      ? "utf-16be"
      : prefix === "3c003f00"
        ? "utf-16le"
        : undefined;
  const declaration = new TextDecoder("ascii").decode(
    body.subarray(0, body.indexOf(0x3e) + 1),
  );
  const encoding =
    bom ??
    charset?.[1] ??
    charset?.[2] ??
    charset?.[3] ??
    signature ??
    /^<\?xml\s[^?]*\bencoding\s*=\s*(["'])([^"']+)\1/.exec(declaration)?.[2] ??
    "utf8";
  return new TextDecoder(encoding, { fatal: true }).decode(body);
}

export async function readFeed(
  url: string,
  fetchPage: FetchWatchPage = fetch,
  signal?: AbortSignal,
): Promise<FeedResult> {
  const address = normalizeFeedUrl(url);
  if (!address) {
    return { ok: false, reason: "not_found" };
  }
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetchPage(address, {
      credentials: "omit",
      headers: {
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: requestSignal,
    });
    if (response.status === 404 || response.status === 410) {
      return { ok: false, reason: "not_found" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    if (response.status === 429) {
      return { ok: false, reason: "rate_limited" };
    }
    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }
    const body = await readResponseBodyWithinBudget(response, 5 * 1024 * 1024);
    if (!body) {
      return { ok: false, reason: "unavailable" };
    }
    const xml = decodeFeed(body, response.headers.get("content-type"));
    const { XMLParser, XMLValidator } = await import("fast-xml-parser");
    if (DECLARES_ENTITIES.test(xml) || XMLValidator.validate(xml) !== true) {
      return { ok: false, reason: "not_found" };
    }
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      removeNSPrefix: true,
      parseTagValue: false,
      isArray: (name) => ["item", "entry", "link"].includes(name),
    });
    const parsed = FeedSchema.safeParse(parser.parse(xml));
    if (!parsed.success) {
      return { ok: false, reason: "not_found" };
    }
    const feed = parsed.data;
    const responseUrl = response.url || address;
    const base = feed.base
      ? (normalizeFeedUrl(feed.base, responseUrl) ?? responseUrl)
      : responseUrl;
    const urls = feed.entries.flatMap((entry) => {
      const entryBase = entry["@base"]
        ? (normalizeFeedUrl(entry["@base"], base) ?? base)
        : base;
      const link = entry.link.find(
        (link) => link.rel === "alternate" && link.href,
      );
      const linkBase = link?.base
        ? (normalizeFeedUrl(link.base, entryBase) ?? entryBase)
        : entryBase;
      const href = link?.href
        ? normalizeFeedUrl(link.href, linkBase)
        : entry.guid
          ? normalizeFeedUrl(entry.guid)
          : null;
      return href ? [{ url: href }] : [];
    });
    const { candidates } = normalizeEnqueueItems(urls, "watch:web");
    return {
      ok: true,
      title: feed.title?.trim() || null,
      entries: candidates.map(({ url, source, sourceId }) => ({
        url,
        source,
        sourceId,
      })),
    };
  } catch {
    return {
      ok: false,
      reason: requestSignal.aborted ? "timeout" : "unavailable",
    };
  }
}
