import { z } from "zod";
import { SOURCES, type Source } from "./source-ids";

interface RotatingSession {
  domain: string;
  /** Cookies the browser reissues each time it rotates the session. */
  rotates: readonly string[];
  /** Stays the same across rotations, so Pond can tell which Account holds the session. */
  sessionId: string;
}

/** Copies of these sessions stop working once the browser rotates them, so the extension forwards every rotation. */
export const ROTATING_SESSIONS: ReadonlyMap<Source, RotatingSession> = new Map([
  [
    "twitter",
    {
      domain: "x.com",
      rotates: ["auth_token", "ct0"],
      sessionId: "twid",
    },
  ],
  [
    "github",
    {
      domain: "github.com",
      rotates: ["user_session"],
      sessionId: "dotcom_user",
    },
  ],
  [
    "youtube",
    {
      domain: "youtube.com",
      rotates: ["__Secure-1PSIDTS", "__Secure-3PSIDTS"],
      sessionId: "SID",
    },
  ],
]);

export const extensionCookieSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().min(1),
  path: z.string().default("/"),
  secure: z.boolean().default(false),
  httpOnly: z.boolean().default(false),
  sameSite: z
    .enum(["unspecified", "no_restriction", "lax", "strict"])
    .default("unspecified"),
  expirationDate: z.number().nullable().optional(),
  hostOnly: z.boolean().optional(),
});
export type ExtensionCookie = z.infer<typeof extensionCookieSchema>;

export const sessionImportPayloadSchema = z.object({
  source: z.enum(SOURCES),
  /** Empty when the browser holds no cookies for the source, so Pond can report it signed out. */
  cookies: z.array(extensionCookieSchema).max(500),
});
export type SessionImportPayload = z.infer<typeof sessionImportPayloadSchema>;

export const sessionImportResponseSchema = z.object({
  ok: z.boolean(),
  imported: z.number(),
  connected: z.boolean(),
  accountId: z.string().optional(),
  reason: z.string().optional(),
});
export type SessionImportResponse = z.infer<typeof sessionImportResponseSchema>;

export const sessionRefreshResponseSchema = z.object({
  /** False when no Account uses the Source, so the extension can stop forwarding it. */
  tracked: z.boolean(),
  refreshed: z.boolean(),
});
export type SessionRefreshResponse = z.infer<
  typeof sessionRefreshResponseSchema
>;
