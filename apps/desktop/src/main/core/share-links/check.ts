import { randomBytes } from "node:crypto";
import type { ShareHost } from "./host";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const PROBE_BODY = "Pond checks that it can publish Share Links here.";
const TIMEOUT_MS = 20_000;

export type ShareHostCheck = { ok: true } | { ok: false; error: string };

/**
 * Writes a probe, reads it back from the public address the way a visitor would, makes sure
 * the bucket doesn't list its files (which would let anyone find every link), then removes it.
 */
export async function checkShareHost(
  host: ShareHost,
  fetchPublic: Fetch = (url, init) => fetch(url, init),
): Promise<ShareHostCheck> {
  const key = `pond-check-${randomBytes(6).toString("hex")}.txt`;
  try {
    await host.put(key, new TextEncoder().encode(PROBE_BODY), {
      contentType: "text/plain; charset=utf-8",
      cacheControl: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      error: message(
        error instanceof Error ? error : null,
        "Pond couldn't write to the bucket.",
      ),
    };
  }
  try {
    const read = await fetchPublic(host.publicUrl(key), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (!read?.ok || (await read.text()) !== PROBE_BODY) {
      return {
        ok: false,
        error:
          "Pond wrote a test file but couldn't open it at the public address. Check the public URL and that the bucket allows public reads.",
      };
    }
    const index = await fetchPublic(host.publicUrl(""), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (index?.ok && /<ListBucketResult/i.test(await index.text())) {
      return {
        ok: false,
        error:
          "Anyone can list this bucket's files, so they could find every link. Turn off public listing.",
      };
    }
    return { ok: true };
  } finally {
    await host.remove(key).catch(() => undefined);
  }
}

function message(error: Error | null, fallback: string): string {
  return error?.message || fallback;
}
