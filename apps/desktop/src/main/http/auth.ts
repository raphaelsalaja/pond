import { createHash, timingSafeEqual } from "node:crypto";
import { API_TOKEN_SCOPE_LABELS } from "@pond/schema/api";
import type { ApiTokenInfo } from "@pond/schema/api";
import log from "electron-log/main.js";
import type { Context, MiddlewareHandler } from "hono";
import { apiError } from "./errors";
import { routeAccess } from "./scopes";

const AUTH_WINDOW_MS = 5 * 60_000;
const AUTH_MAX_FAILURES = 10;

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison; hashing first hides the token length. */
export function tokensMatch(expected: string, presented: string): boolean {
  return timingSafeEqual(digest(expected), digest(presented));
}

/**
 * Failure limiter keyed on the socket address. Request headers such as
 * `X-Forwarded-For` are client-controlled, so they must never choose the key.
 */
export function createAuthLimiter(now: () => number = Date.now) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    isBlocked(key: string): boolean {
      const entry = failures.get(key);
      return (
        entry !== undefined &&
        entry.resetAt > now() &&
        entry.count > AUTH_MAX_FAILURES
      );
    },
    /** Returns true once the key has exceeded the allowed failures. */
    recordFailure(key: string): boolean {
      const entry = failures.get(key);
      if (!entry || entry.resetAt < now()) {
        failures.set(key, { count: 1, resetAt: now() + AUTH_WINDOW_MS });
        return false;
      }
      entry.count += 1;
      return entry.count > AUTH_MAX_FAILURES;
    },
  };
}

interface RequireAuthOptions {
  localToken: () => Promise<string | null>;
  scopedToken: (presented: string) => Promise<ApiTokenInfo | null>;
  limiter: ReturnType<typeof createAuthLimiter>;
  remoteAddress: (c: Context) => string | undefined;
}

/**
 * The Local API Token reaches every route; a scoped token reaches only the public routes its scopes cover.
 * @remarks Every local client shares 127.0.0.1, so a block only stops wrong tokens and never a valid one.
 */
export function createRequireAuth({
  localToken,
  scopedToken,
  limiter,
  remoteAddress,
}: RequireAuthOptions): MiddlewareHandler {
  return async (c, next) => {
    const ip = remoteAddress(c) || "unknown";
    const presented = (c.req.header("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const expected = await localToken();
    if (expected && presented && tokensMatch(expected, presented)) {
      await next();
      return;
    }
    const scoped = presented ? await scopedToken(presented) : null;
    if (!scoped && limiter.isBlocked(ip)) {
      return apiError(
        c,
        "rate_limited",
        "Too many requests used a wrong token. Copy the current token into your client and try again.",
      );
    }
    if (!scoped) {
      if (limiter.recordFailure(ip)) {
        log.warn("[pond http] rate limited after repeated auth failures", ip);
      }
      return apiError(
        c,
        "unauthorized",
        "The token is missing, wrong, or revoked. Copy the Local API Token from Settings > General, or create one in Settings > Local API.",
      );
    }
    const access = routeAccess(c.req.method, c.req.path);
    if (access === "internal") {
      return apiError(
        c,
        "forbidden",
        "This route needs the Local API Token from Settings > General.",
      );
    }
    if (!scoped.scopes.includes(access)) {
      return apiError(
        c,
        "forbidden",
        `This token doesn't have ${API_TOKEN_SCOPE_LABELS[access]} access. Create one that does in Settings > Local API.`,
      );
    }
    await next();
  };
}
