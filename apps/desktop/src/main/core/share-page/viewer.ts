import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { SharePageViewer } from "./html";

/** Packaged builds carry `packages/share-page/dist` as `Resources/share-page`; development reads the package's own build. */
function viewerDirectory(): string | null {
  const roots = [
    process.resourcesPath ? join(process.resourcesPath, "share-page") : "",
    join(app.getAppPath(), "..", "..", "packages", "share-page", "dist"),
  ].filter(Boolean);
  return roots.find((root) => existsSync(join(root, "viewer.js"))) ?? null;
}

export async function loadSharePageViewer(): Promise<SharePageViewer> {
  const directory = viewerDirectory();
  if (!directory) {
    throw new Error(
      "The Share Page viewer isn't built. Run `pnpm --filter @pond/share-page build`.",
    );
  }
  const [script, style] = await Promise.all([
    readFile(join(directory, "viewer.js"), "utf8"),
    readFile(join(directory, "viewer.css"), "utf8"),
  ]);
  return { script, style };
}
