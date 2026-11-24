import type { JsonObject } from "@pond/schema/json";
import log from "electron-log/main.js";
import { z } from "zod";
import type {
  FishMcpServerConfig,
  FishMcpServerState,
} from "../../../../shared/fish-mcp-contracts";

export const McpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.json()),
  annotations: z.object({ readOnlyHint: z.boolean().optional() }).optional(),
});
export type McpTool = z.infer<typeof McpToolSchema>;

export const McpCallResultSchema = z.object({
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .optional(),
  structuredContent: z.record(z.string(), z.json()).optional(),
  isError: z.boolean().optional(),
});
export type McpCallResult = z.infer<typeof McpCallResultSchema>;

export interface McpCallOptions {
  signal?: AbortSignal;
  timeout: number;
}

export interface McpConnection {
  listTools(
    cursor?: string,
  ): Promise<{ tools: Array<McpTool>; nextCursor?: string }>;
  callTool(
    name: string,
    args: JsonObject,
    options: McpCallOptions,
  ): Promise<McpCallResult>;
  close(): Promise<void>;
}

export type McpToolResult =
  | { text: string }
  | { text: string; structured: JsonObject };

interface ManagerDeps {
  list(): Promise<Array<FishMcpServerConfig>>;
  secrets(id: string): Promise<Record<string, string>>;
  connect(
    server: FishMcpServerConfig,
    secrets: Record<string, string>,
    onClose: () => void,
  ): Promise<McpConnection>;
  now(): number;
}

interface Entry {
  server: FishMcpServerConfig;
  state: FishMcpServerState;
  error?: string;
  client?: McpConnection;
  tools: Array<McpTool>;
  usedAt: number;
}

const CONNECT_MS = 10_000;
const IDLE_MS = 10 * 60_000;
const CALL_MS = 60_000;
const MAX_TOOLS = 128;

function deadline<T>(work: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function listAll(client: McpConnection): Promise<Array<McpTool>> {
  const tools: Array<McpTool> = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor && tools.length < MAX_TOOLS);
  return tools.slice(0, MAX_TOOLS);
}

function toolResult(server: string, result: McpCallResult): McpToolResult {
  const text = (result.content ?? [])
    .map((part) =>
      part.type === "text" ? (part.text ?? "") : `[${part.type}]`,
    )
    .join("\n");
  if (result.isError === true) {
    throw new Error(`${server}: ${text || "the tool failed."}`);
  }
  return result.structuredContent === undefined
    ? { text }
    : { text, structured: result.structuredContent };
}

export function createFishMcpManager(deps: ManagerDeps) {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<void>>();

  async function open(server: FishMcpServerConfig): Promise<Entry> {
    const entry: Entry = {
      server,
      state: "idle",
      tools: [],
      usedAt: deps.now(),
    };
    const onClose = () => {
      if (entries.get(server.id) !== entry || entry.state !== "connected") {
        return;
      }
      Object.assign(entry, {
        state: "failed",
        error: `${server.name} stopped.`,
        client: undefined,
        tools: [],
      });
    };
    const connecting = deps
      .secrets(server.id)
      .then((secrets) => deps.connect(server, secrets, onClose));
    try {
      const { client, tools } = await deadline(
        connecting.then(async (client) => ({
          client,
          tools: await listAll(client),
        })),
        CONNECT_MS,
        `${server.name} didn't start within 10 seconds.`,
      );
      Object.assign(entry, { client, tools, state: "connected" });
    } catch (error) {
      void connecting.then((client) => client.close()).catch(() => {});
      log.warn("[pond fish-mcp] connect failed", server.name, error);
      Object.assign(entry, { state: "failed", error: messageOf(error) });
    }
    return entry;
  }

  function opening(server: FishMcpServerConfig): Promise<void> {
    const existing = pending.get(server.id);
    if (existing) {
      return existing;
    }
    const run: Promise<void> = open(server).then(async (entry) => {
      if (pending.get(server.id) !== run) {
        await entry.client?.close().catch(() => {});
        return;
      }
      pending.delete(server.id);
      entries.set(server.id, entry);
    });
    pending.set(server.id, run);
    return run;
  }

  async function reset(id: string): Promise<void> {
    pending.delete(id);
    const entry = entries.get(id);
    entries.delete(id);
    await entry?.client?.close().catch(() => {});
  }

  async function ensure(): Promise<void> {
    const servers = await deps.list();
    const ids = new Set(servers.map((server) => server.id));
    await Promise.all(
      [...entries.keys()].flatMap((id) => (ids.has(id) ? [] : [reset(id)])),
    );
    await Promise.all(
      servers.map(async (server) => {
        if (!server.enabled) {
          await reset(server.id);
          entries.set(server.id, {
            server,
            state: "off",
            tools: [],
            usedAt: deps.now(),
          });
          return;
        }
        const current = entries.get(server.id);
        if (current?.state === "connected") {
          current.server = server;
          current.usedAt = deps.now();
          return;
        }
        await opening(server);
      }),
    );
  }

  function tools(): Array<{ server: FishMcpServerConfig; tool: McpTool }> {
    return [...entries.values()]
      .filter((entry) => entry.state === "connected")
      .flatMap((entry) =>
        entry.tools.map((tool) => ({ server: entry.server, tool })),
      );
  }

  function status() {
    return [...entries.values()].map(({ server, state, error, tools }) => ({
      server,
      state,
      error,
      tools,
    }));
  }

  async function call(
    serverId: string,
    tool: string,
    args: JsonObject,
    signal?: AbortSignal,
  ): Promise<McpToolResult> {
    const entry = entries.get(serverId);
    if (!entry?.client) {
      throw new Error("That MCP server isn't connected. Try again.");
    }
    entry.usedAt = deps.now();
    const result = await entry.client.callTool(tool, args, {
      signal,
      timeout: CALL_MS,
    });
    entry.usedAt = deps.now();
    return toolResult(entry.server.name, result);
  }

  async function sweep(): Promise<void> {
    const now = deps.now();
    await Promise.all(
      [...entries].flatMap(([id, entry]) =>
        entry.state === "connected" && now - entry.usedAt >= IDLE_MS
          ? [reset(id)]
          : [],
      ),
    );
  }

  async function closeAll(): Promise<void> {
    await Promise.all(
      [...new Set([...entries.keys(), ...pending.keys()])].map(reset),
    );
  }

  return { ensure, tools, status, call, reset, sweep, closeAll };
}

export type FishMcpManager = ReturnType<typeof createFishMcpManager>;
