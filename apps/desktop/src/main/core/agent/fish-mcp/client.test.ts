import { afterEach, describe, expect, it, vi } from "vitest";
import type { FishMcpServerConfig } from "../../../../shared/fish-mcp-contracts";
import { createFishMcpManager } from "./client";
import type { McpCallResult, McpConnection, McpTool } from "./client";

const server: FishMcpServerConfig = {
  id: "s1",
  name: "github",
  transport: "stdio",
  command: "npx",
  args: [],
  enabled: true,
  secretNames: [],
  toolAccess: {},
};

type ManagerDeps = Parameters<typeof createFishMcpManager>[0];

function pendingConnect() {}

function fakeClient(tools: Array<Omit<McpTool, "inputSchema">>) {
  const replies: Array<McpCallResult> = [];
  const closing = Promise.withResolvers<void>();
  const connection = {
    async listTools() {
      return {
        tools: tools.map((t) => ({ inputSchema: { type: "object" }, ...t })),
      };
    },
    async callTool(): Promise<McpCallResult> {
      return replies.shift() ?? { content: [{ type: "text", text: "done" }] };
    },
    async close() {
      closing.resolve();
    },
  } satisfies McpConnection;
  return {
    connection,
    replies,
    closed: closing.promise,
    close: vi.spyOn(connection, "close"),
  };
}

interface ManagerState {
  servers: Array<FishMcpServerConfig>;
  secrets: Record<string, string>;
  connect: ManagerDeps["connect"];
  now: number;
}

function manager(
  client = fakeClient([
    { name: "list_issues", annotations: { readOnlyHint: true } },
  ]),
) {
  const state: ManagerState = {
    servers: [server],
    secrets: {},
    connect: async () => client.connection,
    now: 0,
  };
  const deps: ManagerDeps = {
    list: async () => state.servers,
    secrets: async () => state.secrets,
    connect: (...args) => state.connect(...args),
    now: () => state.now,
  };
  return {
    client,
    state,
    connect: vi.spyOn(deps, "connect"),
    manager: createFishMcpManager(deps),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fish MCP manager", () => {
  it("connects enabled servers once and lists their tools", async () => {
    const { connect, manager: m } = manager();
    await m.ensure();
    await m.ensure();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(m.tools()).toEqual([
      { server, tool: expect.objectContaining({ name: "list_issues" }) },
    ]);
  });

  it("shares one connection between overlapping turns", async () => {
    const { connect, manager: m } = manager();
    await Promise.all([m.ensure(), m.ensure()]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("passes the stored secrets to the connection", async () => {
    const { connect, state, manager: m } = manager();
    state.secrets = { GITHUB_TOKEN: "x" };
    await m.ensure();
    expect(connect).toHaveBeenCalledWith(
      server,
      { GITHUB_TOKEN: "x" },
      expect.any(Function),
    );
  });

  it("skips disabled servers", async () => {
    const { connect, state, manager: m } = manager();
    state.servers = [{ ...server, enabled: false }];
    await m.ensure();
    expect(connect).not.toHaveBeenCalled();
    expect(m.status()[0]).toMatchObject({ state: "off" });
  });

  it("records a failed connection and keeps going", async () => {
    const { state, manager: m } = manager();
    state.connect = async () => {
      throw new Error("spawn npx ENOENT");
    };
    await m.ensure();
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "spawn npx ENOENT",
    });
    expect(m.tools()).toEqual([]);
  });

  it("gives up after 10 seconds and closes a connection that arrives late", async () => {
    vi.useFakeTimers();
    const { client, state, manager: m } = manager();
    let resolveConnect: (value: McpConnection) => void = pendingConnect;
    const late = new Promise<McpConnection>((resolve) => {
      resolveConnect = resolve;
    });
    state.connect = () => late;
    const ensuring = m.ensure();
    await vi.advanceTimersByTimeAsync(10_000);
    await ensuring;
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "github didn't start within 10 seconds.",
    });
    resolveConnect(client.connection);
    await client.closed;
    expect(client.close).toHaveBeenCalled();
  });

  it("returns tool text and throws on isError", async () => {
    const { client, manager: m } = manager();
    await m.ensure();
    expect(await m.call("s1", "list_issues", { repo: "a/b" })).toEqual({
      text: "done",
    });
    client.replies.push({
      isError: true,
      content: [{ type: "text", text: "rate limited" }],
    });
    await expect(m.call("s1", "list_issues", {})).rejects.toThrow(
      "github: rate limited",
    );
    expect(m.tools()).toHaveLength(1);
  });

  it("returns structured content and marks non-text parts", async () => {
    const { client, manager: m } = manager();
    await m.ensure();
    client.replies.push({
      content: [{ type: "text", text: "chart" }, { type: "image" }],
      structuredContent: { count: 3 },
    });
    expect(await m.call("s1", "list_issues", {})).toEqual({
      text: "chart\n[image]",
      structured: { count: 3 },
    });
  });

  it("marks a server that stops as failed so the next turn reconnects", async () => {
    const { connect, manager: m } = manager();
    await m.ensure();
    const onClose = connect.mock.calls[0]?.[2];
    onClose?.();
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "github stopped.",
    });
    expect(m.tools()).toEqual([]);
    await m.ensure();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("ignores the close it caused itself", async () => {
    const { connect, manager: m } = manager();
    await m.ensure();
    await m.reset("s1");
    connect.mock.calls[0]?.[2]?.();
    expect(m.status()).toEqual([]);
  });

  it("refuses a call to a server that isn't connected", async () => {
    const { manager: m } = manager();
    await expect(m.call("s1", "list_issues", {})).rejects.toThrow(
      "That MCP server isn't connected. Try again.",
    );
  });

  it("closes idle servers", async () => {
    const { client, state, manager: m } = manager();
    await m.ensure();
    state.now = 11 * 60_000;
    await m.sweep();
    expect(client.close).toHaveBeenCalled();
    expect(m.tools()).toEqual([]);
  });

  it("closes servers that were removed", async () => {
    const { client, state, manager: m } = manager();
    await m.ensure();
    state.servers = [];
    await m.ensure();
    expect(client.close).toHaveBeenCalled();
    expect(m.status()).toEqual([]);
  });

  it("reconnects after a config change", async () => {
    const { connect, manager: m } = manager();
    await m.ensure();
    await m.reset("s1");
    await m.ensure();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("closes everything on quit", async () => {
    const { client, manager: m } = manager();
    await m.ensure();
    await m.closeAll();
    expect(client.close).toHaveBeenCalled();
    expect(m.status()).toEqual([]);
  });
});
