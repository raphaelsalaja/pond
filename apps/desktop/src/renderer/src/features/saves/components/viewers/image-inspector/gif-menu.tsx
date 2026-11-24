import type { MenuItemSpec } from "@pond/ui";
import type { ReactElement } from "react";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";

export function buildGifMenuItems({
  hasLoop,
  onResetLoop,
  onSetThumbnail,
}: {
  hasLoop: boolean;
  onResetLoop: () => void;
  onSetThumbnail: () => void;
}): Array<MenuItemSpec> {
  return [
    {
      label: "Set Current Frame as Thumbnail",
      onClick: onSetThumbnail,
    },
    {
      label: "Reset Loop Range",
      disabled: !hasLoop,
      onClick: onResetLoop,
    },
  ];
}

export function GifContextMenu({
  children,
  hasLoop,
  onResetLoop,
  onSetThumbnail,
}: {
  children: ReactElement;
  hasLoop: boolean;
  onResetLoop: () => void;
  onSetThumbnail: () => void;
}) {
  return (
    <SpecContextMenu
      buildItems={() =>
        buildGifMenuItems({ hasLoop, onResetLoop, onSetThumbnail })
      }
    >
      {children}
    </SpecContextMenu>
  );
}
