import {
  IconArchiveDownload,
  IconArrowRotateClockwise,
  IconBulletList,
  IconCheckboxChecked,
  IconCopy,
  IconDownload,
  IconEye,
  IconFile,
  IconFileAlert,
  IconFileSettings,
  IconFiles2,
  IconFolder,
  IconFolderImport,
  IconFolderOpen,
  IconFolderRefresh,
  IconFolderSearch,
  IconGlobe,
  IconImage,
  IconImageSparkle,
  IconLink2,
  IconNotepad,
  IconRename,
  IconReportFile,
  IconScan,
  IconSettingsWrench,
  IconShieldCheck,
  IconTags,
  IconUserPlus,
  IconVersions,
} from "@pond/icons";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import {
  BLANK_DOCUMENTS,
  type BlankDocumentIcons,
  type BlankDocumentKind,
} from "@shared/blank-documents";
import { downloadDialog } from "@/features/downloads";
import { newMenuDialog } from "@/features/library/state/new-menu-dialog";
import {
  connectableSourceItems,
  pickWatchedFolder,
  watchableSourceItems,
} from "@/features/sources";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import {
  createBlankDocument,
  createNote,
  exportDebugReport,
  findDuplicates,
  importBookmarks,
  importClipboard,
  importDataExport,
  importEagle,
  importEaglePackage,
  importLegacyLibrary,
  importMymind,
  importPageAssets,
  importPaths,
  importPondPackage,
  newFolder,
  newSmartFolder,
  newSource,
  newTag,
  rescanLibrary,
  reviewOrganization,
  runNewAction,
  verifyIntegrity,
} from "./actions";

const DOCUMENT_LOGO_STYLE = { width: 22, height: 22 } as const;

