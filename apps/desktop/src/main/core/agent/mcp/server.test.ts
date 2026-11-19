import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MCP_APP_MIME_TYPE, SAVES_VIEW_URI } from "./saves-view";
import { createPondServer, loadPondSkills } from "./server";

const ResponseSchema = z.object({
  id: z.number(),
  result: z.record(z.string(), z.unknown()),
});

const ToolsSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      title: z.string().optional(),
      annotations: z.record(z.string(), z.unknown()).optional(),
      outputSchema: z.unknown().optional(),
      _meta: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

async function connect() {
  const [client, transport] = InMemoryTransport.createLinkedPair();
  await createPondServer("0.0.0", await loadPondSkills()).connect(transport);
  const waiting = new Map<number, (result: Record<string, unknown>) => void>();
  client.onmessage = (message) => {
    const response = ResponseSchema.safeParse(message);
    if (!response.success) return;
    waiting.get(response.data.id)?.(response.data.result);
  };
  await client.start();
  let next = 0;
  const call = (method: string, params: Record<string, unknown> = {}) => {
    next += 1;
    const id = next;
    return new Promise<Record<string, unknown>>((resolve) => {
      waiting.set(id, resolve);
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  };
  const init = await call("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "0.0.0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { call, init };
}

async function listTools() {
  const { call } = await connect();
  return ToolsSchema.parse(await call("tools/list")).tools;
}

describe("pond mcp server", () => {
  it("tells the model how to use Pond", async () => {
    const { init } = await connect();
    expect(init.instructions).toEqual(
      expect.stringContaining("library_overview"),
    );
  });

  it("keeps every tool name earlier releases published", async () => {
    const names = (await listTools()).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "query_library",
        "search_library",
        "read_save",
        "grep_library",
        "list_folders",
        "open_save",
        "apply_filter",
        "list_conversion_capabilities",
        "list_conversion_presets",
        "save_conversion_preset",
        "start_conversion",
        "compress_images",
        "conversion_status",
        "cancel_conversion",
      ]),
    );
  });

  it("marks only compress_images as destructive", async () => {
    const tools = await listTools();
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }
    const destructive = tools
      .filter((tool) => tool.annotations?.destructiveHint === true)
      .map((tool) => tool.name);
    expect(destructive).toEqual(["compress_images"]);
    const search = tools.find((tool) => tool.name === "search_library");
    expect(search?.annotations?.readOnlyHint).toBe(true);
  });

  it("links show_saves to the grid view", async () => {
    const tools = await listTools();
    const show = tools.find((tool) => tool.name === "show_saves");
    expect(show?._meta?.ui).toMatchObject({ resourceUri: SAVES_VIEW_URI });
    expect(show?.outputSchema).toBeDefined();
    const preview = tools.find((tool) => tool.name === "preview_save");
    expect(preview?._meta?.ui).toMatchObject({ visibility: ["app"] });
  });

  it("serves the grid as an MCP App page", async () => {
    const { call } = await connect();
    const result = z
      .object({
        contents: z.array(z.object({ mimeType: z.string(), text: z.string() })),
      })
      .parse(await call("resources/read", { uri: SAVES_VIEW_URI }));
    expect(result.contents[0]?.mimeType).toBe(MCP_APP_MIME_TYPE);
    expect(result.contents[0]?.text).toContain("ui/initialize");
  });

  it("publishes Save and folder resource templates", async () => {
    const { call } = await connect();
    const result = z
      .object({
        resourceTemplates: z.array(z.object({ uriTemplate: z.string() })),
      })
      .parse(await call("resources/templates/list"));
    expect(result.resourceTemplates.map((entry) => entry.uriTemplate)).toEqual(
      expect.arrayContaining(["pond://save/{id}", "pond://folder/{id}"]),
    );
  });

  it("offers prompts that fill in the date range", async () => {
    const { call } = await connect();
    const prompts = z
      .object({ prompts: z.array(z.object({ name: z.string() })) })
      .parse(await call("prompts/list"));
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
      expect.arrayContaining([
        "find_saves",
        "summarize_folder",
        "recent_saves",
        "tidy_library",
      ]),
    );
    const recent = await call("prompts/get", {
      name: "recent_saves",
      arguments: { days: "3" },
    });
    expect(JSON.stringify(recent)).toContain("last 3 days");
  });
});
