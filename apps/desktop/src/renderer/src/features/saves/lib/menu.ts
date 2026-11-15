import {
  IconDots,
  IconFileExport,
  IconImagePlus,
  IconMagnifier,
  IconMediaPlay,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import type { Save } from "@/features/saves/types";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import {
  buildReverseSearchItems,
  buildSupplementalItems,
} from "./menu/advanced";
import { buildAgentItems } from "./menu/agent";
import { createSaveMenuContext } from "./menu/context";
import { buildCopyItems } from "./menu/copy";
import { buildDetailItems, buildViewerDisplayItems } from "./menu/details";
import { buildExportItems, buildExportPopupItems } from "./menu/export";
import { buildInboxItems } from "./menu/inbox";
import { buildOpenItems } from "./menu/open";
import { buildOrganizeItems } from "./menu/organize";
import { sensitiveContentMenuItem } from "./menu/sensitive";
import { buildShareItem } from "./menu/share";
import { glyph, submenuHidden } from "./menu/shared";
import { buildTrashItems } from "./menu/trash";
import type { BuildSaveMenuOptions } from "./menu/types";

export {
  loadOpenWithApps,
  type OpenWithApp,
  openWithKind,
  peekOpenWithApps,
} from "@/features/saves/lib/open-with-menu";
export { contextMenuSaves } from "./menu/context";

export function buildSaveMenu(
  saveOrSaves: Save | readonly Save[],
  options: BuildSaveMenuOptions,
): MenuItemSpec[] {
  const context = createSaveMenuContext(saveOrSaves, options);
  if (!context) return [];

  const openItems = buildOpenItems(context);
  const organizeItems = buildOrganizeItems(context);
  const copyItems = buildCopyItems(context);
  const exportItems = buildExportItems(context);
  const reverseSearchItems = buildReverseSearchItems(context);
  const { agent: agentItems, maintenance: maintenanceItems } =
    buildAgentItems(context);
  const supplementalItems = buildSupplementalItems(context, maintenanceItems);
  const viewerDisplayItems = buildViewerDisplayItems(context);

  return [
    ...openItems,
    ...supplementalItems.file,
    { type: "separator" },
    ...buildInboxItems(context),
    ...organizeItems.destinations,
    {
      type: "submenu",
      label: "Export",
      icon: glyph(IconFileExport),
      hidden: submenuHidden(exportItems),
      items: exportItems,
    },
    buildShareItem(context),
    { type: "separator" },
    ...organizeItems.editing,
    ...supplementalItems.organization,
    ...copyItems,
    ...supplementalItems.copy,
    { type: "separator" },
    {
      type: "submenu",
      label: "Thumbnail",
      icon: glyph(IconImagePlus),
      hidden: submenuHidden(supplementalItems.details.thumbnail),
      items: supplementalItems.details.thumbnail,
    },
    ...supplementalItems.details.media,
    sensitiveContentMenuItem(context),
    ...viewerDisplayItems,
    ...supplementalItems.details.source,
    {
      type: "submenu",
      label: "Search by Image",
      icon: glyph(IconMagnifier),
      hidden: submenuHidden(reverseSearchItems),
      items: reverseSearchItems,
    },
    {
      type: "submenu",
      label: "Fish",
      icon: glyph(IconMediaPlay),
      hidden: context.allTrashed || submenuHidden(agentItems),
      items: agentItems,
    },
    {
      type: "submenu",
      label: "More",
      icon: glyph(IconDots),
      hidden: submenuHidden(supplementalItems.more),
      items: supplementalItems.more,
    },
    { type: "separator" },
    ...buildTrashItems(context),
  ];
}

function itemWithLabel(
  items: MenuItemSpec[],
  label: string,
): MenuItemSpec | null {
  return items.find((item) => "label" in item && item.label === label) ?? null;
}

function detailOpenItems(
  items: MenuItemSpec[],
  defaultAppPath: string | null,
): MenuItemSpec[] {
  const openInNewWindow = itemWithLabel(items, "Open in New Window");
  const openWithDefault = itemWithLabel(items, "Open with Default App");
  const openWith = itemWithLabel(items, "Open With");
  const reveal = itemWithLabel(items, REVEAL_LABEL);

  const combinedOpenWith: MenuItemSpec | null =
    openWith?.type === "submenu" &&
    openWithDefault !== null &&
    "label" in openWithDefault
      ? {
          ...openWith,
          hidden:
            "hidden" in openWithDefault && Boolean(openWithDefault.hidden),
          items: [
            { ...openWithDefault, label: "Default App" },
            ...openWith.items.filter(
              (item) => !("id" in item && item.id === defaultAppPath),
            ),
          ],
        }
      : null;

  return [openInNewWindow, combinedOpenWith, reveal].filter(
    (item): item is MenuItemSpec => item !== null && item !== undefined,
  );
}

function replaceSubmenusWithGroups(items: MenuItemSpec[]): MenuItemSpec[] {
  return items.map((item) => {
    if (item.type === "submenu") {
      return {
        type: "group",
        hidden: item.hidden,
        keywords: item.keywords,
        items: replaceSubmenusWithGroups(item.items),
      };
    }
    if (item.type === "group") {
      return { ...item, items: replaceSubmenusWithGroups(item.items) };
    }
    return item;
  });
}

export function buildSaveDetailMenu(
  save: Save,
  options: BuildSaveMenuOptions,
): MenuItemSpec[] {
  const context = createSaveMenuContext(save, options);
  if (!context) return [];

  const openItems = buildOpenItems(context);
  const copyItems = buildCopyItems(context);
  const replaceFile = itemWithLabel(
    buildDetailItems(context).file,
    "Replace File",
  );
  const defaultAppPath =
    context.openWithApps.find((app) => app.isDefault)?.path ?? null;
  const copyPrimary = copyItems.find(
    (item) => "id" in item && item.id === "copy-primary",
  );

  return [
    ...detailOpenItems(openItems, defaultAppPath),
    { type: "separator" },
    replaceFile,
    {
      label: "Export",
      icon: glyph(IconFileExport),
      onClick: () =>
        saveLibraryBridge.openConversion(
          context.ids,
          context.fileIndex ?? 0,
          "files",
        ),
    },
    buildShareItem(context),
    { type: "separator" },
    {
      type: "submenu",
      label: "Copy",
      icon: copyPrimary && "icon" in copyPrimary ? copyPrimary.icon : undefined,
      hidden: submenuHidden(copyItems),
      items: replaceSubmenusWithGroups(copyItems),
    },
    sensitiveContentMenuItem(context),
    { type: "separator" },
    ...buildTrashItems(context),
  ].filter((item): item is MenuItemSpec => item !== null);
}

export function buildSaveExportPopup(
  saveOrSaves: Save | readonly Save[],
  options: BuildSaveMenuOptions,
): MenuItemSpec[] {
  const context = createSaveMenuContext(saveOrSaves, options);
  return context ? buildExportPopupItems(context) : [];
}
