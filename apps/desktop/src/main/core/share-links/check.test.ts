import { describe, expect, it } from "vitest";
import { checkShareHost } from "./check";
import { createFakeS3 } from "./fake-s3";
import { s3ShareHost } from "./host";

function setup(options: { publicReads: boolean; listing: boolean }) {
  const s3 = createFakeS3({ bucket: "links" });
  const host = s3ShareHost(
    {
      provider: "other",
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "links",
      publicUrl: "https://links.example.com",
      accessKeyId: "key",
      secretAccessKey: "secret",
      expireAfterDays: null,
    },
    { fetch: s3.fetch },
  );
  /** What a visitor sees at the public address. */
  const fetchPublic = async (url: string): Promise<Response> => {
    const key = decodeURIComponent(new URL(url).pathname.slice(1));
    if (key === "") {
      return options.listing
        ? new Response("<ListBucketResult></ListBucketResult>")
        : new Response("", { status: 404 });
    }
    const object = s3.objects.get(key);
    return options.publicReads && object
      ? new Response(new TextDecoder().decode(object.body))
      : new Response("", { status: 403 });
  };
  return { s3, check: () => checkShareHost(host, fetchPublic) };
}

describe("checkShareHost", () => {
  it("passes a writable, public, unlisted bucket and cleans up after itself", async () => {
    const { s3, check } = setup({ publicReads: true, listing: false });
    expect(await check()).toEqual({ ok: true });
    expect(s3.objects.size).toBe(0);
  });

  it("fails a bucket visitors can't read", async () => {
    const { s3, check } = setup({ publicReads: false, listing: false });
    expect(await check()).toMatchObject({
      ok: false,
      error: expect.stringContaining("public URL"),
    });
    expect(s3.objects.size).toBe(0);
  });

  it("fails a bucket that lists its files", async () => {
    const { check } = setup({ publicReads: true, listing: true });
    expect(await check()).toMatchObject({
      ok: false,
      error: expect.stringContaining("list"),
    });
  });
});
