import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createFishMcpManager } from "../../core/agent/fish-mcp/client";
import type { McpConnection } from "../../core/agent/fish-mcp/client";
import { createFishMcpStore } from "../../core/agent/fish-mcp/store";
import { createFishMcpQueries } from "./fish-mcp";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "pond-mcp-queries-"));
  const secrets = new Map<string, string>();
  const store = createFishMcpStore(join(dir, "fish-mcp-servers.json"), {
    getSecret: async (account) => secrets.get(account) ?? null,
    setSecret: async (account, value) => {
      secrets.set(account, value);
    },
    deleteSecret: async (account) => {
      secrets.delete(account);
    },
  });
  const client: McpConnection = {
    listTools: async () => ({
      tools: [
        {
          name: "list_issues",
          description: "List issues",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
        { name: "create_issue", inputSchema: { type: "object" } },
      ],
    }),
    callTool: async () => ({ content: [] }),
    close: async () => {},
  };
  const connect = vi.fn(async () => client);
  const manager = createFishMcpManager({
    list: () => store.list(),
    secrets: (id) => store.secrets(id),
    connect,
    now: () => 0,
  });
  return {
    connect,
    secrets,
    queries: createFishMcpQueries(() => store, manager),
  };
}

const server = {
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  enabled: true,
  secretNames: ["GITHUB_TOKEN"],
  toolAccess: {},
};

describe("fish MCP queries", () => {
  it("saves, connects, and reports tools without returning secrets", async () => {
    const { queries, secrets } = await setup();
    const status = await queries["fishMcp.save"]({
      server,
      secrets: { GITHUB_TOKEN: "ghp_secret" },
    });
    expect(status).toMatchObject({
      state: "connected",
      tools: [
        { name: "list_issues", readOnlyHint: true, access: "review" },
        {
          name: "create_issue",
          description: "",
          readOnlyHint: false,
          access: "review",
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain("ghp_secret");
    expect(JSON.stringify(await queries["fishMcp.list"]({}))).not.toContain(
      "ghp_secret",
    );
    expect([...secrets.values()].join()).toContain("ghp_secret");
  });

  it("rejects an invalid server before storing it", async () => {
    const { queries } = await setup();
    expect(() =>
      queries["fishMcp.save"]({
        server: { ...server, name: "Not Valid" },
        secrets: {},
      }),
    ).toThrow("Use lowercase letters, numbers, and dashes.");
    expect(() =>
      queries["fishMcp.save"]({
        server: { ...server, transport: "http", url: "file:///etc/passwd" },
        secrets: {},
      }),
    ).toThrow();
    expect(await queries["fishMcp.list"]({})).toEqual([]);
  });

  it("changes one tool's access", async () => {
    const { queries } = await setup();
    const { server: saved } = await queries["fishMcp.save"]({
      server,
      secrets: {},
    });
    const status = await queries["fishMcp.setToolAccess"]({
      id: saved.id,
      tool: "list_issues",
      access: "read",
    });
    expect(status.tools[0]).toMatchObject({
      name: "list_issues",
      access: "read",
    });
  });

  it("tests a connection again and removes a server", async () => {
    const { connect, queries, secrets } = await setup();
    const { server: saved } = await queries["fishMcp.save"]({
      server,
      secrets: { GITHUB_TOKEN: "x" },
    });
    await queries["fishMcp.test"]({ id: saved.id });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(await queries["fishMcp.remove"]({ id: saved.id })).toEqual({
      ok: true,
    });
    expect(await queries["fishMcp.list"]({})).toEqual([]);
    expect(secrets.size).toBe(0);
    await expect(queries["fishMcp.test"]({ id: saved.id })).rejects.toThrow(
      "That server no longer exists.",
    );
  });
});
