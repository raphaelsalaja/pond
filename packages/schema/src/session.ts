import { z } from "zod";
import { SOURCES } from "./db";

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
  cookies: z.array(extensionCookieSchema).min(1).max(500),
});
export type SessionImportPayload = z.infer<typeof sessionImportPayloadSchema>;

export const sessionImportResponseSchema = z.object({
  ok: z.boolean(),
  imported: z.number(),
  connected: z.boolean(),
  reason: z.string().optional(),
});
export type SessionImportResponse = z.infer<typeof sessionImportResponseSchema>;
