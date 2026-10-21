import type { ConnectedAccount, Source } from "@pond/schema/db";
import { type Cookie, session, shell } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { extractorFor } from "../../pipeline/extractors";
import {
  listAccountsForSource,
  partitionForAccount,
} from "../../sync/accounts";
import { homeUrlForSource } from "../sources";
import { HARVEST_TIMEOUT_MS, NAV_TIMEOUT_MS, PARTITION } from "./constants";
import { looksLikeAuthWall, navigateWithTimeout } from "./navigation";
import { leaseWindow } from "./pool";
import { sleep } from "./util";

type SignInMode = "external";

export async function signInToSource(
  source: Source,
): Promise<{ ok: boolean; mode: SignInMode }> {
  const url = homeUrlForSource(source);
  if (!url) return { ok: false, mode: "external" };
  try {
    await shell.openExternal(url);
    log.info("[pond refresh:signin] opened external browser for", source, url);
    return { ok: true, mode: "external" };
  } catch (err) {
    log.warn("[pond refresh:signin] openExternal failed", source, err);
    return { ok: false, mode: "external" };
  }
}

export async function isPartitionSignedIn(
  source: Source,
  partition: string,
): Promise<boolean> {
  const cookies = await listCookiesForSource(source, partition);
  return cookies.some((c) => isAuthCookie(source, c));
}

export async function isAccountConnected(
  account: ConnectedAccount,
): Promise<boolean> {
  return isPartitionSignedIn(account.source, partitionForAccount(account.id));
}

export async function isSourceConnected(source: Source): Promise<boolean> {
  const accounts = await listAccountsForSource(source);
  for (const account of accounts) {
    if (await isAccountConnected(account)) return true;
  }
  return isPartitionSignedIn(source, PARTITION);
}

export interface ImportableCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number | null;
  hostOnly?: boolean;
}

export async function writePartitionCookies(args: {
  cookies: ImportableCookie[];
  partition: string;
}): Promise<{ written: number; skipped: number }> {
  const persistent = session.fromPartition(args.partition);
  let written = 0;
  let skipped = 0;
  for (const c of args.cookies) {
    const hostForUrl = c.domain.replace(/^\./, "");
    const url = `${c.secure === false ? "http" : "https"}://${hostForUrl}${c.path ?? "/"}`;
    const details: Electron.CookiesSetDetails = {
      url,
      name: c.name,
      value: c.value,
      path: c.path ?? "/",
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite ?? "unspecified",
      expirationDate: c.expirationDate ?? undefined,
    };
    if (!c.hostOnly) details.domain = c.domain;
    try {
      await persistent.cookies.set(details);
      written += 1;
    } catch (err) {
      skipped += 1;
      log.warn(
        "[pond refresh:cookies] set failed",
        c.name,
        c.domain,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { written, skipped };
}

const ProbeHandleSchema = z.string().catch("");

export async function probeUserHandle(
  source: Source,
  partition?: string,
): Promise<string | null> {
  if (source === "reddit") {
    const { probeRedditHandle } = await import("../harvest/reddit/api");
    const viaApi = await probeRedditHandle(partition ?? PARTITION);
    if (viaApi) return viaApi;
  }
  if (source === "cosmos") {
    const { probeCosmosHandle } = await import("../harvest/cosmos/api");
    return probeCosmosHandle(partition ?? PARTITION);
  }
  if (source === "tiktok") {
    const { probeTiktokHandle } = await import("../harvest/tiktok/api");
    const viaApi = await probeTiktokHandle(partition ?? PARTITION);
    if (viaApi) return viaApi;
  }
  const lease = await leaseWindow(source, { partition });
  try {
    const url = probeUrlForSource(source);
    const navOk = await navigateWithTimeout(lease.win, url, NAV_TIMEOUT_MS);
    if (!navOk) {
      log.warn("[pond refresh:probe] navigate failed", source, url);
      return null;
    }
    const current = lease.win.webContents.getURL();
    if (looksLikeAuthWall(current)) {
      log.info("[pond refresh:probe] auth wall hit", source, current);
      return null;
    }

    const expr = buildProbeExpression(source);
    const raw = ProbeHandleSchema.parse(
      await Promise.race([
        lease.win.webContents.executeJavaScript(expr, true),
        sleep(HARVEST_TIMEOUT_MS).then(() => "__pond_probe_timeout__"),
      ]),
    );
    if (!raw || raw === "__pond_probe_timeout__") {
      log.warn("[pond refresh:probe] no handle in DOM", source);
      return null;
    }
    const handle = raw.trim().replace(/^@/, "");
    return handle.length > 0 ? handle : null;
  } catch (err) {
    log.warn("[pond refresh:probe] unexpected error", source, err);
    return null;
  } finally {
    lease.release();
  }
}

function probeUrlForSource(source: Source): string {
  if (source === "tiktok") return "https://www.tiktok.com/";
  if (source === "arena") return "https://www.are.na/";
  if (source === "twitter") return "https://x.com/home";
  if (source === "instagram") return "https://www.instagram.com/";
  if (source === "pinterest") return "https://www.pinterest.com/me/";
  if (source === "youtube") return "https://www.youtube.com/account";
  if (source === "reddit") return "https://www.reddit.com/";
  if (source === "threads") return "https://www.threads.com/";
  if (source === "cosmos") return "https://www.cosmos.so/";
  return homeUrlForSource(source);
}

function buildProbeExpression(source: Source): string {
  return extractorFor(source)?.probeExpression ?? "''";
}

function isAuthCookie(source: Source, cookie: Cookie): boolean {
  return isAuthCookieName(source, cookie.name, cookie.value);
}

export function isAuthCookieName(
  source: Source,
  name: string,
  value?: string,
): boolean {
  return extractorFor(source)?.authCookies(name, value) ?? false;
}

async function listCookiesForSource(
  source: Source,
  partition: string,
): Promise<Cookie[]> {
  const persistent = session.fromPartition(partition);
  const domain = primaryDomainForSource(source);
  if (!domain) return [];
  const host = domain.replace(/^\./, "").toLowerCase();
  try {
    /** `cookies.get({ domain })` does not return host-only subdomain cookies (cosmos auth lives on `www.cosmos.so`); fetch all and filter by host suffix. */
    const all = await persistent.cookies.get({});
    return all.filter((c) => {
      const ck = (c.domain ?? "").replace(/^\./, "").toLowerCase();
      return ck === host || ck.endsWith(`.${host}`);
    });
  } catch (err) {
    log.warn("[pond refresh:window] cookies.get failed", domain, err);
    return [];
  }
}

export function primaryDomainForSource(source: Source): string | null {
  return extractorFor(source)?.cookieDomain ?? null;
}
