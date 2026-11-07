import { createHmac } from "node:crypto";
import { z } from "zod";

const API_ORIGIN = "https://api.mymind.com";

export const MymindCredentialSchema = z.object({
  kid: z.string().trim().min(1).max(128),
  secret: z
    .string()
    .trim()
    .max(24)
    .pipe(z.base64())
    .refine((value) => Buffer.from(value, "base64").length === 16),
});

export type MymindCredential = z.infer<typeof MymindCredentialSchema>;

const ContentSchema = z.object({ type: z.string(), body: z.json() });

export const MymindObjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  url: z.string().optional(),
  source: z.object({ url: z.string() }).optional(),
  content: ContentSchema.optional(),
  notes: z
    .array(z.object({ id: z.string().optional(), content: ContentSchema }))
    .optional(),
  tags: z
    .array(z.object({ name: z.string(), flags: z.number().optional() }))
    .default([]),
  blob: z.object({ name: z.string().optional() }).optional(),
  mainEntity: z
    .object({ "@type": z.union([z.string(), z.array(z.string())]) })
    .optional(),
  created: z.iso.datetime({ offset: true }),
  modified: z.iso.datetime({ offset: true }).optional(),
  bumped: z.iso.datetime({ offset: true }).optional(),
});

export type MymindObject = z.infer<typeof MymindObjectSchema>;

export class MymindApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAt?: number,
  ) {
    super(
      status === 401 || status === 403
        ? "The mymind access key was rejected."
        : status === 429
          ? "The mymind request limit was reached."
          : "The mymind request failed.",
    );
    this.name = "MymindApiError";
  }
}

interface MymindClientDependencies {
  beforeRequest?: (signal?: AbortSignal) => Promise<void>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}

interface CreatedObjectsRequest {
  start: number;
  end: number;
  signal?: AbortSignal;
}

function retryTime(headers: Headers, now: number): number | undefined {
  let seconds = 0;
  for (const policy of (headers.get("ratelimit") ?? "").split(",")) {
    const remaining = /(?:^|;)\s*r\s*=\s*(\d+)/i.exec(policy)?.[1];
    const reset = /(?:^|;)\s*t\s*=\s*(\d+)/i.exec(policy)?.[1];
    if (remaining === "0" && reset) seconds = Math.max(seconds, Number(reset));
  }
  if (seconds > 0) return now + seconds * 1000;

  const retryAfter = headers.get("retry-after");
  if (!retryAfter) return undefined;
  const delay = Number(retryAfter);
  if (Number.isFinite(delay) && delay > 0) return now + delay * 1000;
  const date = Date.parse(retryAfter);
  return date > now ? date : undefined;
}

function parseObject(line: string): MymindObject {
  try {
    return MymindObjectSchema.parse(JSON.parse(line));
  } catch {
    throw new Error("mymind returned invalid item data.");
  }
}

async function* readObjects(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<MymindObject> {
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (
    contentType?.trim().toLowerCase() !== "application/jsonl" ||
    !response.body
  )
    throw new Error("mymind did not return a complete item stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const result = await reader.read();
      signal?.throwIfAborted();
      pending += result.done
        ? decoder.decode()
        : decoder.decode(result.value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        signal?.throwIfAborted();
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) yield parseObject(line);
        newline = pending.indexOf("\n");
      }
      if (result.done) break;
    }
    signal?.throwIfAborted();
    if (pending.trim()) yield parseObject(pending);
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createMymindClient(
  input: MymindCredential,
  dependencies: MymindClientDependencies = {},
) {
  const credential = MymindCredentialSchema.parse(input);
  const request = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;

  async function get(
    path: string,
    query: URLSearchParams,
    accept: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    signal?.throwIfAborted();
    await dependencies.beforeRequest?.(signal);
    signal?.throwIfAborted();
    const issuedAt = Math.floor(now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", kid: credential.kid }),
    ).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({
        path,
        method: "GET",
        iat: issuedAt,
        exp: issuedAt + 300,
      }),
    ).toString("base64url");
    const payload = `${header}.${claims}`;
    const signature = createHmac(
      "sha256",
      Buffer.from(credential.secret, "base64"),
    )
      .update(payload)
      .digest("base64url");
    const url = new URL(path, API_ORIGIN);
    url.search = query.toString();
    const response = await request(url.href, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${payload}.${signature}`,
        Accept: accept,
        "User-Agent": "Pond/mymind",
      },
      signal,
      redirect: "follow",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new MymindApiError(
        response.status,
        retryTime(response.headers, now()),
      );
    }
    return response;
  }

  return {
    async validateCredential(signal?: AbortSignal): Promise<void> {
      const timeout = AbortSignal.timeout(30_000);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      const response = await get(
        "/objects",
        new URLSearchParams({ limit: "1" }),
        "application/json",
        requestSignal,
      );
      try {
        z.array(MymindObjectSchema).parse(await response.json());
      } catch {
        requestSignal.throwIfAborted();
        throw new Error("mymind returned invalid item data.");
      }
    },

    async *listCreatedObjects({ start, end, signal }: CreatedObjectsRequest) {
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
        throw new Error("The mymind import date range is invalid.");
      const query = new URLSearchParams({
        q: `created:${new Date(start).toISOString()}/PT${(end - start) / 1000}S`,
        contentAs: "text/markdown",
      });
      const response = await get(
        "/objects",
        query,
        "application/jsonl",
        signal,
      );
      yield* readObjects(response, signal);
    },

    getBlob(id: string, signal?: AbortSignal): Promise<Response> {
      return get(
        `/objects/${encodeURIComponent(id)}/blob`,
        new URLSearchParams(),
        "application/octet-stream",
        signal,
      );
    },
  };
}
