import type { JsonObject } from "@pond/schema/json";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentOperationRequest } from "../../../shared/agent-operations";
import {
  applyPondOperation,
  fishOperationCatalog,
  pondOperationCatalog,
  pondOperationTools,
  registerExternalOperations,
  registerPondOperations,
} from "./operations";
import type { OperationCatalog, PondOperation } from "./operations";

function fixture() {
  let libraryId = "library-one";
  const handlers = {
    execute: async (args: JsonObject) => ({
      name: args.name ?? "existing",
      ok: true,
    }),
    propose: (_request: AgentOperationRequest) => "review-one",
  };
  const execute = vi.spyOn(handlers, "execute");
  const propose = vi.spyOn(handlers, "propose");
  const controller = new AbortController();
  const catalog: OperationCatalog = {
    libraryId: () => libraryId,
    operations: [
      {
        name: "folders.list",
        description: "Read folders",
        access: "read",
        inputSchema: z.object({}),
        execute,
      },
      {
        name: "folders.create",
        description: "Create a Folder",
        access: "review",
        inputSchema: z.object({ name: z.string().min(1) }),
        execute,
      },
    ],
  };
  const tools = pondOperationTools(
    { signal: controller.signal, propose },
    catalog,
  );
  function tool(name: string) {
    const found = tools.find((entry) => entry.name === name);
    if (!found) {
      throw new Error(`Missing tool ${name}`);
    }
    return found;
  }
  return {
    catalog,
    execute,
    propose,
    controller,
    tool,
    switchLibrary: () => {
      libraryId = "library-two";
    },
  };
}

it("discovers paginated capabilities and their original input schemas", async () => {
  const { tool } = fixture();
  expect(
    await tool("discoverPondOperations").execute({ query: "folder", limit: 1 }),
  ).toMatchObject({
    total: 2,
    nextOffset: 1,
    operations: [{ name: "folders.list" }],
  });
  expect(
    await tool("discoverPondOperations").execute({
      query: "folder",
      offset: 1,
      limit: 1,
    }),
  ).toMatchObject({
    nextOffset: null,
    operations: [{ name: "folders.create" }],
  });
  expect(
    await tool("describePondOperation").execute({
      operation: "folders.create",
    }),
  ).toMatchObject({
    requiresReview: true,
    inputSchema: {
      required: ["name"],
      properties: { name: { type: "string", minLength: 1 } },
    },
  });
});

it("runs reads and proposes changes without executing them", async () => {
  const { tool, execute, propose } = fixture();
  expect(
    await tool("runPondOperation").execute({
      operation: "folders.list",
      reason: "Find the target Folder",
    }),
  ).toMatchObject({ status: "complete" });
  expect(execute).toHaveBeenCalledOnce();
  expect(
    await tool("runPondOperation").execute({
      operation: "folders.create",
      arguments: { name: "Film" },
      reason: "Organize references",
    }),
  ).toEqual({ status: "pending-review", changeId: "review-one" });
  expect(execute).toHaveBeenCalledOnce();
  expect(propose).toHaveBeenCalledWith(
    {
      operation: "folders.create",
      arguments: { name: "Film" },
      libraryId: "library-one",
    },
    "Create a Folder",
    "Organize references",
  );
});

it("rejects invalid and unavailable operations before proposing or executing", async () => {
  const { tool, execute, propose } = fixture();
  await expect(
    tool("runPondOperation").execute({
      operation: "folders.create",
      arguments: { name: "" },
      reason: "Create",
    }),
  ).rejects.toThrow();
  await expect(
    tool("runPondOperation").execute({
      operation: "settings.ingestToken",
      reason: "Get token",
    }),
  ).rejects.toThrow(/unavailable/);
  expect(execute).not.toHaveBeenCalled();
  expect(propose).not.toHaveBeenCalled();
});

it("revalidates reviewed arguments and the active Library", async () => {
  const { catalog, execute, switchLibrary } = fixture();
  const request = {
    operation: "folders.create",
    arguments: { name: "Film" },
    libraryId: "library-one",
  };
  expect(await applyPondOperation(request, catalog)).toMatchObject({
    name: "Film",
  });
  switchLibrary();
  await expect(applyPondOperation(request, catalog)).rejects.toThrow(
    /Library changed/,
  );
  expect(execute).toHaveBeenCalledOnce();
  await expect(
    applyPondOperation(
      { ...request, libraryId: "library-two", arguments: {} },
      catalog,
    ),
  ).rejects.toThrow();
  expect(execute).toHaveBeenCalledOnce();
});

