import type {
  ConnectedAccount,
  Source,
  WatchedAccount,
  WatchKind,
} from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import {
  getAccount,
  listAccounts,
  partitionForAccount,
  patchAccount,
} from "./accounts";
import { listWatches, patchWatch } from "./watches";

/** Signed CDN URLs (Instagram, TikTok) expire, so found avatars refresh weekly; misses retry sooner. */
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

const AvatarResponseSchema = z.object({
  avatar: z.string().min(1).optional().catch(undefined),
});

const SubstackProfileSchema = z.object({
  photo_url: z.string().url().nullable().optional().catch(null),
});

const FETCH_TIMEOUT_MS = 10_000;
/** YouTube channel pages put og:image about 900 KB in, after their inline player config. */
const HTML_SCAN_BYTES = 2_000_000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
/** x.com and instagram only serve meta tags to link-preview crawlers, and x.com 404s the better-known ones (Googlebot, facebookexternalhit). */
const CRAWLER_UA =
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

interface AvatarSubject {
  handle: string | null;
  kind?: WatchKind;
  avatarUrl?: string | null;
  avatarCheckedAt?: string | null;
}

function isGenericOgImage(url: string): boolean {
  return /opengraph-image|default_open_graph|rweb\/ssr\/default|profile(?:\/|%2F)assets/i.test(
    url,
  );
}

function needsCheck(row: AvatarSubject): boolean {
  if (!row.handle) {
    return false;
  }
  if (row.avatarUrl && isGenericOgImage(row.avatarUrl)) {
    return true;
  }
  const checked = row.avatarCheckedAt ? Date.parse(row.avatarCheckedAt) : 0;
  const ttl = row.avatarUrl ? FOUND_TTL_MS : MISS_TTL_MS;
  return !Number.isFinite(checked) || Date.now() - checked > ttl;
}

/** Instagram and Threads CDN links carry their expiry as a hex Unix time in `oe`. */
function signedLinkExpired(url: string): boolean {
  const oe = /[?&]oe=([0-9a-f]+)/i.exec(url)?.[1];
  return oe ? Number.parseInt(oe, 16) * 1000 <= Date.now() : false;
}

const PROBE_TTL_MS = 60 * 60 * 1000;
const probedAt = new Map<string, number>();

/** Avatar links 404 once the person changes their picture, so found links get a HEAD probe at most hourly. */
async function linkBroken(url: string): Promise<boolean> {
  if (Date.now() - (probedAt.get(url) ?? 0) < PROBE_TTL_MS) {
    return false;
  }
  probedAt.set(url, Date.now());
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": BROWSER_UA },
    });
    return res.status === 403 || res.status === 404 || res.status === 410;
  } catch {
    return false;
  }
}

async function needsRefresh(row: AvatarSubject): Promise<boolean> {
  if (needsCheck(row)) {
    return true;
  }
  if (!row.handle || !row.avatarUrl) {
    return false;
  }
  return signedLinkExpired(row.avatarUrl) || (await linkBroken(row.avatarUrl));
}

function profilePageUrl(
  source: Source,
  handle: string,
  kind: WatchKind | undefined,
): string | null {
  if (kind === "playlist" || kind === "list") {
    return null;
  }
  const owner = handle.split("/")[0] ?? handle;
  const h = encodeURIComponent(owner);
  switch (source) {
    case "youtube":
      return /^UC[\w-]{20,}$/.test(owner)
        ? `https://www.youtube.com/channel/${h}`
        : `https://www.youtube.com/@${h}`;
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "instagram":
      return `https://www.instagram.com/${h}/`;
    case "threads":
      return `https://www.threads.com/@${h}`;
    case "twitter":
      return `https://x.com/${h}`;
    case "pinterest":
      return `https://www.pinterest.com/${h}/`;
    case "cosmos":
      return `https://www.cosmos.so/${h}`;
    case "github":
      return `https://github.com/${h}`;
    case "substack":
      return `https://substack.com/@${h}`;
    case "tumblr":
      return `https://www.tumblr.com/${h}`;
    case "savee":
      return `https://savee.com/${h}/`;
    case "behance":
      return `https://www.behance.net/${h}`;
    case "vimeo":
      return `https://vimeo.com/${h}`;
    case "dribbble":
      return `https://dribbble.com/${h}`;
    case "unsplash":
      return `https://unsplash.com/@${h}`;
    case "bluesky":
      return `https://bsky.app/profile/${h}`;
    default:
      return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function ogImageFrom(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (
      !/(?:property|name)\s*=\s*["']og:image(?::secure_url)?["']/i.test(tag)
    ) {
      continue;
    }
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!content) {
      continue;
    }
    const url = decodeEntities(content);
    if (/^https?:\/\//i.test(url) && !isGenericOgImage(url)) {
      return url;
    }
  }
  return null;
}

async function fetchOgImage(pageUrl: string): Promise<string | null> {
  for (const ua of [BROWSER_UA, CRAWLER_UA]) {
    try {
      const res = await fetch(pageUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml",
          /** Skips the EU consent interstitial on YouTube. */
          cookie: "CONSENT=YES+cb; SOCS=CAI",
        },
      });
      if (!res.ok) {
        continue;
      }
      const html = (await res.text()).slice(0, HTML_SCAN_BYTES);
      const image = ogImageFrom(html);
      if (image) {
        return image;
      }
    } catch {
      /** A failed fetch falls through to the next user agent. */
    }
  }
  return null;
}

