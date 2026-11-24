import { IconEye, IconFolderOpen, IconUserPlus } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { watchSourceLabel } from "@pond/schema/watches";
import type { MenuItemSpec } from "@pond/ui";
import type { ReactNode } from "react";
import { BrandTile } from "@/features/sources/components/sync-monitor-source-tile";
import { getSourceDef } from "@/features/sources/lib/registry";
import { CONNECTABLE, WATCH_MENU_SOURCES } from "./create";

function sourceMenuIcon(source: Source): ReactNode {
  return <BrandTile source={source} size={16} />;
}

export function connectableSourceItems(
  onPick: (source: Source) => void,
): Array<MenuItemSpec> {
  return CONNECTABLE.map((source) => {
    const label = getSourceDef(source).label;
    return {
      id: `connect-${source}`,
      label,
      icon: sourceMenuIcon(source),
      keywords: `new source connect ${label}`,
      onClick: () => onPick(source),
    };
  });
}

export function watchableSourceItems(
  onPick: (source: Source) => void,
): Array<MenuItemSpec> {
  return WATCH_MENU_SOURCES.map((source) => {
    const label = watchSourceLabel(source);
    return {
      id: `watch-${source}`,
      label,
      icon: sourceMenuIcon(source),
      keywords: `new watch feed account ${label}`,
      onClick: () => onPick(source),
    };
  });
}

export function buildSourceNewMenuItems(handlers: {
  onConnect: (source: Source) => void;
  onWatch: (source: Source) => void;
  onFolder: () => void;
}): Array<MenuItemSpec> {
  return [
    {
      type: "submenu",
      id: "new-source",
      label: "New Source",
      icon: <IconUserPlus />,
      keywords: "connect account sync",
      items: connectableSourceItems(handlers.onConnect),
    },
    {
      type: "submenu",
      id: "new-watch",
      label: "New Watch",
      icon: <IconEye />,
      keywords: "public account follow",
      items: watchableSourceItems(handlers.onWatch),
    },
    {
      id: "new-folder",
      label: "New Folder",
      icon: <IconFolderOpen />,
      keywords: "watched folder auto import directory",
      onClick: handlers.onFolder,
    },
  ];
}
