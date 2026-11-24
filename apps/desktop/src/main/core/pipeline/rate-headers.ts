export type HeaderBag = Record<string, string> | Headers;

function isHeaders(bag: HeaderBag): bag is Headers {
  return Object.prototype.toString.call(bag) === "[object Headers]";
}

function header(bag: HeaderBag, name: string): string | null {
  if (isHeaders(bag)) {
    return bag.get(name);
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(bag)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return null;
}

export interface RateSignal {
  retryAfterSec: number | null;
  remaining: number | null;
}

/** Covers `retry-after` (seconds or HTTP date), Twitter's `x-rate-limit-*`, and the generic `x-ratelimit-*` family. */
export function parseRateSignal(bag: HeaderBag): RateSignal {
  let retryAfterSec: number | null = null;
  const retryAfter = header(bag, "retry-after");
  if (retryAfter) {
    const asNum = Number(retryAfter);
    if (Number.isFinite(asNum)) {
      retryAfterSec = Math.max(0, asNum);
    } else {
      const when = Date.parse(retryAfter);
      if (Number.isFinite(when)) {
        retryAfterSec = Math.max(0, Math.round((when - Date.now()) / 1000));
      }
    }
  }

  const resetRaw =
    header(bag, "x-rate-limit-reset") ?? header(bag, "x-ratelimit-reset");
  const remainingRaw =
    header(bag, "x-rate-limit-remaining") ??
    header(bag, "x-ratelimit-remaining");
  const remaining = remainingRaw !== null ? Number(remainingRaw) : null;

  if (
    retryAfterSec === null &&
    remaining !== null &&
    Number.isFinite(remaining) &&
    remaining <= 1 &&
    resetRaw
  ) {
    const resetEpoch = Number(resetRaw);
    if (Number.isFinite(resetEpoch)) {
      const resetMs = resetEpoch > 1e12 ? resetEpoch : resetEpoch * 1000;
      retryAfterSec = Math.max(0, Math.round((resetMs - Date.now()) / 1000));
    }
  }

  return {
    retryAfterSec,
    remaining:
      remaining !== null && Number.isFinite(remaining) ? remaining : null,
  };
}
