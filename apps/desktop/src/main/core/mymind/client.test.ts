import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createMymindClient,
  MymindApiError,
  MymindCredentialSchema,
  type MymindObject,
} from "./client";

const CREDENTIAL = {
  kid: "test-key",
  secret: Buffer.from("0123456789abcdef").toString("base64"),
};
const NOW = Date.parse("2026-11-06T12:00:00Z");
const ITEM = {
  id: "saved-item",
  title: "Café reference",
  created: "2026-11-06T11:00:00Z",
  url: "https://example.com/article",
  source: { url: "https://example.com/article" },
  content: { type: "text/markdown", body: "Article text" },
  notes: [{ id: "note", content: { type: "text/markdown", body: "My note" } }],
  tags: [{ name: "reference", flags: 8 }],
  blob: { name: "reference.pdf" },
};

function fixture() {
  const request =
    vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
  const now = vi.fn(() => NOW);
  return {
    request,
    now,
    client: createMymindClient(CREDENTIAL, { fetch: request, now }),
  };
}

async function collect(items: AsyncIterable<MymindObject>) {
  const result: MymindObject[] = [];
  for await (const item of items) result.push(item);
  return result;
}

function streamResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { headers: { "content-type": "application/jsonl; charset=utf-8" } },
  );
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = z.object({ port: z.number() }).parse(server.address());
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("mymind API client", () => {
  it("signs the request after a long admission wait", async () => {
    let now = NOW;
    const request =
      vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    request.mockResolvedValue(new Response("original file"));
    const controller = new AbortController();
    const beforeRequest = vi.fn(async () => {
      now += 6 * 60_000;
    });
    const client = createMymindClient(CREDENTIAL, {
      beforeRequest,
      fetch: request,
      now: () => now,
    });

    await client.getBlob("image", controller.signal);

    expect(beforeRequest).toHaveBeenCalledWith(controller.signal);
    const token = new Headers(request.mock.calls[0]?.[1].headers)
      .get("authorization")
      ?.replace(/^Bearer /, "");
    const [, payload] = z
      .tuple([z.string(), z.string(), z.string()])
      .parse(token?.split("."));
    expect(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    ).toMatchObject({
      iat: now / 1000,
      exp: now / 1000 + 300,
    });
    expect(now).toBe(NOW + 6 * 60_000);
  });

  it("does not send a request cancelled during admission", async () => {
    const request =
      vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    const controller = new AbortController();
    const client = createMymindClient(CREDENTIAL, {
      beforeRequest: async () => controller.abort(),
      fetch: request,
    });

    await expect(
      client.getBlob("image", controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("checks the key with a signed, bounded read", async () => {
    const { client, request } = fixture();
    request.mockResolvedValue(new Response(JSON.stringify([ITEM])));

    await client.validateCredential();

    const call = request.mock.calls[0];
    if (!call) throw new Error("The credential check did not make a request.");
    const [url, init] = call;
    expect(url).toBe("https://api.mymind.com/objects?limit=1");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("follow");
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toBe("Pond/mymind");
    expect(headers.get("accept")).toBe("application/json");
    const token = headers.get("authorization")?.replace(/^Bearer /, "");
    const [header, payload, signature] = z
      .tuple([z.string(), z.string(), z.string()])
      .parse(token?.split("."));
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      kid: CREDENTIAL.kid,
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      path: "/objects",
      method: "GET",
      iat: NOW / 1000,
      exp: NOW / 1000 + 300,
    });
    expect(signature).toBe(
      createHmac("sha256", Buffer.from(CREDENTIAL.secret, "base64"))
        .update(`${header}.${payload}`)
        .digest("base64url"),
    );
  });

  it("rejects a key with an invalid secret before a request", () => {
    expect(
      MymindCredentialSchema.safeParse({ kid: "key", secret: "bad" }).success,
    ).toBe(false);
    expect(
      MymindCredentialSchema.safeParse({ kid: "key", secret: "YQ==" }).success,
    ).toBe(false);
    expect(
      MymindCredentialSchema.safeParse({
        kid: "k".repeat(129),
        secret: CREDENTIAL.secret,
      }).success,
    ).toBe(false);
    expect(
      MymindCredentialSchema.safeParse({
        kid: "key",
        secret: CREDENTIAL.secret.repeat(10),
      }).success,
    ).toBe(false);
    expect(() =>
      createMymindClient({ kid: "", secret: CREDENTIAL.secret }),
    ).toThrow();
  });

  it("reads split UTF-8 and a final line without a newline", async () => {
    const { client, request } = fixture();
    const bytes = new TextEncoder().encode(
      `${JSON.stringify(ITEM)}\r\n\n${JSON.stringify({ ...ITEM, id: "second" })}`,
    );
    const split = bytes.indexOf(0xc3) + 1;
    request.mockResolvedValue(
      streamResponse([
        bytes.slice(0, split),
        bytes.slice(split, split + 5),
        bytes.slice(split + 5),
      ]),
    );

    const result = await collect(
      client.listCreatedObjects({ start: NOW - 60_000, end: NOW }),
    );

    expect(result).toEqual([ITEM, { ...ITEM, id: "second" }]);
    const url = new URL(request.mock.calls[0]?.[0] ?? "");
    expect(url.searchParams.get("q")).toBe(
      "created:2026-11-06T11:59:00.000Z/PT60S",
    );
    expect(url.searchParams.get("contentAs")).toBe("text/markdown");
    expect(url.searchParams.has("limit")).toBe(false);
    expect(new Headers(request.mock.calls[0]?.[1].headers).get("accept")).toBe(
      "application/jsonl",
    );
  });

  it("does not stop at the normal JSON query limit", async () => {
    const { client, request } = fixture();
    const body = Array.from({ length: 1001 }, (_, index) =>
      JSON.stringify({ ...ITEM, id: String(index) }),
    ).join("\n");
    request.mockResolvedValue(streamResponse([new TextEncoder().encode(body)]));

    await expect(
      collect(client.listCreatedObjects({ start: NOW - 60_000, end: NOW })),
    ).resolves.toHaveLength(1001);
  });

  it("rejects a capped JSON response or an incomplete item stream", async () => {
    const { client, request } = fixture();
    request.mockResolvedValueOnce(
      new Response(JSON.stringify([ITEM]), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      collect(client.listCreatedObjects({ start: NOW - 60_000, end: NOW })),
    ).rejects.toThrow("mymind did not return a complete item stream.");

    request.mockResolvedValueOnce(
      streamResponse([new TextEncoder().encode(`${JSON.stringify(ITEM)}\n{`)]),
    );
    await expect(
      collect(client.listCreatedObjects({ start: NOW - 60_000, end: NOW })),
    ).rejects.toThrow("mymind returned invalid item data.");
  });

  it("stops a pending stream read when the request is cancelled", async () => {
    const { client, request } = fixture();
    const cancelled = vi.fn();
    request.mockResolvedValue(
      new Response(new ReadableStream({ cancel: cancelled }), {
        headers: { "content-type": "application/jsonl" },
      }),
    );
    const controller = new AbortController();
    const reading = collect(
      client.listCreatedObjects({
        start: NOW - 60_000,
        end: NOW,
        signal: controller.signal,
      }),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    controller.abort();

    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });

  it("stops between items from the same stream chunk", async () => {
    const { client, request } = fixture();
    request.mockResolvedValue(
      streamResponse([
        new TextEncoder().encode(
          `${JSON.stringify(ITEM)}\n${JSON.stringify({ ...ITEM, id: "second" })}\n`,
        ),
      ]),
    );
    const controller = new AbortController();
    const items = client.listCreatedObjects({
      start: NOW - 60_000,
      end: NOW,
      signal: controller.signal,
    });
    expect((await items.next()).value?.id).toBe(ITEM.id);
    controller.abort();
    await expect(items.next()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses the longest exhausted quota window and hides the error body", async () => {
    const { client, request } = fixture();
    request.mockResolvedValue(
      new Response(`private server data ${CREDENTIAL.secret}`, {
        status: 429,
        headers: {
          RateLimit:
            '"burst";r=0;t=30, "sustained";r=0;t=3600, "other";r=2;t=7200',
          "Retry-After": "10",
        },
      }),
    );

    await expect(client.validateCredential()).rejects.toMatchObject({
      name: "MymindApiError",
      status: 429,
      retryAt: NOW + 3_600_000,
      message: "The mymind request limit was reached.",
    });
  });

  it("reports a revoked key and uses Retry-After when no quota header is present", async () => {
    const { client, request } = fixture();
    request.mockResolvedValueOnce(
      new Response("private data", { status: 401 }),
    );
    await expect(client.validateCredential()).rejects.toBeInstanceOf(
      MymindApiError,
    );
    request.mockResolvedValueOnce(
      new Response("private data", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    );
    await expect(client.validateCredential()).rejects.toMatchObject({
      status: 429,
      retryAt: NOW + 60_000,
    });
  });

  it("requests original file bytes and returns the response for streaming", async () => {
    const { client, request } = fixture();
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png" },
    });
    request.mockResolvedValue(response);

    expect(await client.getBlob("id/with spaces")).toBe(response);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://api.mymind.com/objects/id%2Fwith%20spaces/blob",
    );
    expect(new Headers(request.mock.calls[0]?.[1].headers).get("accept")).toBe(
      "application/octet-stream",
    );
  });

  it("does not send the API token to a file download on another origin", async () => {
    let fileAuthorization: string | undefined;
    let apiAuthorization: string | undefined;
    const fileServer = createServer((request, response) => {
      fileAuthorization = request.headers.authorization;
      response.end("original file");
    });
    const fileOrigin = await listen(fileServer);
    const apiServer = createServer((request, response) => {
      apiAuthorization = request.headers.authorization;
      response.writeHead(302, { Location: `${fileOrigin}/original` });
      response.end();
    });
    try {
      const apiOrigin = await listen(apiServer);
      const client = createMymindClient(CREDENTIAL, {
        fetch: (url, init) =>
          fetch(url.replace("https://api.mymind.com", apiOrigin), init),
      });
      const response = await client.getBlob("image");
      expect(await response.text()).toBe("original file");
      expect(apiAuthorization).toMatch(/^Bearer /);
      expect(fileAuthorization).toBeUndefined();
    } finally {
      await Promise.all([close(apiServer), close(fileServer)]);
    }
  });
});
