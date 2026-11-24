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

function pendingConnect() {}

function fakeClient(tools: Array<Omit<McpTool, "inputSchema">>) {
  return {
    listTools: vi.fn(async () => ({
      tools: tools.map((t) => ({ inputSchema: { type: "object" }, ...t })),
    })),
    callTool: vi.fn(async (): Promise<McpCallResult> => ({
      content: [{ type: "text", text: "done" }],
    })),
    close: vi.fn(async () => {}),
  } satisfies McpConnection;
}

function manager(
  client = fakeClient([
    { name: "list_issues", annotations: { readOnlyHint: true } },
  ]),
) {
  const deps = {
    list: vi.fn(async () => [server]),
    secrets: vi.fn(async () => ({})),
    connect: vi.fn(
      async (
        _server: FishMcpServerConfig,
        _secrets: Record<string, string>,
        _onClose: () => void,
      ): Promise<McpConnection> => client,
    ),
    now: vi.fn(() => 0),
  };
  return { client, deps, manager: createFishMcpManager(deps) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fish MCP manager", () => {
  it("connects enabled servers once and lists their tools", async () => {
    const { deps, manager: m } = manager();
    await m.ensure();
    await m.ensure();
    expect(deps.connect).toHaveBeenCalledTimes(1);
    expect(m.tools()).toEqual([
      { server, tool: expect.objectContaining({ name: "list_issues" }) },
    ]);
  });

  it("shares one connection between overlapping turns", async () => {
    const { deps, manager: m } = manager();
    await Promise.all([m.ensure(), m.ensure()]);
    expect(deps.connect).toHaveBeenCalledTimes(1);
  });

  it("passes the stored secrets to the connection", async () => {
    const { deps, manager: m } = manager();
    deps.secrets.mockResolvedValue({ GITHUB_TOKEN: "x" });
    await m.ensure();
    expect(deps.connect).toHaveBeenCalledWith(
      server,
      { GITHUB_TOKEN: "x" },
      expect.any(Function),
    );
  });

  it("skips disabled servers", async () => {
    const { deps, manager: m } = manager();
    deps.list.mockResolvedValue([{ ...server, enabled: false }]);
    await m.ensure();
    expect(deps.connect).not.toHaveBeenCalled();
    expect(m.status()[0]).toMatchObject({ state: "off" });
  });

  it("records a failed connection and keeps going", async () => {
    const { deps, manager: m } = manager();
    deps.connect.mockRejectedValue(new Error("spawn npx ENOENT"));
    await m.ensure();
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "spawn npx ENOENT",
    });
    expect(m.tools()).toEqual([]);
  });

  it("gives up after 10 seconds and closes a connection that arrives late", async () => {
    vi.useFakeTimers();
    const { client, deps, manager: m } = manager();
    let resolveConnect: (value: McpConnection) => void = pendingConnect;
    deps.connect.mockReturnValue(
      new Promise<McpConnection>((resolve) => {
        resolveConnect = resolve;
      }),
    );
    const ensuring = m.ensure();
    await vi.advanceTimersByTimeAsync(10_000);
    await ensuring;
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "github didn't start within 10 seconds.",
    });
    resolveConnect(client);
    await vi.waitFor(() => expect(client.close).toHaveBeenCalled());
  });

  it("returns tool text and throws on isError", async () => {
    const { client, manager: m } = manager();
    await m.ensure();
    expect(await m.call("s1", "list_issues", { repo: "a/b" })).toEqual({
      text: "done",
    });
    client.callTool.mockResolvedValueOnce({
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
    client.callTool.mockResolvedValueOnce({
      content: [{ type: "text", text: "chart" }, { type: "image" }],
      structuredContent: { count: 3 },
    });
    expect(await m.call("s1", "list_issues", {})).toEqual({
      text: "chart\n[image]",
      structured: { count: 3 },
    });
  });

  it("marks a server that stops as failed so the next turn reconnects", async () => {
    const { deps, manager: m } = manager();
    await m.ensure();
    const onClose = deps.connect.mock.calls[0]?.[2];
    onClose?.();
    expect(m.status()[0]).toMatchObject({
      state: "failed",
      error: "github stopped.",
    });
    expect(m.tools()).toEqual([]);
    await m.ensure();
    expect(deps.connect).toHaveBeenCalledTimes(2);
  });

  it("ignores the close it caused itself", async () => {
    const { deps, manager: m } = manager();
    await m.ensure();
    await m.reset("s1");
    deps.connect.mock.calls[0]?.[2]?.();
    expect(m.status()).toEqual([]);
  });

  it("refuses a call to a server that isn't connected", async () => {
    const { manager: m } = manager();
    await expect(m.call("s1", "list_issues", {})).rejects.toThrow(
      "That MCP server isn't connected. Try again.",
    );
  });

  it("closes idle servers", async () => {
    const { client, deps, manager: m } = manager();
    await m.ensure();
    deps.now.mockReturnValue(11 * 60_000);
    await m.sweep();
    expect(client.close).toHaveBeenCalled();
    expect(m.tools()).toEqual([]);
  });

  it("closes servers that were removed", async () => {
    const { client, deps, manager: m } = manager();
    await m.ensure();
    deps.list.mockResolvedValue([]);
    await m.ensure();
    expect(client.close).toHaveBeenCalled();
    expect(m.status()).toEqual([]);
  });

  it("reconnects after a config change", async () => {
    const { deps, manager: m } = manager();
    await m.ensure();
    await m.reset("s1");
    await m.ensure();
    expect(deps.connect).toHaveBeenCalledTimes(2);
  });

  it("closes everything on quit", async () => {
    const { client, manager: m } = manager();
    await m.ensure();
    await m.closeAll();
    expect(client.close).toHaveBeenCalled();
    expect(m.status()).toEqual([]);
  });
});
