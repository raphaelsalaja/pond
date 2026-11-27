import { describe, expect, it } from "vitest";
import { createFakeS3 } from "./fake-s3";
import { ShareHostConfigSchema, s3ShareHost } from "./host";
import type { ShareHostConfig } from "./host";

const CONFIG: ShareHostConfig = {
  provider: "r2",
  endpoint: "https://account.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "pond-links",
  publicUrl: "https://links.example.com",
  accessKeyId: "key",
  secretAccessKey: "secret",
  expireAfterDays: null,
};

function setup(pageSize?: number) {
  const s3 = createFakeS3({ bucket: "pond-links", pageSize });
  return { s3, host: s3ShareHost(CONFIG, { fetch: s3.fetch }) };
}

describe("s3ShareHost", () => {
  it("puts, lists across pages, and removes objects", async () => {
    const { s3, host } = setup(2);
    const body = new TextEncoder().encode("hello");
    for (const key of [
      "t/index.html",
      "t/media/a.webp",
      "t/media/b.webp",
      "other/x",
    ]) {
      await host.put(key, body, {
        contentType: "text/plain",
        cacheControl: "no-cache",
      });
    }
    expect(s3.objects.get("t/index.html")?.cacheControl).toBe("no-cache");
    expect(await host.list("t/")).toEqual([
      "t/index.html",
      "t/media/a.webp",
      "t/media/b.webp",
    ]);
    await host.remove("t/media/a.webp");
    expect(await host.list("t/")).toEqual(["t/index.html", "t/media/b.webp"]);
  });

  it("addresses objects path-style", async () => {
    const { s3, host } = setup();
    await host.put("t/media/s1 (1).webp", new Uint8Array([1]), {
      contentType: "image/webp",
      cacheControl: "public",
    });
    expect(s3.log).toEqual(["PUT /pond-links/t/media/s1%20%281%29.webp"]);
  });

  it("explains what S3 refused", async () => {
    const { s3, host } = setup();
    s3.failNext("PUT", 403, "SignatureDoesNotMatch");
    await expect(
      host.put("t/index.html", new Uint8Array(), {
        contentType: "text/html",
        cacheControl: "",
      }),
    ).rejects.toThrow("refused the access key");
  });

  it("builds public links under the public address", () => {
    expect(setup().host.publicUrl("t/index.html")).toBe(
      "https://links.example.com/t/index.html",
    );
  });
});

describe("ShareHostConfigSchema", () => {
  it("trims trailing slashes and refuses plain http", () => {
    expect(
      ShareHostConfigSchema.parse({
        ...CONFIG,
        publicUrl: "https://links.example.com/",
      }).publicUrl,
    ).toBe("https://links.example.com");
    expect(
      ShareHostConfigSchema.safeParse({
        ...CONFIG,
        endpoint: "http://localhost:9000",
      }).success,
    ).toBe(false);
  });
});
