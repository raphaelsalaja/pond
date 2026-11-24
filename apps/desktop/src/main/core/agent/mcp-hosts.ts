import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  MCP_DETECTED_CLIENTS,
  MCP_HOST_CATALOG,
} from "../../../shared/mcp-hosts";
import type { McpClientStatus, McpHostId } from "../../../shared/mcp-hosts";

const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

export function pondMcpSnippet(
  command = process.execPath,
  args: Array<string> = ["--mcp"],
) {
  return {
    command,
    args,
    json: JSON.stringify({ mcpServers: { pond: { command, args } } }, null, 2),
  };
}

export function mcpInstallUrl(
  id: McpHostId,
  command: string,
  args: Array<string>,
): string | null {
  if (id === "cursor") {
    const config = Buffer.from(JSON.stringify({ command, args })).toString(
      "base64",
    );
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=pond&config=${encodeURIComponent(config)}`;
  }
  if (id === "vscode") {
    return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "pond", command, args }))}`;
  }
  return null;
}

export function mcpDeeplinkUrl(id: "cursor" | "vscode"): string | null {
  return mcpInstallUrl(id, process.execPath, ["--mcp"]);
}

/** People rename the server, so a launch path pointing at Pond counts as connected too. */
export function configListsPond(text: string): boolean {
  try {
    const config = McpConfigSchema.safeParse(JSON.parse(text));
    if (!config.success) {
      return false;
    }
    return Object.entries(config.data.mcpServers).some(
      ([name, server]) =>
        name.toLowerCase() === "pond" ||
        JSON.stringify(server).toLowerCase().includes("pond"),
    );
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Claude Desktop unpacks each installed `.mcpb` into a folder named after its id, which carries the bundle name. */
async function claudeExtensionListsPond(configDir: string): Promise<boolean> {
  const names = await readdir(join(configDir, "Claude Extensions")).catch(
    () => [],
  );
  return names.some((name) => name.toLowerCase().includes("pond"));
}

/** A client's config folder exists once it has run, even before any MCP server is added. */
export async function mcpClientStatus(): Promise<Array<McpClientStatus>> {
  return Promise.all(
    MCP_DETECTED_CLIENTS.map(async (id) => {
      const host = MCP_HOST_CATALOG.find((entry) => entry.id === id);
      if (!host) {
        return { id, installed: false, connected: false };
      }
      const raw =
        process.platform === "win32"
          ? (host.windowsConfigPath ?? host.configPath)
          : host.configPath;
      const path = raw
        .replace(/^~/, homedir())
        .replace("%APPDATA%", process.env.APPDATA ?? "");
      if (!(await exists(dirname(path)))) {
        return { id, installed: false, connected: false };
      }
      const text = await readFile(path, "utf8").catch(() => "");
      const connected =
        configListsPond(text) ||
        (id === "claude-desktop" &&
          (await claudeExtensionListsPond(dirname(path))));
      return { id, installed: true, connected };
    }),
  );
}
