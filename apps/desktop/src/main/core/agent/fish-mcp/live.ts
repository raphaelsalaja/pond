import { app } from "electron";
import log from "electron-log/main.js";
import type { FishMcpServerConfig } from "../../../../shared/fish-mcp-contracts";
import { pathEnvKey, withCliDirectories } from "../cli-runtime";
import {
  createFishMcpManager,
  McpCallResultSchema,
  McpToolSchema,
} from "./client";
import type { McpConnection, McpTool } from "./client";
import { getFishMcpStore } from "./store";

const SWEEP_MS = 60_000;
const STDERR_TAIL = 2000;

/** A GUI app on macOS gets a minimal PATH, so `npx` and friends need the user's install folders. */
async function stdioEnvironment(
  env: Record<string, string>,
  secrets: Record<string, string>,
) {
  const pathKey = pathEnvKey(env);
  return {
    ...env,
    ...secrets,
    [pathKey]: await withCliDirectories(env[pathKey] ?? ""),
  };
}

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1)?.trim() ?? "";
}

async function connectLive(
  server: FishMcpServerConfig,
  secrets: Record<string, string>,
  onClose: () => void,
): Promise<McpConnection> {
  /** The MCP SDK stays out of launch; it loads with the first server Fish connects to. */
  const [{ Client }, stdio, { StreamableHTTPClientTransport }] =
    await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    ]);
  const client = new Client({ name: "pond-fish", version: app.getVersion() });
  let stderr = "";
  let transport: Parameters<typeof client.connect>[0];
  if (server.transport === "stdio") {
    const local = new stdio.StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd || undefined,
      env: await stdioEnvironment(stdio.getDefaultEnvironment(), secrets),
      stderr: "pipe",
    });
    local.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL);
    });
    transport = local;
  } else {
    transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: secrets },
    });
  }
  client.onclose = () => {
    if (stderr) {
      log.info("[pond fish-mcp] server closed", server.name, stderr);
    }
    onClose();
  };
  try {
    await client.connect(transport);
  } catch (cause) {
    await client.close().catch(() => {});
    const detail = lastLine(stderr);
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(detail ? `${message}: ${detail}` : message, { cause });
  }
  return {
    async listTools(cursor) {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      const tools: Array<McpTool> = page.tools.flatMap((tool) => {
        const parsed = McpToolSchema.safeParse(tool);
        if (!parsed.success) {
          log.warn("[pond fish-mcp] unreadable tool", server.name, tool.name);
        }
        return parsed.success ? [parsed.data] : [];
      });
      return { tools, nextCursor: page.nextCursor };
    },
    async callTool(name, args, options) {
      return McpCallResultSchema.parse(
        await client.callTool({ name, arguments: args }, undefined, options),
      );
    },
    close: () => client.close(),
  };
}

const manager = createFishMcpManager({
  list: () => getFishMcpStore().list(),
  secrets: (id) => getFishMcpStore().secrets(id),
  connect: connectLive,
  now: Date.now,
});

let sweeping = false;

/** Fish's MCP connections; the idle sweep starts with the first turn that needs it. */
export const fishMcp = {
  ...manager,
  ensure() {
    if (!sweeping) {
      sweeping = true;
      setInterval(() => void manager.sweep(), SWEEP_MS).unref();
    }
    return manager.ensure();
  },
};
