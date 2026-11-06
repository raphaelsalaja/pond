import { z } from "zod";
import { CaptureWebDraftSchema } from "./capture";
import { enqueueRequestSchema } from "./ingest";
import { extensionCookieSchema, sessionImportPayloadSchema } from "./session";

export const NATIVE_HOST_NAME = "so.pond.host";

/** Safari hands native messages to the app extension inside Pond.app, which shares this bundle ID. */
export const SAFARI_HOST_NAME = "so.pond.desktop.Extension";

/** The sandboxed Safari extension can only reach a socket in this container; macOS requires the team ID prefix. */
export const SAFARI_APP_GROUP = "7VFLYD5292.so.pond";

/** Share extension drop folder inside the App Group container; keep in lockstep with `PondSocket.swift`. */
export const SHARE_INBOX_DIR = "Share Inbox";

/** Pinned by `manifest.key` in unpacked builds; native-host `allowed_origins` must match. */
export const EXTENSION_ID = "ihciihlcdkopghlpabpmnodncfdboplb";

/** Public key that derives `EXTENSION_ID`; the Chrome Web Store rejects it, so store zips omit it. */
export const EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3Zo8eCTaDeFH3Cc8yLtm6FiH3ALU8SMbH+oTFnjzBbD1+zUy1chc0P4c62tYvW4rBiO3CKt2Ycn3u1PmbkBPzuu/65YA7AZMA9+Oyp3QHhsjC1lED4EdCKQJK2WuyLv0k4kG22HQGUN83n9vdx/fPYRk3IL4yFplWUrcsApFOVAIVvhoMizpYfnBvey64aY9FTAFSKd+iYyA7J/yVzRh4AyjYRJFlmdA8K9aMaGZ/Ta4UvUrqoGBkgyGGH+hoVsPvgxW/+w5+JWAThT9ApAVEeuuZp9LeNwmnI2zUFxS0JRf6LHIDy7kbtTOVW5g9eOaS9G3Gs13j2VPC1Yyu7zxTQIDAQAB";

/** The Chrome Web Store assigns its own ID because it rejects `manifest.key` on a new listing. */
export const CHROME_WEB_STORE_ID = "ghigndnldiagchoaifgndleogpkendbc";

/** Firefox rejects `manifest.key`, so the gecko id is pinned here for `allowed_extensions`. */
export const FIREFOX_EXTENSION_ID = "desktop@pond.so";

export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_WEB_STORE_ID}`;

export const FIREFOX_ADDONS_URL = `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(FIREFOX_EXTENSION_ID)}/`;

export const CHROMIUM_EXTENSION_IDS: readonly string[] = [
  EXTENSION_ID,
  CHROME_WEB_STORE_ID,
];

const captureIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const fishIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

export const nativeRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello") }),
  z.object({
    type: z.literal("capture.accept"),
    draft: CaptureWebDraftSchema,
    cookies: z.array(extensionCookieSchema).max(500).optional(),
    /** Opens this fish with the save attached once the capture lands. */
    fishId: fishIdSchema.optional(),
  }),
  z.object({ type: z.literal("capture.status"), id: captureIdSchema }),
  z.object({ type: z.literal("library.info") }),
  z.object({ type: z.literal("folders.list") }),
  z.object({ type: z.literal("tags.list") }),
  z.object({ type: z.literal("fish.list") }),
  z.object({ type: z.literal("extension.settings") }),
  z.object({ type: z.literal("session.pending") }),
  enqueueRequestSchema.extend({ type: z.literal("enqueue") }),
  sessionImportPayloadSchema.extend({ type: z.literal("session.import") }),
  sessionImportPayloadSchema.extend({ type: z.literal("session.refresh") }),
  z.object({
    type: z.literal("files.import"),
    paths: z.array(z.string().min(1).max(4096)).min(1).max(50),
  }),
]);

export type NativeRequest = z.infer<typeof nativeRequestSchema>;

export const nativeSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});

export const nativeErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export const nativeResponseSchema = z.union([
  nativeSuccessSchema,
  nativeErrorSchema,
]);

export type NativeResponse = z.infer<typeof nativeResponseSchema>;

export type NativeMessage = NativeRequest | NativeResponse;
