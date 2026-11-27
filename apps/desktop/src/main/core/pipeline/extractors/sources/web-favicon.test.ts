import { expect, it } from "vitest";
import { resolveFavicon } from "./web-favicon";
import type { FaviconRequest } from "./web-favicon";

const ICO_TYPES = ["image/vnd.microsoft.icon", "image/x-icon"];
const ICON = "https://example.com/favicon.ico";

function respondWith(response: () => Response): FaviconRequest {
  return async (_url, init) => {
    init.signal?.throwIfAborted();
    return response();
  };
}

/** A body that would stream forever, recording whether the reader hung up. */
function endlessIcon() {
  const stream = { cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([0, 0, 1, 0]));
    },
    cancel() {
      stream.cancelled = true;
    },
  });
  return { stream, body };
}

it("resolves an icon served with an accepted type, then hangs up after the first bytes", async () => {
  const { stream, body } = endlessIcon();
  const request = respondWith(
    () =>
      new Response(body, {
        status: 206,
        headers: { "content-type": "image/x-icon; charset=binary" },
      }),
  );

  await expect(resolveFavicon(ICON, ICO_TYPES, request)).resolves.toBe(ICON);
  expect(stream.cancelled).toBe(true);
});

it("rejects an icon route that answers with another type", async () => {
  const request = respondWith(
    () =>
      new Response(new Uint8Array([0x89, 0x50]), {
        headers: { "content-type": "image/png" },
      }),
  );

  await expect(
    resolveFavicon(ICON, ICO_TYPES, request),
  ).resolves.toBeUndefined();
});

it("rejects an icon route that announces an image but sends markup", async () => {
  const request = respondWith(
    () =>
      new Response("<html>Home</html>", {
        headers: { "content-type": "image/x-icon" },
      }),
  );

  await expect(
    resolveFavicon(ICON, ICO_TYPES, request),
  ).resolves.toBeUndefined();
});

it("rejects an icon route that announces an image but sends no body", async () => {
  const request = respondWith(
    () => new Response(null, { headers: { "content-type": "image/x-icon" } }),
  );

  await expect(
    resolveFavicon(ICON, ICO_TYPES, request),
  ).resolves.toBeUndefined();
});

it("accepts any reachable response when no type is required", async () => {
  const request = respondWith(
    () => new Response("<svg/>", { headers: { "content-type": "text/plain" } }),
  );

  await expect(resolveFavicon(ICON, undefined, request)).resolves.toBe(ICON);
});

it("treats a missing icon as unreachable", async () => {
  const request = respondWith(
    () => new Response("<html>Not found</html>", { status: 404 }),
  );

  await expect(
    resolveFavicon(ICON, undefined, request),
  ).resolves.toBeUndefined();
});

/** What `fetch` throws when DNS cannot find the host. */
const unreachableHost: FaviconRequest = async (url) => {
  throw new TypeError("fetch failed", {
    cause: Object.assign(
      new Error(`getaddrinfo ENOTFOUND ${new URL(url).hostname}`),
      { code: "ENOTFOUND" },
    ),
  });
};

it("resolves undefined when the host cannot be reached", async () => {
  await expect(
    resolveFavicon(ICON, ICO_TYPES, unreachableHost),
  ).resolves.toBeUndefined();
});
