import { IconMinus, IconPlus } from "@pond/icons";
import { Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { SpecMenu } from "@/shared/components/spec-context-menu";

export const ZOOM_RATIOS = [5, 10, 25, 50, 100, 200, 400, 800] as const;

export function buildZoomRatioItems(
  actual: number,
  onRatio: (ratio: number) => void,
): Array<MenuItemSpec> {
  return ZOOM_RATIOS.map((percent) => ({
    type: "checkbox",
    label: `${percent}%`,
    indicator: "check",
    checked: Math.round(actual * 100) === percent,
    onCheckedChange: (checked) => {
      if (checked) {
        onRatio(percent / 100);
      }
    },
  }));
}

export function ZoomPill({
  actual,
  onOut,
  onIn,
  onRatio,
}: {
  actual: number;
  onOut: () => void;
  onIn: () => void;
  onRatio: (ratio: number) => void;
}) {
  return (
    <ViewerHud.Tools tooltipSide="bottom" role="group" aria-label="Zoom">
      <ViewerHud.Tool label="Zoom Out" onClick={onOut}>
        <IconMinus />
      </ViewerHud.Tool>
      <SpecMenu
        align="center"
        buildItems={() => buildZoomRatioItems(actual, onRatio)}
      >
        <Menu.Trigger
          size="sm"
          variant="ghost"
          rounding="full"
          aria-label="Zoom Ratio"
        >
          {Math.round(actual * 100)}%
        </Menu.Trigger>
      </SpecMenu>
      <ViewerHud.Tool label="Zoom In" onClick={onIn}>
        <IconPlus />
      </ViewerHud.Tool>
    </ViewerHud.Tools>
  );
}
