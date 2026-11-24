import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { writePondMcpBundle } from "./mcp-bundle";

const ManifestSchema = z.object({
  manifest_version: z.string(),
  name: z.string(),
  server: z.object({
    type: z.literal("node"),
    entry_point: z.string(),
    mcp_config: z.object({ command: z.string(), args: z.array(z.string()) }),
  }),
});

let scratch = "";

afterEach(async () => {
  if (scratch) {
    await rm(scratch, { recursive: true, force: true });
  }
  scratch = "";
});

async function unpack(path: string): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "pond-mcpb-"));
  const zip = await JSZip.loadAsync(await readFile(path));
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const target = join(scratch, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async("nodebuffer"));
  }
  return scratch;
}

describe("Claude Desktop bundle", () => {
  it("writes a node bundle that launches Pond in MCP mode", async () => {
    const root = await unpack(
      await writePondMcpBundle("/Applications/Pond.app/Contents/MacOS/Pond"),
    );
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
    );
    expect(manifest.name).toBe("pond");
    expect(manifest.server.mcp_config.args).toEqual([
      `\${__dirname}/${manifest.server.entry_point}`,
    ]);
    const launch = await readFile(join(root, "server/pond.json"), "utf8");
    expect(JSON.parse(launch)).toEqual({
      command: "/Applications/Pond.app/Contents/MacOS/Pond",
      args: ["--mcp"],
    });
  });

  describe("launch", () => {
    let status: number | null = null;

    beforeAll(async () => {
      const root = await unpack(
        await writePondMcpBundle(process.execPath, [
          "-e",
          "process.exit(process.env.ELECTRON_RUN_AS_NODE ? 1 : 7)",
        ]),
      );
      status = spawnSync(process.execPath, [join(root, "server/index.js")], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      }).status;
    });

    it("starts Pond without Electron's Node mode flag", () => {
      expect(status).toBe(7);
    });
  });
});