it("stops tool execution after cancellation or a Library switch", async () => {
  const state = fixture();
  state.controller.abort();
  await expect(
    state
      .tool("runPondOperation")
      .execute({ operation: "folders.list", reason: "Read" }),
  ).rejects.toThrow();
  expect(state.execute).not.toHaveBeenCalled();
  const moved = fixture();
  moved.switchLibrary();
  await expect(
    moved
      .tool("runPondOperation")
      .execute({ operation: "folders.list", reason: "Read" }),
  ).rejects.toThrow(/Library changed/);
  expect(moved.execute).not.toHaveBeenCalled();
});

it("preserves operation failures rather than reporting completion", async () => {
  const state = fixture();
  const original = state.catalog.operations[0];
  if (!original) {
    throw new Error("Missing fixture operation");
  }
  const catalog: OperationCatalog = {
    ...state.catalog,
    operations: [
      { ...original, execute: async () => ({ ok: false, error: "Disk full" }) },
    ],
  };
  await expect(
    applyPondOperation(
      { operation: "folders.list", arguments: {}, libraryId: "library-one" },
      catalog,
    ),
  ).rejects.toThrow("Disk full");
});

it("pages a large result without executing its operation twice", async () => {
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return { text: "reference ".repeat(3000) };
  };
  const catalog: OperationCatalog = {
    libraryId: () => "library",
    operations: [
      {
        name: "saves.list",
        description: "Read Saves",
        access: "read",
        inputSchema: z.object({}),
        execute,
      },
    ],
  };
  const tools = pondOperationTools(
    { signal: new AbortController().signal, propose: () => "unused" },
    catalog,
  );
  const run = tools.find((entry) => entry.name === "runPondOperation");
  const read = tools.find((entry) => entry.name === "readPondOperationResult");
  if (!run || !read) {
    throw new Error("Missing operation tools");
  }
  const first = z
    .object({
      resultId: z.string(),
      text: z.string(),
      nextOffset: z.number(),
      totalCharacters: z.number(),
    })
    .parse(
      await run.execute({ operation: "saves.list", reason: "Read Saves" }),
    );
  const second = z.object({ text: z.string(), nextOffset: z.null() }).parse(
    await read.execute({
      resultId: first.resultId,
      offset: first.nextOffset,
      limit: 16_000,
    }),
  );
  expect(JSON.parse(first.text + second.text)).toEqual({
    text: "reference ".repeat(3000),
  });
  expect(executions).toBe(1);
});

const readOp = (name: string): PondOperation => ({
  name,
  description: name,
  access: "read",
  inputSchema: z.object({}),
  execute: async () => ({ name }),
});

it("adds external operations to the Fish catalog only", () => {
  registerPondOperations({
    operations: [readOp("folders.list")],
    libraryId: () => "lib",
  });
  registerExternalOperations(() => [
    readOp("mcp.github.list_issues"),
    readOp("folders.list"),
  ]);
  expect(pondOperationCatalog().operations.map((o) => o.name)).toEqual([
    "folders.list",
  ]);
  expect(fishOperationCatalog().operations.map((o) => o.name)).toEqual([
    "folders.list",
    "mcp.github.list_issues",
  ]);
  registerExternalOperations(() => []);
});

it("reads the Fish catalog when a tool runs, so servers that connect later are reachable", async () => {
  registerPondOperations({ operations: [], libraryId: () => "lib" });
  const tools = pondOperationTools({
    signal: new AbortController().signal,
    propose: () => "unused",
  });
  registerExternalOperations(() => [readOp("mcp.github.list_issues")]);
  const run = tools.find((entry) => entry.name === "runPondOperation");
  expect(
    await run?.execute({
      operation: "mcp.github.list_issues",
      reason: "List issues",
    }),
  ).toEqual({ status: "complete", result: { name: "mcp.github.list_issues" } });
  expect(
    await applyPondOperation({
      operation: "mcp.github.list_issues",
      arguments: {},
      libraryId: "lib",
    }),
  ).toEqual({ name: "mcp.github.list_issues" });
  registerExternalOperations(() => []);
});
