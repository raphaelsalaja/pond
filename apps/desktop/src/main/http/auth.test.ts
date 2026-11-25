import { ApiErrorBodySchema, ApiErrorSchema } from "@pond/schema/api";
import type { ApiTokenInfo, ApiTokenScope } from "@pond/schema/api";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createAuthLimiter, createRequireAuth, tokensMatch } from "./auth";

function scopedInfo(scopes: Array<ApiTokenScope>): ApiTokenInfo {
  return { id: "t1", name: "Script", scopes, createdAt: 0, lastUsedAt: null };
}

function server(scoped: Record<string, Array<ApiTokenScope>> = {}) {
  const app = new Hono();
  app.use(
    "/api/v2/*",
    createRequireAuth({
      localToken: async () => "local",
      scopedToken: async (presented) => {
        const scopes = scoped[presented];
        return scopes ? scopedInfo(scopes) : null;
      },
      limiter: createAuthLimiter(),
      remoteAddress: () => "127.0.0.1",
    }),
  );
  app.all("/api/v2/*", (c) => c.json({ status: "success", data: null }));
  return (method: string, path: string, token?: string) =>
    app.request(path, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
}

async function errorCode(response: Response): Promise<string> {
  return ApiErrorBodySchema.parse(
    ApiErrorSchema.parse(await response.json()).error,
  ).code;
}

describe("createRequireAuth", () => {
  it("lets the Local API Token reach every route", async () => {
    const call = server();
    expect((await call("POST", "/api/v2/session/import", "local")).status).toBe(
      200,
    );
    expect((await call("POST", "/api/v2/saves/tags", "local")).status).toBe(
      200,
    );
  });

  it("rejects missing and unknown tokens", async () => {
    const call = server();
    const missing = await call("GET", "/api/v2/library/info");
    expect(missing.status).toBe(401);
    expect(await errorCode(missing)).toBe("unauthorized");
    expect((await call("GET", "/api/v2/library/info", "nope")).status).toBe(
      401,
    );
  });

  it("limits a scoped token to the routes its scopes cover", async () => {
    const call = server({ reader: ["search"], editor: ["search", "write"] });
    expect((await call("GET", "/api/v2/library/info", "reader")).status).toBe(
      200,
    );

    const write = await call("POST", "/api/v2/saves/tags", "reader");
    expect(write.status).toBe(403);
    expect(await errorCode(write)).toBe("forbidden");
    expect((await call("POST", "/api/v2/saves/tags", "editor")).status).toBe(
      200,
    );
  });

  it("keeps private routes from every scoped token", async () => {
    const call = server({ all: ["search", "export", "write"] });
    for (const [method, path] of [
      ["POST", "/api/v2/session/import"],
      ["POST", "/api/v2/operations/run"],
      ["POST", "/api/v2/library/switch"],
    ] as const) {
      const response = await call(method, path, "all");
      expect(response.status, path).toBe(403);
      expect(await errorCode(response)).toBe("forbidden");
    }
  });

  it("blocks wrong tokens after repeated failures but still lets valid ones through", async () => {
    const call = server({ reader: ["search"] });
    for (let attempt = 0; attempt < 11; attempt++) {
      await call("GET", "/api/v2/library/info", "stale");
    }
    const blocked = await call("GET", "/api/v2/library/info", "stale");
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe("rate_limited");
    expect((await call("GET", "/api/v2/library/info", "local")).status).toBe(
      200,
    );
    expect((await call("GET", "/api/v2/library/info", "reader")).status).toBe(
      200,
    );
    expect((await call("GET", "/api/v2/library/info", "stale")).status).toBe(
      429,
    );
  });
});

describe("tokensMatch", () => {
  it("accepts only the exact token, whatever the lengths", () => {
    expect(tokensMatch("abc123", "abc123")).toBe(true);
    expect(tokensMatch("abc123", "abc124")).toBe(false);
    expect(tokensMatch("abc123", "abc")).toBe(false);
    expect(tokensMatch("abc", "abc123")).toBe(false);
    expect(tokensMatch("abc123", "")).toBe(false);
  });
});

describe("createAuthLimiter", () => {
  it("blocks a client after repeated failures and unblocks after the window", () => {
    let time = 1000;
    const limiter = createAuthLimiter(() => time);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(limiter.recordFailure("127.0.0.1")).toBe(false);
    }
    expect(limiter.isBlocked("127.0.0.1")).toBe(false);
    expect(limiter.recordFailure("127.0.0.1")).toBe(true);
    expect(limiter.isBlocked("127.0.0.1")).toBe(true);
    expect(limiter.isBlocked("127.0.0.2")).toBe(false);

    time += 5 * 60_000 + 1;
    expect(limiter.isBlocked("127.0.0.1")).toBe(false);
  });
});
