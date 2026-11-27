import { describe, expect, it } from "vitest";
import { EMPTY_SHA256, encodeKey, sha256Hex, signRequest } from "./sigv4";

/** The credentials and requests from AWS's "Signature Calculations for the Authorization Header" examples. */
const KEY = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const NOW = new Date("2013-05-24T00:00:00.000Z");

function signatureOf(headers: Record<string, string>): string | undefined {
  return headers.authorization?.match(/Signature=([0-9a-f]+)/)?.[1];
}

describe("signRequest", () => {
  it("matches AWS's GET Object example", () => {
    const headers = signRequest({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      headers: { Range: "bytes=0-9" },
      payloadHash: EMPTY_SHA256,
      key: KEY,
      region: "us-east-1",
      now: NOW,
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("matches AWS's PUT Object example", () => {
    const body = "Welcome to Amazon S3.";
    const headers = signRequest({
      method: "PUT",
      url: new URL(
        `https://examplebucket.s3.amazonaws.com/${encodeKey("test$file.text")}`,
      ),
      headers: {
        Date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payloadHash: sha256Hex(body),
      key: KEY,
      region: "us-east-1",
      now: NOW,
    });
    expect(signatureOf(headers)).toBe(
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    );
  });

  it("matches AWS's GET Bucket (list objects) example", () => {
    const headers = signRequest({
      method: "GET",
      url: new URL(
        "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J",
      ),
      payloadHash: EMPTY_SHA256,
      key: KEY,
      region: "us-east-1",
      now: NOW,
    });
    expect(signatureOf(headers)).toBe(
      "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    );
  });
});

describe("encodeKey", () => {
  it("escapes each segment and keeps the slashes", () => {
    expect(encodeKey("abc/media/s1-0 (1).webp")).toBe(
      "abc/media/s1-0%20%281%29.webp",
    );
  });
});
