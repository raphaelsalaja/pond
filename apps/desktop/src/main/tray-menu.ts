import { saves } from "@pond/schema/db";
import { count, isNull } from "drizzle-orm";
import { app, Menu } from "electron";
import { blankDocumentDef } from "../shared/blank-documents";
import { resolveShortcuts } from "../shared/shortcuts";
import { listInstalledBlankDocuments } from "./core/blank-documents";
import { readLibraryIdentity } from "./core/library-identity";
import { readQueueSummary } from "./core/pipeline/queue-summary";
import { getPrefs } from "./core/prefs";
import { getDb } from "./db";
import { menuAccelerator } from "./lib/menu-accelerator";
import { libraryRoot } from "./paths";
import type { TrayOptions } from "./tray";
import {
  buildTrayTemplate,
  type TrayAccelerators,
  type TrayBlankDocument,
  type TrayStatusInput,
  trayHeaderLabel,
} from "./tray-status";

export async function buildTooltip(): Promise<string> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ n: count() })
      .from(saves)
      .where(isNull(saves.deletedAt));
    return trayHeaderLabel({
      libraryName: await libraryDisplayName(),
      active: row?.n ?? 0,
    });
  } catch {
    return "Pond";
  }
}

export async function buildMenu(
  opts: TrayOptions,
  inflight: number,
): Promise<{ menu: Menu; ingesting: number }> {
  const [status, prefs] = await Promise.all([
    loadTrayStatus(inflight),
    getPrefs().catch(() => null),
  ]);
  const template = buildTrayTemplate(
    status,
    {
      onOpenDownloads: opts.onOpenDownloads,
      onOpenSettings: opts.onOpenSettings ?? opts.onOpenLibrary,
      onMenuAction: opts.onMenuAction,
    },
    {
      version: app.getVersion(),
      accelerators: await loadTrayAccelerators(prefs?.shortcuts),
      blankDocuments: loadTrayBlankDocuments(),
    },
  );
  return {
    menu: Menu.buildFromTemplate(template),
    ingesting: status.ingesting,
  };
}

async function loadTrayStatus(inflight: number): Promise<TrayStatusInput> {
  const db = await getDb().catch(() => null);
  const [activeRow] = db
    ? await db.select({ n: count() }).from(saves).where(isNull(saves.deletedAt))
    : [];
  const queue = db ? await readQueueSummary().catch(() => null) : null;
  return {
    libraryName: await libraryDisplayName(),
    active: Number(activeRow?.n ?? 0),
    ingesting: queue?.actionable ?? 0,
    inflight: queue?.running ?? inflight,
  };
}

async function loadTrayAccelerators(
  shortcuts?: Awaited<ReturnType<typeof getPrefs>>["shortcuts"],
): Promise<TrayAccelerators> {
  const bindings = resolveShortcuts(
    shortcuts ?? { profile: "pond", overrides: {} },
  );
  return {
    newFolder: menuAccelerator(bindings["library.new-folder"]),
    newNote: menuAccelerator(bindings["library.new-note"]),
    newTag: menuAccelerator(bindings["library.new-tag"]),
    newTagGroup: menuAccelerator(bindings["library.new-tag-group"]),
    importFiles: menuAccelerator(bindings["library.import-files"]),
    importFolders: menuAccelerator(bindings["library.import-folders"]),
    importLinks: menuAccelerator(bindings["library.import-links"]),
    rescan: menuAccelerator(bindings["library.rescan"]),
    search: menuAccelerator(bindings["library.search"]),
    sources: menuAccelerator(bindings["nav.sources"]),
    downloads: menuAccelerator(bindings["nav.downloads"]),
    trash: menuAccelerator(bindings["nav.trash"]),
    settings: menuAccelerator(bindings["app.settings"]),
  };
}

function loadTrayBlankDocuments(): TrayBlankDocument[] {
  return listInstalledBlankDocuments().flatMap((kind) => {
    const label = blankDocumentDef(kind)?.label;
    return label ? [{ kind, label }] : [];
  });
}

async function libraryDisplayName(): Promise<string> {
  return (await readLibraryIdentity(libraryRoot())).name;
}
