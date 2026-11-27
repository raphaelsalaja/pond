import { createHash, createHmac } from "node:crypto";

/** The SHA-256 of an empty body, which S3 requests without one sign. */
export const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface SigningKey {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to sign besides `host`, `x-amz-date`, and `x-amz-content-sha256`, which signing adds. */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the body. */
  payloadHash: string;
  key: SigningKey;
  region: string;
  service?: string;
  now: Date;
}

/**
 * AWS Signature Version 4 for S3 and S3-compatible stores (R2, B2, MinIO). It's small enough
 * to own, and testing it against AWS's published examples keeps the whole SDK out of the app.
 */
export function signRequest(input: SignInput) {
  const service = input.service ?? "s3";
  const amzDate = input.now.toISOString().replaceAll(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers = {
    ...lowercaseKeys(input.headers ?? {}),
    host: input.url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
  };
  /** Sorted name and value pairs: the canonical order SigV4 signs in. */
  const entries = Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : 1));
  const names = entries.map(([name]) => name);
  const canonicalHeaders = entries
    .map(([name, value]) => `${name}:${value.trim().replaceAll(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method,
    canonicalPath(input.url.pathname),
    canonicalQuery(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = [
    day,
    input.region,
    service,
    "aws4_request",
  ].reduce<Buffer>(
    (key, part) => hmac(key, part),
    Buffer.from(`AWS4${input.key.secretAccessKey}`, "utf8"),
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.key.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** RFC 3986 encoding, which SigV4 requires: everything but unreserved characters is escaped. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** S3 object keys go into the path one segment at a time, keeping their slashes. */
export function encodeKey(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

function canonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join("/");
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function lowercaseKeys(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}