export function buildNewMenuItems(
  installedDocuments: readonly BlankDocumentKind[] = [],
  documentIcons: BlankDocumentIcons = {},
): MenuItemSpec[] {
  const installed = new Set(installedDocuments);
  const documents: MenuItemSpec[] = [
    {
      id: "note",
      label: "New Note",
      icon: <IconNotepad />,
      keywords: "text document write markdown",
      shortcut: shortcutGlyphs("library.new-note"),
      onClick: () => void runNewAction(createNote),
    },
    ...BLANK_DOCUMENTS.filter((item) => installed.has(item.kind)).map(
      (item) => ({
        id: item.kind,
        label: item.label,
        icon: documentIcons[item.kind] ? (
          <img
            src={documentIcons[item.kind]}
            alt=""
            style={DOCUMENT_LOGO_STYLE}
          />
        ) : (
          <IconFile />
        ),
        keywords: `${item.label} document blank template`,
        onClick: () => void runNewAction(() => createBlankDocument(item.kind)),
      }),
    ),
  ];

  return [
    {
      type: "submenu",
      id: "new",
      label: "New",
      icon: <IconFolder />,
      keywords: "create folder tag document",
      items: [
        {
          id: "folder",
          label: "New Folder",
          icon: <IconFolder />,
          keywords: "organize directory",
          shortcut: shortcutGlyphs("library.new-folder"),
          onClick: () => newFolder(),
        },
        {
          id: "smart-folder",
          label: "New Smart Folder",
          icon: <IconFolderSearch />,
          keywords: "filter rules saved view",
          onClick: () => newSmartFolder(),
        },
        {
          id: "watched-folder",
          label: "New Watched Folder",
          icon: <IconFolderRefresh />,
          keywords: "auto import directory local files copy",
          onClick: () => void runNewAction(pickWatchedFolder),
        },
        {
          id: "tag",
          label: "New Tag",
          icon: <IconTags />,
          keywords: "label organize",
          shortcut: shortcutGlyphs("library.new-tag"),
          onClick: () => newTag("tag"),
        },
        {
          id: "tag-group",
          label: "New Tag Group",
          icon: <IconVersions />,
          keywords: "labels organize",
          shortcut: shortcutGlyphs("library.new-tag-group"),
          onClick: () => newTag("tag-group"),
        },
        ...documents,
      ],
    },
    {
      type: "submenu",
      id: "import",
      label: "Import",
      icon: <IconDownload />,
      keywords: "files folders links clipboard bookmarks packages library",
      items: [
        {
          id: "files",
          label: "Import Files",
          icon: <IconFile />,
          keywords: "from image video audio pdf font document text file media",
          shortcut: shortcutGlyphs("library.import-files"),
          onClick: () => void runNewAction(() => importPaths("files")),
        },
        {
          id: "folders",
          label: "Import Folders",
          icon: <IconFolderOpen />,
          keywords: "from directory media",
          shortcut: shortcutGlyphs("library.import-folders"),
          onClick: () => void runNewAction(() => importPaths("folders")),
        },
        {
          id: "links",
          label: "Import from Links",
          icon: <IconLink2 />,
          keywords: "url website bookmark save",
          shortcut: shortcutGlyphs("library.import-links"),
          onClick: () => newMenuDialog.open({ kind: "links" }),
        },
        {
          id: "download",
          label: "Download Video or Audio",
          icon: <IconArchiveDownload />,
          keywords: "youtube yt-dlp clip trim mp3 m4a transcript playlist",
          shortcut: shortcutGlyphs("library.download"),
          onClick: () => downloadDialog.open(),
        },
        {
          id: "clipboard",
          label: "Import from Clipboard",
          icon: <IconCopy />,
          keywords: "paste image files",
          onClick: () => void runNewAction(importClipboard),
        },
        {
          id: "bookmarks",
          label: "Import Bookmarks",
          icon: <IconGlobe />,
          keywords: "netscape chrome safari html bookmark file",
          onClick: () => void runNewAction(importBookmarks),
        },
        {
          id: "mymind",
          label: "Import mymind",
          icon: <IconFolderImport />,
          keywords: "mymind cards csv export migrate",
          onClick: () => void runNewAction(importMymind),
        },
        {
          id: "data-export",
          label: "Import Data Export",
          icon: <IconFolderImport />,
          keywords:
            "archive takeout zip twitter x instagram tiktok youtube reddit likes migrate",
          onClick: () => void runNewAction(importDataExport),
        },
        {
          id: "page-assets",
          label: "Import Page Assets",
          icon: <IconImageSparkle />,
          keywords: "extract images website scrape batch",
          onClick: () => {
            Dialog.prompt({
              title: "Import Page Assets",
              description:
                "Pond saves the images and files from the page you enter.",
              confirmLabel: "Import",
              placeholder: "https://",
              emptyError: "Enter a page link to import.",
              onConfirm: (url) =>
                void runNewAction(() => importPageAssets(url)),
            });
          },
        },
        {
          id: "eagle-package",
          label: "Import Eagle Package",
          icon: <IconArchiveDownload />,
          keywords: "eagle archive package migrate",
          onClick: () => void runNewAction(importEaglePackage),
        },
        {
          id: "pond-package",
          label: "Import Pond Package",
          icon: <IconArchiveDownload />,
          keywords: "archive package migrate",
          onClick: () => void runNewAction(importPondPackage),
        },
        {
          id: "eagle",
          label: "Import Eagle Library",
          icon: <IconDownload />,
          keywords: "migrate archive package",
          onClick: () => void runNewAction(importEagle),
        },
        {
          type: "submenu",
          id: "legacy-library",
          label: "Import Legacy Library",
          icon: <IconFolderImport />,
          keywords: "artstation huaban pixave inboard migrate export",
          items: (["ArtStation", "Huaban", "Pixave", "Inboard"] as const).map(
            (source) => ({
              id: `legacy-${source.toLowerCase()}`,
              label: `Import ${source} Export`,
              icon: <IconFolderImport />,
              onClick: () =>
                void runNewAction(() => importLegacyLibrary(source)),
            }),
          ),
        },
      ],
    },
    {
      type: "submenu",
      id: "sources",
      label: "Sources",
      icon: <IconUserPlus />,
      keywords: "connect watch accounts",
      items: [
        {
          type: "submenu",
          id: "connect",
          label: "New Source",
          icon: <IconUserPlus />,
          keywords: "new account sync auto import connect",
          items: connectableSourceItems((source) =>
            newSource("connect", source),
          ),
        },
        {
          type: "submenu",
          id: "watch",
          label: "New Watch",
          icon: <IconEye />,
          keywords: "new source public auto import someone watch",
          items: watchableSourceItems((source) => newSource("watch", source)),
        },
      ],
    },
    {
      type: "submenu",
      id: "library",
      label: "Library",
      icon: <IconFiles2 />,
      keywords: "duplicates rescan verify repair diagnostics",
      items: [
        {
          type: "submenu",
          id: "find-duplicates",
          label: "Find Duplicates",
          icon: <IconFiles2 />,
          keywords: "scan similar exact",
          items: [
            {
              id: "duplicates-all",
              label: "Scan All",
              icon: <IconScan />,
              keywords: "library",
              onClick: () => findDuplicates("all"),
            },
            {
              id: "duplicates-list",
              label: "Current List",
              icon: <IconBulletList />,
              keywords: "folder view filter",
              onClick: () => findDuplicates("list"),
            },
            {
              id: "duplicates-selected",
              label: "Selected",
              icon: <IconCheckboxChecked />,
              keywords: "selection",
              onClick: () => findDuplicates("selected"),
            },
          ],
        },
        {
          type: "submenu",
          id: "review-organization",
          label: "Review Organization",
          icon: <IconFolderSearch />,
          keywords: "cluster classify labels folders related",
          items: [
            {
              id: "organization-all",
              label: "All Saves",
              icon: <IconFiles2 />,
              onClick: () => reviewOrganization("all"),
            },
            {
              id: "organization-list",
              label: "Current List",
              icon: <IconBulletList />,
              onClick: () => reviewOrganization("list"),
            },
            {
              id: "organization-selected",
              label: "Selected",
              icon: <IconCheckboxChecked />,
              onClick: () => reviewOrganization("selected"),
            },
          ],
        },
        {
          id: "rescan",
          label: "Rescan Library",
          icon: <IconArrowRotateClockwise />,
          keywords: "reconcile index files disk",
          shortcut: shortcutGlyphs("library.rescan"),
          onClick: () => void runNewAction(rescanLibrary),
        },
        {
          id: "verify",
          label: "Verify Integrity",
          icon: <IconShieldCheck />,
          keywords: "check missing orphan files disk",
          onClick: () => void runNewAction(verifyIntegrity),
        },
        {
          type: "submenu",
          id: "repair-library",
          label: "Repair Library",
          icon: <IconSettingsWrench />,
          keywords: "fix maintenance metadata filenames thumbnails content",
          items: [
            {
              id: "repair-thumbnails",
              label: "Repair Thumbnails",
              icon: <IconImage />,
              onClick: () =>
                newMenuDialog.open({
                  kind: "repair",
                  repair: "thumbnails",
                }),
            },
            {
              id: "repair-physical-file-names",
              label: "Repair Physical File Names",
              icon: <IconRename />,
              onClick: () =>
                newMenuDialog.open({
                  kind: "repair",
                  repair: "physical-file-names",
                }),
            },
            {
              id: "repair-invalid-content",
              label: "Repair Invalid Content",
              icon: <IconFileAlert />,
              onClick: () =>
                newMenuDialog.open({
                  kind: "repair",
                  repair: "invalid-content",
                }),
            },
            {
              id: "repair-save-metadata",
              label: "Repair Save Metadata",
              icon: <IconFileSettings />,
              onClick: () =>
                newMenuDialog.open({
                  kind: "repair",
                  repair: "save-metadata",
                }),
            },
          ],
        },
        {
          id: "debug-report",
          label: "Export Debug Report",
          icon: <IconReportFile />,
          keywords: "diagnostics support privacy redacted",
          onClick: () => void runNewAction(exportDebugReport),
        },
      ],
    },
  ];
}
