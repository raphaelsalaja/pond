/**
 * An in-memory S3 bucket behind a fetch function, for tests. It models what the client relies
 * on: signed requests only, path-style keys, overwrite on PUT, 204 on DELETE, and ListObjectsV2
 * pages with continuation tokens. `fail` makes the next matching request fail like S3 would.
 */
export function createFakeS3(options: { bucket: string; pageSize?: number }) {
  const objects = new Map<
    string,
    { body: Uint8Array; contentType: string; cacheControl: string }
  >();
  const log: Array<string> = [];
  let fail: { method: string; status: number; code: string } | null = null;
  const pageSize = options.pageSize ?? 1000;

  async function fetch(url: string, init: RequestInit): Promise<Response> {
    const method = init.method ?? "GET";
    const parsed = new URL(url);
    const headers = new Headers(init.headers);
    log.push(`${method} ${parsed.pathname}${parsed.search}`);
    if (!headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256 ")) {
      return error(403, "AccessDenied");
    }
    if (fail && fail.method === method) {
      const { status, code } = fail;
      fail = null;
      return error(status, code);
    }
    const [, bucket, ...rest] = parsed.pathname.split("/");
    if (bucket !== options.bucket) return error(404, "NoSuchBucket");
    const key = rest.map(decodeURIComponent).join("/");
    if (method === "PUT") {
      const body = init.body;
      objects.set(key, {
        body: Buffer.isBuffer(body) ? new Uint8Array(body) : new Uint8Array(),
        contentType: headers.get("content-type") ?? "",
        cacheControl: headers.get("cache-control") ?? "",
      });
      return new Response(null, { status: 200 });
    }
    if (method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && key === "") {
      const prefix = parsed.searchParams.get("prefix") ?? "";
      const start = Number(parsed.searchParams.get("continuation-token") ?? 0);
      const keys = [...objects.keys()]
        .filter((entry) => entry.startsWith(prefix))
        .sort();
      const page = keys.slice(start, start + pageSize);
      const truncated = start + pageSize < keys.length;
      const xml = `<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${
        truncated
          ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>`
          : ""
      }${page.map((entry) => `<Contents><Key>${entry}</Key></Contents>`).join("")}</ListBucketResult>`;
      return new Response(xml, { status: 200 });
    }
    return error(400, "InvalidRequest");
  }

  return {
    fetch,
    objects,
    log,
    failNext(method: string, status: number, code: string) {
      fail = { method, status, code };
    },
  };
}

function error(status: number, code: string): Response {
  return new Response(
    `<Error><Code>${code}</Code><Message>${code} message</Message></Error>`,
    { status },
  );
}
