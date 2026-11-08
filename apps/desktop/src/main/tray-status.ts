import { SOURCES } from "@pond/schema/source-ids";
import { EXTERNAL_SOURCE_IDS, sourceLabel } from "@pond/schema/sources";
import { isWatchableSource, watchSourceLabel } from "@pond/schema/watches";
import type { BlankDocumentKind } from "../shared/blank-documents";
import type { MenuActionId } from "../shared/constants";
import {
  FILE_MENU_AUTO_IMPORT_LABELS,
  FILE_MENU_DUPLICATES_LABELS,
  FILE_MENU_IMPORT_LABELS,
  FILE_MENU_NEW_LABELS,
} from "./file-menu";

export interface TrayStatusInput {
  libraryName: string;
  active: number;
  ingesting: number;
  inflight: number;
}

interface TrayTemplateItem {
  label?: string;
  type?: "separator";
  enabled?: boolean;
  accelerator?: string;
  registerAccelerator?: boolean;
  role?: "quit";
  click?: () => void;
  submenu?: TrayTemplateItem[];
}

export interface TrayTemplateActions {
  onOpenDownloads?: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onMenuAction: (id: MenuActionId) => void | Promise<void>;
}

export interface TrayAccelerators {
  newFolder?: string;
  newNote?: string;
  newTag?: string;
  newTagGroup?: string;
  importFiles?: string;
  importFolders?: string;
  importLinks?: string;
  rescan?: string;
  search?: string;
  sources?: string;
  downloads?: string;
  trash?: string;
  settings?: string;
}

export interface TrayBlankDocument {
  kind: BlankDocumentKind;
  label: string;
}

export function trayHeaderLabel(
  input: Pick<TrayStatusInput, "libraryName" | "active">,
): string {
  return `${input.libraryName} · ${input.active} saves`;
}

export function traySavingLabel(
  input: Pick<TrayStatusInput, "ingesting" | "inflight">,
): string | null {
  const { ingesting, inflight } = input;
  if (ingesting <= 0) return null;
  if (inflight <= 0) {
    return ingesting === 1
      ? "Waiting to save 1 item"
      : `Waiting to save ${ingesting} items`;
  }
  if (inflight >= ingesting) {
    return ingesting === 1 ? "Saving 1 item" : `Saving ${ingesting} items`;
  }
  return `Saving ${inflight} of ${ingesting} items`;
}

export function trayBadge(input: Pick<TrayStatusInput, "inflight">): string {
  return input.inflight > 0 ? String(input.inflight) : "";
}

export function trayVersionLabel(version: string): string {
  return `Pond v${version}`;
}

export function buildTrayTemplate(
  status: TrayStatusInput,
  actions: TrayTemplateActions,
  options: {
    version: string;
    accelerators?: TrayAccelerators;
    blankDocuments?: readonly TrayBlankDocument[];
  },
): TrayTemplateItem[] {
  const accelerators = options.accelerators ?? {};
  const run = (
    label: string,
    id: MenuActionId,
    accelerator?: string,
  ): TrayTemplateItem => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => void actions.onMenuAction(id),
  });

  const template: TrayTemplateItem[] = [
    {
      label: trayHeaderLabel(status),
      enabled: false,
    },
  ];

  const saving = traySavingLabel(status);
  if (saving) {
    template.push({
      label: saving,
      click: () => void actions.onOpenDownloads?.(),
    });
  }

  template.push(
    { type: "separator" },
    {
      label: "New",
      submenu: [
        run(
          FILE_MENU_NEW_LABELS[0],
          "library.new-folder",
          accelerators.newFolder,
        ),
        run(FILE_MENU_NEW_LABELS[1], "library.new-smart-folder"),
        run(FILE_MENU_NEW_LABELS[2], "library.new-smart-folder-group"),
        { type: "separator" },
        run(FILE_MENU_NEW_LABELS[4], "library.new-note", accelerators.newNote),
        ...(options.blankDocuments ?? []).map((doc) =>
          run(doc.label, `library.new-blank-${doc.kind}`),
        ),
        { type: "separator" },
        run("New Tag", "library.new-tag", accelerators.newTag),
        run("New Tag Group", "library.new-tag-group", accelerators.newTagGroup),
      ],
    },
    {
      label: "Import",
      submenu: [
        run(
          FILE_MENU_IMPORT_LABELS[0],
          "library.import-files",
          accelerators.importFiles,
        ),
        run(
          FILE_MENU_IMPORT_LABELS[1],
          "library.import-folders",
          accelerators.importFolders,
        ),
        run(
          FILE_MENU_IMPORT_LABELS[2],
          "library.import-links",
          accelerators.importLinks,
        ),
        run("Download Video or Audio", "library.download"),
        run("Import from Clipboard", "library.import-clipboard"),
        { type: "separator" },
        run("Import Bookmarks", "library.import-bookmarks"),
        run("Import mymind", "library.import-mymind"),
        run("Import Data Export", "library.import-data-export"),
        run("Import Page Assets", "library.import-page-assets"),
        { type: "separator" },
        run(FILE_MENU_IMPORT_LABELS[3], "library.import-eagle"),
        run(FILE_MENU_IMPORT_LABELS[4], "library.import-package"),
        { type: "separator" },
        {
          label: "Auto Import",
          submenu: [
            run(FILE_MENU_AUTO_IMPORT_LABELS[0], "library.auto-import-folder"),
          ],
        },
      ],
    },
    {
      label: "Sources",
      submenu: [
        {
          label: "New Source",
          submenu: EXTERNAL_SOURCE_IDS.map((source) =>
            run(sourceLabel(source), `library.connect-${source}`),
          ),
        },
        {
          label: "New Watch",
          submenu: SOURCES.filter(isWatchableSource).map((source) =>
            run(watchSourceLabel(source), `library.watch-${source}`),
          ),
        },
      ],
    },
    {
      label: "Library",
      submenu: [
        {
          label: "Find Duplicates",
          submenu: [
            run(FILE_MENU_DUPLICATES_LABELS[0], "library.find-duplicates-all"),
            run(FILE_MENU_DUPLICATES_LABELS[1], "library.find-duplicates-list"),
            run(
              FILE_MENU_DUPLICATES_LABELS[2],
              "library.find-duplicates-selected",
            ),
          ],
        },
        { type: "separator" },
        run("Rescan Library", "library.rescan", accelerators.rescan),
        run("Verify Integrity", "library.verify-integrity"),
      ],
    },
    {
      label: "Navigate",
      submenu: [
        run("Library", "nav.library"),
        run("Search", "library.search", accelerators.search),
        run("Sources", "nav.sources", accelerators.sources),
        run("Downloads", "nav.downloads", accelerators.downloads),
        run("Tags", "nav.tags"),
        run("Fish", "nav.agent"),
        { type: "separator" },
        run("Trash", "nav.trash", accelerators.trash),
        run("Uncategorized", "nav.uncategorized"),
        run("Untagged", "nav.untagged"),
        { type: "separator" },
        {
          label: "Settings",
          accelerator: accelerators.settings,
          registerAccelerator: false,
          click: () => void actions.onOpenSettings(),
        },
      ],
    },
    { type: "separator" },
    {
      label: "Quit",
      accelerator: "CommandOrControl+Q",
      role: "quit",
    },
    { type: "separator" },
    { label: trayVersionLabel(options.version), enabled: false },
  );

  return template;
}
