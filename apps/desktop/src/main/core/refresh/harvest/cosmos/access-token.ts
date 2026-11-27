import { z } from "zod";
import { cosmosTokenExpiresAt } from "../../../../lib/cosmos-token";

/** Cosmos's own client refreshes a minute early, so a walk never starts on a token about to lapse. */
const REFRESH_MARGIN_SEC = 60;

export type CosmosRefreshTrigger = "proactive" | "reactive";

export type CosmosRefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "unauthorized" | "transient" };

/** Where access tokens come from for one session. */
export interface CosmosTokenSource {
  /** Tokens already in hand, preferred first. */
  held: () => Promise<Array<string>>;
  /** Trades the session's refresh cookie for a new access token. */
  refresh: (trigger: CosmosRefreshTrigger) => Promise<CosmosRefreshResult>;
  remember: (accessToken: string) => void;
  now: () => number;
}

const RefreshResponseSchema = z.object({ accessToken: z.string().min(1) });

/** Reads the reply of `www.cosmos.so/api/refresh-token`, which answers `{ accessToken }` or 401 once the session ends. */
export function refreshResultFromResponse(
  status: number,
  body: string,
): CosmosRefreshResult {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "unauthorized" };
  }
  if (status < 200 || status >= 300) return { ok: false, reason: "transient" };
  try {
    const parsed = RefreshResponseSchema.safeParse(JSON.parse(body));
    return parsed.success
      ? { ok: true, accessToken: parsed.data.accessToken }
      : { ok: false, reason: "transient" };
  } catch {
    return { ok: false, reason: "transient" };
  }
}

function lapsesWithin(
  token: string,
  nowMs: number,
  marginSec: number,
): boolean {
  const expiresAt = cosmosTokenExpiresAt(token);
  /** A token without `exp` is tried as is; Cosmos answers AUTHENTICATION once it has lapsed. */
  return expiresAt !== null && expiresAt - marginSec <= nowMs / 1000;
}

/**
 * An access token for the Cosmos API. The `csms_accessToken` cookie expires,
 * and Cosmos's web client gets later tokens from `/api/refresh-token` and
 * holds them in memory, so a lapsed cookie is refreshed here instead of
 * reported as a sign-out. `force` refreshes even a token that looks current,
 * after Cosmos rejected it.
 */
export async function cosmosAccessToken(
  source: CosmosTokenSource,
  { force = false }: { force?: boolean } = {},
): Promise<string | null> {
  const held = await source.held();
  if (!force) {
    const current = held.find(
      (token) => !lapsesWithin(token, source.now(), REFRESH_MARGIN_SEC),
    );
    if (current) return current;
  }
  const refreshed = await source.refresh(force ? "reactive" : "proactive");
  if (refreshed.ok) {
    source.remember(refreshed.accessToken);
    return refreshed.accessToken;
  }
  if (force || refreshed.reason === "unauthorized") return null;
  /** A refresh that failed in transit leaves any token that hasn't lapsed yet worth one try. */
  return held.find((token) => !lapsesWithin(token, source.now(), 0)) ?? null;
}