/** Are.na exposes avatars through its v3 API; profile pages have no useful og tag. */
async function arenaAvatar(
  slug: string,
  path: "users" | "groups",
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.are.na/v3/${path}/${encodeURIComponent(slug)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return null;
    }
    const body = AvatarResponseSchema.safeParse(await res.json());
    return body.success ? (body.data.avatar ?? null) : null;
  } catch {
    return null;
  }
}

/** Substack's og:image is a generated name card; the public profile API carries the photo. */
async function substackAvatar(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://substack.com/api/v1/user/${encodeURIComponent(handle)}/public_profile`,
      {
        headers: { "user-agent": BROWSER_UA, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return null;
    }
    const body = SubstackProfileSchema.safeParse(await res.json());
    return body.success ? (body.data.photo_url ?? null) : null;
  } catch {
    return null;
  }
}

/** Pinterest's og:image is a site-wide card; the avatar lives in the page's embedded state JSON, first occurrence owned by the profile. */
async function pinterestAvatar(user: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.pinterest.com/${encodeURIComponent(user)}/`,
      {
        headers: { "user-agent": BROWSER_UA, accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const raw = /"image_xlarge_url"\s*:\s*"([^"]+)"/.exec(html)?.[1];
    if (!raw) {
      return null;
    }
    const url = decodeEntities(raw.replaceAll(String.raw`\/`, "/"));
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** Reddit's about.json 403s without a session; use the account jar when we have one. */
async function redditAvatar(
  name: string,
  partition?: string,
): Promise<string | null> {
  if (partition) {
    const { fetchRedditAvatar } = await import("../refresh/harvest/reddit/api");
    return fetchRedditAvatar(name, partition);
  }
  try {
    const res = await fetch(
      `https://www.reddit.com/user/${encodeURIComponent(name)}/about.json?raw_json=1`,
      {
        headers: { "user-agent": BROWSER_UA, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return null;
    }
    const { avatarFromMeJson, RedditAccountSchema } =
      await import("../refresh/harvest/reddit/listing");
    return avatarFromMeJson(RedditAccountSchema.parse(await res.json()));
  } catch {
    return null;
  }
}

async function resolveAvatarUrl(
  source: Source,
  handle: string,
  kind?: WatchKind,
  partition?: string,
): Promise<string | null> {
  if (source === "arena") {
    if (kind === undefined || kind === "user") {
      return arenaAvatar(handle, "users");
    }
    if (kind === "group") {
      return arenaAvatar(handle, "groups");
    }
    return null;
  }
  if (source === "reddit") {
    return redditAvatar(handle, partition);
  }
  if (source === "substack") {
    return substackAvatar(handle);
  }
  if (source === "pinterest") {
    const owner = handle.split("/")[0];
    return owner ? pinterestAvatar(owner) : null;
  }
  const pageUrl = profilePageUrl(source, handle, kind);
  return pageUrl ? fetchOgImage(pageUrl) : null;
}

let sweeping = false;

export function fillMissingAvatars(): void {
  if (sweeping) {
    return;
  }
  sweeping = true;
  void (async () => {
    try {
      for (const account of await listAccounts()) {
        if (!account.handle) {
          await probeHandle(account);
          continue;
        }
        if (
          account.source === "reddit" &&
          account.handle &&
          !account.avatarUrl
        ) {
          await checkAccount(account);
          continue;
        }
        if (!(await needsRefresh(account))) {
          continue;
        }
        await checkAccount(account);
      }
      for (const watch of await listWatches()) {
        if (!(await needsRefresh(watch))) {
          continue;
        }
        await checkWatch(watch);
      }
    } catch (error) {
      log.warn("[pond avatars] sweep failed", error);
    } finally {
      sweeping = false;
    }
  })();
}

/** Handles are otherwise learned on the first fetch, so an account still waiting on its first import would never get an avatar. */
async function probeHandle(account: ConnectedAccount): Promise<void> {
  const checked = account.avatarCheckedAt
    ? Date.parse(account.avatarCheckedAt)
    : 0;
  if (Number.isFinite(checked) && Date.now() - checked < MISS_TTL_MS) {
    return;
  }
  const { ensureAccountHandle } = await import("./account-key");
  await ensureAccountHandle(account);
  const probed = await getAccount(account.id);
  if (probed?.handle) {
    await checkAccount(probed);
    return;
  }
  await patchAccount(account.id, {
    avatarCheckedAt: new Date().toISOString(),
  });
}

async function checkAccount(account: ConnectedAccount): Promise<void> {
  const url = account.handle
    ? await resolveAvatarUrl(
        account.source,
        account.handle,
        undefined,
        partitionForAccount(account.id),
      )
    : null;
  await patchAccount(account.id, {
    avatarUrl: url,
    avatarCheckedAt: new Date().toISOString(),
  });
}

async function checkWatch(watch: WatchedAccount): Promise<void> {
  const url = await resolveAvatarUrl(watch.source, watch.handle, watch.kind);
  await patchWatch(watch.id, {
    avatarUrl: url,
    avatarCheckedAt: new Date().toISOString(),
  });
}
