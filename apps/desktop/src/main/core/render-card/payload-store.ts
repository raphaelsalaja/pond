import { randomUUID } from "node:crypto";

/** Entries normally leave on first fetch or render completion; expiry only bounds an abandoned render. */
const PAYLOAD_TTL_MS = 30_000;

interface StoredRenderCardPayload {
  body: string;
  expiresAt: number;
}

export interface RenderCardPayloadRef {
  token: string;
}

const payloads = new Map<string, StoredRenderCardPayload>();

function pruneExpired(now = Date.now()): void {
  for (const [token, payload] of payloads) {
    if (payload.expiresAt <= now) payloads.delete(token);
  }
}

export function storeRenderCardPayload(body: string): RenderCardPayloadRef {
  pruneExpired();
  const token = randomUUID();
  payloads.set(token, {
    body,
    expiresAt: Date.now() + PAYLOAD_TTL_MS,
  });
  return { token };
}

export function releaseRenderCardPayload(token: string): void {
  payloads.delete(token);
}

export function clearRenderCardPayloads(): void {
  payloads.clear();
}

export function renderCardPayloadResponse(
  token: string,
  method: string,
): Response {
  if (method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }
  pruneExpired();
  const payload = payloads.get(token);
  if (!payload) return new Response("not found", { status: 404 });
  payloads.delete(token);
  return new Response(payload.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
