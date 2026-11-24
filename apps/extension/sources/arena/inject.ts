import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { asText, at, isRecord, parseJsonValue } from "@/utils/json";
import type { JsonRecord, JsonValue } from "@/utils/json";

const GRAPHQL_RE = /\/graphql(?:\?|$)/i;
const CONN_RE = /\/v2\/channels\/[^/]+\/connections(?:\?|$|\/)/;
const BLOCK_RE = /\/v2\/channels\/[^/]+\/blocks(?:\?|$|\/)/;

const SAVE_OPERATIONS = new Set([
  "ConnectCreateConnectionMutation",
  "CreateConnectionMutation",
  "ConnectableCreateConnectionMutation",
  "BlockCreateMutation",
  "CreateBlockMutation",
]);

function asOperations(json: JsonValue | null): Array<JsonRecord> {
  if (Array.isArray(json)) {
    return json.filter(isRecord);
  }
  return isRecord(json) ? [json] : [];
}

function pickSaveOpFromRequest(ops: Array<JsonRecord>): JsonRecord | null {
  for (const op of ops) {
    const operation = asText(op.operationName);
    if (operation && SAVE_OPERATIONS.has(operation)) {
      return op;
    }
    if (at(op, "variables", "connectableId")) {
      return op;
    }
  }
  return null;
}

function pickSaveOpFromResponse(ops: Array<JsonRecord>): JsonRecord | null {
  for (const op of ops) {
    if (at(op, "data", "create_connection", "connectable", "id")) {
      return op;
    }
  }
  return null;
}

function isInteresting(url: string): boolean {
  return GRAPHQL_RE.test(url) || CONN_RE.test(url) || BLOCK_RE.test(url);
}

export function inject(): void {
  const emitted = new Set<string>();

  function emitBlock(blockId: string): void {
    if (!blockId || emitted.has(blockId)) {
      return;
    }
    emitted.add(blockId);
    capture(`https://www.are.na/block/${blockId}`, "arena:save");
  }

  installInterceptor({
    id: "arena",
    match: (req: RequestLens) =>
      req.method === "POST" && isInteresting(req.url),
    async onResponse(req, res) {
      if (!res.ok) {
        return;
      }
      const text = await res.readText();
      if (GRAPHQL_RE.test(req.url)) {
        const requestOp = pickSaveOpFromRequest(
          asOperations(parseJsonValue(await req.readBody())),
        );
        const responseOp = pickSaveOpFromResponse(
          asOperations(parseJsonValue(text)),
        );
        if (!requestOp && !responseOp) {
          return;
        }
        const blockId = String(
          at(responseOp, "data", "create_connection", "connectable", "id") ??
            at(requestOp, "variables", "connectableId") ??
            "",
        );
        if (blockId) {
          emitBlock(blockId);
        }
        return;
      }
      if (CONN_RE.test(req.url) || BLOCK_RE.test(req.url)) {
        const json = parseJsonValue(text);
        if (!isRecord(json)) {
          return;
        }
        const block = json.block ?? json.connectable ?? (json.id ? json : null);
        const blockId = at(block, "id");
        if (blockId) {
          emitBlock(String(blockId));
        }
      }
    },
  });
}
