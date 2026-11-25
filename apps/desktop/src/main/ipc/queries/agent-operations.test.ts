import { expect, it, vi } from "vitest";
import { z } from "zod";
import { agentOperationsForQueries } from "./agent-operations";
import { query } from "./params";

it("reuses the IPC handler and strips credentials from discovery", async () => {
  const folders = {
    create: async (input: { name: string }) => ({
      ...input,
      id: "folder",
      parentId: null,
      color: null,
      sortOrder: 0,
      createdAt: new Date(0),
    }),
  };
  const create = vi.spyOn(folders, "create");
  const schema = z.object({ name: z.string().min(1) });
  const operations = agentOperationsForQueries({
    "folders.create": query(schema, folders.create),
    "settings.ingestToken": async () => ({ token: "secret" }),
    "agent.keys": async () => [
      {
        provider: "openai",
        hasKey: true,
        masked: "secret-prefix",
        enabled: true,
      },
    ],
  });
  expect(operations.map((operation) => operation.name)).toEqual([
    "folders.create",
    "agent.keys",
  ]);
  const folder = operations.find(
    (operation) => operation.name === "folders.create",
  );
  expect(folder?.inputSchema).toBe(schema);
  expect(await folder?.execute({ name: "Film" })).toMatchObject({
    name: "Film",
    createdAt: "1970-01-01T00:00:00.000Z",
  });
  expect(create).toHaveBeenCalledExactlyOnceWith({ name: "Film" }, undefined);
  const keys = operations.find((operation) => operation.name === "agent.keys");
  expect(await keys?.execute({})).toEqual([
    { provider: "openai", hasKey: true, enabled: true },
  ]);
});
