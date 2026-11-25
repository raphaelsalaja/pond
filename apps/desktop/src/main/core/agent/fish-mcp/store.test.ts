import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFishMcpStore } from "./store";

function memoryKeychain() {
  const values = new Map<string, string>();
  return {
    values,
    getSecret: async (account: string) => values.get(account) ?? null,
    setSecret: async (account: string, value: string) => {
      values.set(account, value);
    },
    deleteSecret: async (account: string) => {
      values.delete(account);
    },
  };
}

async function store() {
  const dir = await mkdtemp(join(tmpdir(), "pond-mcp-"));
  const file = join(dir, "fish-mcp-servers.json");
  const keychain = memoryKeychain();
  let ids = 0;
  return {
    file,
    keychain,
    store: createFishMcpStore(file, keychain, () => `id${++ids}`),
  };
}

const stdio = {
  name: "github",
  transport: "stdio" as const,
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  enabled: true,
  secretNames: ["GITHUB_TOKEN"],
  toolAccess: {},
};

const secretsSchema = z.record(z.string(), z.string());

function storedSecrets(
  keychain: ReturnType<typeof memoryKeychain>,
): Record<string, string> {
  return secretsSchema.parse(
    JSON.parse(keychain.values.get("fish-mcp:id1") ?? "{}"),
  );
}

describe("fish MCP store", () => {
  it("saves a server without writing secrets to disk", async () => {
    const { file, keychain, store: s } = await store();
    const saved = await s.save(stdio, { GITHUB_TOKEN: "ghp_secret" });
    expect(saved.id).toBe("id1");
    expect(await readFile(file, "utf8")).not.toContain("ghp_secret");
    expect(storedSecrets(keychain)).toEqual({ GITHUB_TOKEN: "ghp_secret" });
    expect(await s.list()).toEqual([saved]);
  });

  it("keeps a stored secret when the new value is blank", async () => {
    const { keychain, store: s } = await store();
    const saved = await s.save(stdio, { GITHUB_TOKEN: "one" });
    await s.save(saved, { GITHUB_TOKEN: "" });
    expect(storedSecrets(keychain)).toEqual({ GITHUB_TOKEN: "one" });
  });

  it("drops secrets no longer named", async () => {
    const { keychain, store: s } = await store();
    const saved = await s.save(stdio, { GITHUB_TOKEN: "one" });
    await s.save({ ...saved, secretNames: [] }, {});
    expect(storedSecrets(keychain)).toEqual({});
  });

  it("rejects a duplicate name", async () => {
    const { store: s } = await store();
    await s.save(stdio, {});
    await expect(s.save({ ...stdio }, {})).rejects.toThrow(
      "A server named github already exists.",
    );
  });

  it("removes the server and its secrets", async () => {
    const { keychain, store: s } = await store();
    const saved = await s.save(stdio, { GITHUB_TOKEN: "x" });
    await s.remove(saved.id);
    expect(await s.list()).toEqual([]);
    expect(keychain.values.has("fish-mcp:id1")).toBe(false);
  });

  it("reads secrets for a connection", async () => {
    const { store: s } = await store();
    const saved = await s.save(stdio, { GITHUB_TOKEN: "x" });
    expect(await s.secrets(saved.id)).toEqual({ GITHUB_TOKEN: "x" });
  });

  it("sets one tool's access", async () => {
    const { store: s } = await store();
    const saved = await s.save(stdio, {});
    const updated = await s.setToolAccess(saved.id, "create_issue", "off");
    expect(updated.toolAccess).toEqual({ create_issue: "off" });
    expect(await s.list()).toEqual([updated]);
    await expect(s.setToolAccess("gone", "x", "read")).rejects.toThrow(
      "That server no longer exists.",
    );
  });

  it("treats a corrupt file as empty", async () => {
    const { file, store: s } = await store();
    await writeFile(file, "{");
    expect(await s.list()).toEqual([]);
  });
});
