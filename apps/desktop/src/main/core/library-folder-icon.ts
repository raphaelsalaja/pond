import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import markSvgPath from "../../../../../packages/icons/brand/icon.svg?asset";
import {
  clearBundleFlag,
  hasCustomBundleIcon,
  setBundleIcon,
} from "./bundle-icon";
import { renderLibraryFolderIcon } from "./folder-icon-art";

const execFileAsync = promisify(execFile);

/** Exports the folder icon this Mac draws, so the Library icon follows the installed macOS style. */
const EXPORT_SYSTEM_FOLDER_ICON = `ObjC.import("AppKit");
function run(argv) {
  const icon = $.NSWorkspace.sharedWorkspace.iconForFileType("public.folder");
  icon.size = $.NSMakeSize(1024, 1024);
  const rep = $.NSBitmapImageRep.alloc.initWithCGImage(icon.CGImageForProposedRectContextHints(null, $(), $()));
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  if (!png.writeToFileAtomically(argv[0], true)) throw new Error("Couldn't export the folder icon.");
}`;

/** Leaves any icon already on the folder, including one you set in Finder. */
export async function applyLibraryFolderIcon(root: string): Promise<void> {
  if (process.platform !== "darwin") return;
  await clearBundleFlag(root);
  if (hasCustomBundleIcon(root)) return;
  const temp = app.getPath("temp");
  const folderPng = join(temp, "pond-system-folder.png");
  const iconPng = join(temp, "pond-library-folder.png");
  await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", EXPORT_SYSTEM_FOLDER_ICON, folderPng],
    { timeout: 8000 },
  );
  const icon = await renderLibraryFolderIcon(
    await readFile(folderPng),
    await readFile(markSvgPath, "utf8"),
  );
  await writeFile(iconPng, icon);
  await setBundleIcon(root, iconPng);
}
