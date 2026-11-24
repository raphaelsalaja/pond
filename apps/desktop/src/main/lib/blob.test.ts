import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fetchMediaBatch, isReadableImage } from "./blob";
import type { MediaFetcher } from "./download-transfer";

const png = () =>
  sharp({
    create: { width: 4, height: 4, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();

it("accepts a valid PNG", async () => {
  expect(await isReadableImage(await png())).toBe(true);
});

it("rejects a PNG with a damaged header", async () => {
  const bytes = await png();
  const damaged = Buffer.concat([bytes.subarray(0, 4), bytes.subarray(5)]);
  expect(await isReadableImage(damaged)).toBe(false);
});

it("rejects HTML served as an image", async () => {
  expect(await isReadableImage(Buffer.from("<!doctype html><html>"))).toBe(
    false,
  );
});

it("rejects a PNG cut off before the end", async () => {
  const bytes = await png();
  expect(await isReadableImage(bytes.subarray(0, bytes.length - 20))).toBe(
    false,
  );
});

function ico(payload: Buffer, declaredSize = payload.length): Buffer {
  const header = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  const entry = Buffer.alloc(16);
  entry.writeUInt32LE(declaredSize, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, payload]);
}

it("accepts an ICO file that holds a PNG", async () => {
  expect(await isReadableImage(ico(await png()))).toBe(true);
});

it("rejects an ICO file whose entry points past the end", async () => {
  const bytes = await png();
  expect(await isReadableImage(ico(bytes, bytes.length + 100))).toBe(false);
});

const challenge = () =>
  new Response("<html>challenge</html>", {
    status: 429,
    headers: { "x-vercel-mitigated": "challenge" },
  });

describe("bot challenges", () => {
  const url = "https://site.example/_next/image?url=%2Fa.png&w=3840";

  it("retries a challenged download in the harvest session", async () => {
    const image = await png();
    const sessionUrls: Array<string> = [];
    const challengeFetcher: MediaFetcher = async (requested) => {
      sessionUrls.push(requested);
      return new Response(new Uint8Array(image), {
        headers: { "content-type": "image/png" },
      });
    };

    const [entry] = await fetchMediaBatch([url], {
      fetcher: async () => challenge(),
      challengeFetcher,
    });

    expect(sessionUrls).toEqual([url]);
    expect(entry?.file?.bytes).toEqual(image);
    expect(entry?.miss).toBeUndefined();
  });

  it("reports a challenge the harvest session cannot pass", async () => {
    const [entry] = await fetchMediaBatch([url], {
      fetcher: async () =>
        new Response("", {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
      challengeFetcher: async () => challenge(),
    });

    expect(entry).toMatchObject({ file: null, miss: "challenged" });
  });

  it("still retries an ordinary rate limit later", async () => {
    const sessionUrls: Array<string> = [];
    const challengeFetcher: MediaFetcher = async (requested) => {
      sessionUrls.push(requested);
      return challenge();
    };

    const [entry] = await fetchMediaBatch([url], {
      fetcher: async () => new Response("", { status: 429 }),
      challengeFetcher,
    });

    expect(sessionUrls).toEqual([]);
    expect(entry).toMatchObject({ file: null, miss: "transient" });
  });
});
