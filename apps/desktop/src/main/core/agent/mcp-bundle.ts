import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import JSZip from "jszip";

/** Claude Desktop runs bundle servers on its own Electron in Node mode, so the flag must not reach Pond. */
const LAUNCHER = `"use strict";
const { spawn } = require("node:child_process");
const { command, args } = require("./pond.json");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(command, args, { stdio: "inherit", env });
child.on("error", (error) => {
  process.stderr.write("Pond could not start: " + error.message + "\\n");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
`;

const TOOLS = [
  ["library_overview", "Summarize what the Library holds."],
  ["search_library", "Find Saves by meaning."],
  ["query_library", "List Saves with exact filters and paging."],
  ["read_save", "Read a Save's notes, text in images and transcript."],
  ["grep_library", "Find exact words inside Saves."],
  ["view_saves", "Look at Save previews."],
  ["show_saves", "Show Saves as a clickable grid."],
  ["open_save", "Open a Save in Pond."],
  ["apply_filter", "Show a filter in the Pond Library grid."],
  ["start_conversion", "Export converted copies of Save files."],
] as const;

async function appIcon(): Promise<Buffer | null> {
  try {
    const icon = await app.getFileIcon(process.execPath, { size: "large" });
    return icon.isEmpty() ? null : icon.toPNG();
  } catch {
    return null;
  }
}

export async function writePondMcpBundle(
  command = process.execPath,
  args: string[] = ["--mcp"],
): Promise<string> {
  const icon = await appIcon();
  const manifest = {
    manifest_version: "0.3",
    name: "pond",
    display_name: "Pond",
    version: app.getVersion(),
    description: "Search, read and open the Saves in your local Pond Library.",
    author: { name: "Pond" },
    ...(icon && { icon: "icon.png" }),
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "node",
        args: [`\${__dirname}/server/index.js`],
      },
    },
    tools: TOOLS.map(([name, description]) => ({ name, description })),
    compatibility: {
      platforms: ["darwin", "win32"],
      runtimes: { node: ">=18.0.0" },
    },
  };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("server/index.js", LAUNCHER);
  zip.file("server/pond.json", JSON.stringify({ command, args }));
  if (icon) zip.file("icon.png", icon);
  const directory = join(app.getPath("temp"), "pond-mcp-bundle");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "Pond.mcpb");
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
  return path;
}
