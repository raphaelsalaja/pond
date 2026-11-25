import { describe, expect, it } from "vitest";
import {
  createWebHostSlots,
  type WebHostTask,
  webHostFor,
} from "./web-host-slots";

function web(url: string, op: WebHostTask["op"] = "harvest_metadata") {
  return { saveSource: "web", op, url } satisfies WebHostTask;
}

describe("webHostFor", () => {
  it("keys web network work by canonical host", () => {
    expect(webHostFor(web("https://www.Balolo.de/products/a"))).toBe(
      "balolo.de",
    );
    expect(webHostFor(web("https://balolo.de/cdn/x.jpg", "fetch_blobs"))).toBe(
      "balolo.de",
    );
  });

  it("leaves other Sources, local ops and unparseable URLs unlimited", () => {
    expect(
      webHostFor({
        saveSource: "twitter",
        op: "capture_tweet",
        url: "https://x.com/a/status/1",
      }),
    ).toBeNull();
    expect(webHostFor(web("https://balolo.de/a", "finalize"))).toBeNull();
    expect(webHostFor(web("not a url"))).toBeNull();
  });
});

describe("createWebHostSlots", () => {
  it("admits work for a host until its running work fills the limit", () => {
    const slots = createWebHostSlots([web("https://balolo.de/a")], 2);
    const next = web("https://balolo.de/b", "fetch_blobs");
    expect(slots.admits(next)).toBe(true);
    slots.occupy(next);
    expect(slots.admits(web("https://www.balolo.de/c"))).toBe(false);
    expect(slots.admits(web("https://example.com/c"))).toBe(true);
  });

  it("never holds back work without a host budget", () => {
    const slots = createWebHostSlots([], 0);
    expect(slots.admits(web("https://balolo.de/a", "finalize"))).toBe(true);
    expect(slots.admits(web("https://balolo.de/a"))).toBe(false);
  });
});
