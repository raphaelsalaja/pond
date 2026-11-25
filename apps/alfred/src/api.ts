import { z } from "zod/mini";

const BASE = "http://127.0.0.1:41610/api/v2";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue };

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/** The token goes through curl's config on stdin so it never shows up in `ps`. */
export function curlCommand(path: string, body: JsonValue): string {
  return [
    `printf 'header = "Authorization: Bearer %s"\\n' "$POND_TOKEN" |`,
    "curl -sS --max-time 5 -K -",
    "-H 'Content-Type: application/json'",
    `-w '\\n%{http_code}'`,
    `--data-binary ${shellQuote(JSON.stringify(body))}`,
    shellQuote(`${BASE}${path}`),
  ].join(" ");
}

export interface CurlResult {
  status: number;
  body: JsonValue;
}

export function parseCurl(output: string): CurlResult {
  const split = output.lastIndexOf("\n");
  const status = Number(output.slice(split + 1));
  const text = output.slice(0, split);
  return { status, body: parseBody(text) };
}

const JsonSchema = z.json();

function parseBody(text: string): JsonValue {
  try {
    const parsed = JsonSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ApiFailure = "offline" | "unauthorized" | "forbidden" | "failed";

export function failureFor(result: CurlResult): ApiFailure | null {
  if (result.status >= 200 && result.status < 300) return null;
  if (result.status === 401) return "unauthorized";
  if (result.status === 403) return "forbidden";
  return "failed";
}
