import { afterEach, describe, expect, it } from "vitest";
import { captureDocumentTarget } from "./capture-target";
import {
  clearRenderCardPayloads,
  releaseRenderCardPayload,
  renderCardPayloadResponse,
  storeRenderCardPayload,
} from "./payload-store";

function mediaHeavyPayload(): string {
  const image = `data:image/jpeg;base64,${"QUJD".repeat(200_000)}`;
  return JSON.stringify({
    author: { name: "Media Heavy", handle: "mediaheavy" },
    text: "Three large inline images",
    media: ["AAAA", "AQID", "BAUG"].map((suffix) => ({
      url: `${image}${suffix}`,
      type: "image",
      width: 1200,
      height: 900,
    })),
  });
}

async function responseText(token: string): Promise<string | null> {
  const response = renderCardPayloadResponse(token, "GET");
  return response.status === 200 ? response.text() : null;
}

afterEach(() => {
  clearRenderCardPayloads();
});

describe("render card payload transport", () => {
  it("keeps a media-heavy payload out of the capture navigation URL", async () => {
    const payload = mediaHeavyPayload();
    const oldFragmentLength = Buffer.from(payload, "utf8").toString(
      "base64",
    ).length;
    const ref = storeRenderCardPayload(payload);
    const target = captureDocumentTarget("tweet", "light", 550, ref.token);
    const navigationUrl = `https://renderer.test/capture.html?${target.search}`;

    expect(Buffer.byteLength(payload, "utf8")).toBeGreaterThan(2_000_000);
    expect(oldFragmentLength).toBeGreaterThan(2_000_000);
    expect(navigationUrl.length).toBeLessThan(300);
    expect(navigationUrl).not.toContain("QUJD");
    await expect(responseText(ref.token)).resolves.toBe(payload);
  });

  it("consumes a payload once and releases an unused payload", async () => {
    const consumed = storeRenderCardPayload(JSON.stringify({ text: "first" }));
    await expect(responseText(consumed.token)).resolves.toBe(
      JSON.stringify({ text: "first" }),
    );
    expect(renderCardPayloadResponse(consumed.token, "GET").status).toBe(404);

    const unused = storeRenderCardPayload(JSON.stringify({ text: "unused" }));
    releaseRenderCardPayload(unused.token);
    expect(renderCardPayloadResponse(unused.token, "GET").status).toBe(404);
  });

  it("serves only GET requests and reports missing tokens", async () => {
    const stored = storeRenderCardPayload(JSON.stringify({ text: "get only" }));

    expect(renderCardPayloadResponse(stored.token, "POST").status).toBe(405);
    expect(renderCardPayloadResponse("missing-token", "GET").status).toBe(404);
    await expect(responseText(stored.token)).resolves.toBe(
      JSON.stringify({ text: "get only" }),
    );
  });

  it("keeps overlapping payloads isolated by token", async () => {
    const first = storeRenderCardPayload(JSON.stringify({ text: "save a" }));
    const second = storeRenderCardPayload(JSON.stringify({ text: "save b" }));

    expect(first.token).not.toBe(second.token);
    await expect(responseText(first.token)).resolves.toBe(
      JSON.stringify({ text: "save a" }),
    );
    await expect(responseText(second.token)).resolves.toBe(
      JSON.stringify({ text: "save b" }),
    );
  });

  it("does not reuse a consumed payload for the next capture", async () => {
    const first = storeRenderCardPayload(
      JSON.stringify({ text: "first save" }),
    );
    await expect(responseText(first.token)).resolves.toBe(
      JSON.stringify({ text: "first save" }),
    );

    const second = storeRenderCardPayload(
      JSON.stringify({ text: "second save" }),
    );
    expect(second.token).not.toBe(first.token);
    await expect(responseText(second.token)).resolves.toBe(
      JSON.stringify({ text: "second save" }),
    );
  });
});
