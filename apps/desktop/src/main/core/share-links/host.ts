import { z } from "zod";
import type { ShareHostProvider } from "../../../shared/share-link-contracts";
import { EMPTY_SHA256, encodeKey, sha256Hex, signRequest } from "./sigv4";

const SHARE_HOST_PROVIDERS = [
  "r2",
  "s3",
  "b2",
  "other",
] as const satisfies ReadonlyArray<ShareHostProvider>;

const HttpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Use an https address.",
  )
  .transform((value) => value.replace(/\/+$/, ""));

/** Storage you own that Share Links upload to. The whole record lives in the keychain. */
export const ShareHostConfigSchema = z.object({
  provider: z.enum(SHARE_HOST_PROVIDERS),
  endpoint: HttpsUrlSchema,
  region: z.string().trim().min(1).max(64),
  bucket: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
      "Use the bucket's exact name.",
    ),
  /** Where the bucket's files are public, such as an r2.dev address or your own domain. */
  publicUrl: HttpsUrlSchema,
  accessKeyId: z.string().trim().min(1).max(256),
  secretAccessKey: z.string().trim().min(1).max(256),
  /** New links expire after this many days; null keeps them until you stop sharing. */
  expireAfterDays: z.number().int().positive().max(3650).nullable(),
});
export type ShareHostConfig = z.infer<typeof ShareHostConfigSchema>;

export interface ShareHost {
  put: (
    key: string,
    body: Uint8Array,
    headers: { contentType: string; cacheControl: string },
  ) => Promise<void>;
  remove: (key: string) => Promise<void>;
  list: (prefix: string) => Promise<Array<string>>;
  publicUrl: (key: string) => string;
}

class ShareHostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ShareHostError";
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 60_000;

/** An S3-compatible bucket, addressed path-style, which R2, B2, MinIO, and AWS all accept. */
export function s3ShareHost(
  config: ShareHostConfig,
  options: { fetch?: Fetch; now?: () => Date } = {},
): ShareHost {
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => new Date());
  const key = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };

  async function request(input: {
    method: string;
    url: URL;
    body?: Uint8Array;
    headers?: Record<string, string>;
    timeout: number;
  }): Promise<Response> {
    const headers = signRequest({
      method: input.method,
      url: input.url,
      headers: input.headers,
      payloadHash: input.body ? sha256Hex(input.body) : EMPTY_SHA256,
      key,
      region: config.region,
      now: now(),
    });
    /** `host` is set by fetch itself; sending it again is refused. */
    const { host: _host, ...sent } = headers;
    const response = await send(input.url.href, {
      method: input.method,
      headers: sent,
      body: input.body ? Buffer.from(input.body) : undefined,
      signal: AbortSignal.timeout(input.timeout),
    });
    if (!response.ok) throw await hostError(response);
    return response;
  }

  const objectUrl = (objectKey: string) =>
    new URL(
      `${config.endpoint}/${encodeKey(config.bucket)}/${encodeKey(objectKey)}`,
    );

  return {
    async put(objectKey, body, headers) {
      await request({
        method: "PUT",
        url: objectUrl(objectKey),
        body,
        headers: {
          "content-type": headers.contentType,
          "cache-control": headers.cacheControl,
        },
        timeout: UPLOAD_TIMEOUT_MS,
      });
    },
    async remove(objectKey) {
      await request({
        method: "DELETE",
        url: objectUrl(objectKey),
        timeout: REQUEST_TIMEOUT_MS,
      });
    },
    async list(prefix) {
      const keys: Array<string> = [];
      let token: string | undefined;
      do {
        const url = new URL(`${config.endpoint}/${encodeKey(config.bucket)}`);
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", prefix);
        if (token) url.searchParams.set("continuation-token", token);
        const xml = await (
          await request({ method: "GET", url, timeout: REQUEST_TIMEOUT_MS })
        ).text();
        keys.push(...xmlValues(xml, "Key"));
        token =
          xmlValues(xml, "IsTruncated")[0] === "true"
            ? xmlValues(xml, "NextContinuationToken")[0]
            : undefined;
      } while (token);
      return keys;
    },
    publicUrl(objectKey) {
      return `${config.publicUrl}/${encodeKey(objectKey)}`;
    },
  };
}

/** Turns an S3 error body into a sentence a person can act on. */
async function hostError(response: Response): Promise<ShareHostError> {
  const body = await response.text().catch(() => "");
  const code = xmlValues(body, "Code")[0];
  const detail = xmlValues(body, "Message")[0];
  const message =
    code === "NoSuchBucket"
      ? "The Share Host's bucket doesn't exist. Check its name."
      : code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch"
        ? "The Share Host refused the access key. Check the key ID and secret."
        : code === "AccessDenied" || response.status === 403
          ? "The access key can't write to this bucket. Give it read and write access."
          : detail
            ? `The Share Host said: ${detail}`
            : `The Share Host answered ${response.status}.`;
  return new ShareHostError(message, response.status, code);
}

const XML_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

/** S3 answers in flat XML; the few fields Pond reads don't need a parser. */
function xmlValues(xml: string, tag: string): Array<string> {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map(
    (match) =>
      (match[1] ?? "").replaceAll(
        /&(amp|lt|gt|quot|apos);/g,
        (_, name: string) => XML_ENTITIES.get(name) ?? "",
      ),
  );
}
