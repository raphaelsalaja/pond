import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set<string>([
  "video.twimg.com",
  "pbs.twimg.com",
  "amp.twimg.com",
  "scontent.cdninstagram.com",
  "instagram.com",
  "i.pinimg.com",
  "d2w9rnfcy7mm78.cloudfront.net", // are.na
  "images.cosmos.so",
  "media.cosmos.so",
]);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (upstream.protocol !== "https:" && upstream.protocol !== "http:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }

  if (!isAllowedHost(upstream.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const headers = new Headers();
  const range = req.headers.get("range");
  if (range) headers.set("range", range);
  // Pretend to be a normal browser; Twitter rejects empty UAs.
  headers.set(
    "user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  );
  // No Origin / Referer on purpose — twimg returns 403 when those are set.

  const upstreamRes = await fetch(upstream.toString(), {
    headers,
    redirect: "follow",
    cache: "no-store",
  });

  const out = new Headers();
  for (const [k, v] of upstreamRes.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  out.set("access-control-allow-origin", "*");
  out.set("cache-control", "public, max-age=3600");

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: out,
  });
}

function isAllowedHost(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  for (const allowed of ALLOWED_HOSTS) {
    if (host.endsWith(`.${allowed}`)) return true;
  }
  // Allow subdomains of common CDNs.
  if (/(^|\.)twimg\.com$/.test(host)) return true;
  if (/(^|\.)cdninstagram\.com$/.test(host)) return true;
  if (/(^|\.)fbcdn\.net$/.test(host)) return true;
  if (/(^|\.)pinimg\.com$/.test(host)) return true;
  if (/(^|\.)cosmos\.so$/.test(host)) return true;
  return false;
}
