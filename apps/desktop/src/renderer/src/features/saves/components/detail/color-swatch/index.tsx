import { IconCopy, IconMagnifier, IconPalette } from "@pond/icons";
import { Chip, Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { useEffect, useState } from "react";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { pool } from "@/features/saves/state/pool";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { colorCopyFormats } from "@/shared/lib/color";

const COPIED_HOLD_MS = 1200;

export function buildColorSwatchMenu(
  color: string,
  primary: boolean,
  setPrimary: (primary: boolean) => void,
  copyValue: (value: string) => void,
): Array<MenuItemSpec> {
  const formats = colorCopyFormats(color);
  if (!formats) {
    return [];
  }
  return [
    {
      label: "Find Similar Color Items",
      icon: <IconMagnifier />,
      keywords: "color similar",
      onClick: () => saveLibraryBridge.findSimilarColor(color),
    },
    {
      type: "checkbox",
      label: "Set Primary Color",
      icon: <IconPalette />,
      indicator: "check",
      checked: primary,
      onCheckedChange: setPrimary,
    },
    { type: "separator" },
    ...formats.primary.map((format) => ({
      label: `Copy ${format.label}`,
      icon: <IconCopy />,
      onClick: () => copyValue(format.value),
    })),
    { type: "separator" },
    ...formats.secondary.map((format) => ({
      label: `Copy ${format.label}`,
      icon: <IconCopy />,
      onClick: () => copyValue(format.value),
    })),
  ];
}

export function ColorSwatch({
  color,
  primaryColor,
  saveId,
}: {
  color: string;
  primaryColor: string | null;
  saveId: string;
}) {
  const [copied, setCopied] = useState(false);
  const primary = color.toLowerCase() === primaryColor?.toLowerCase();

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyValue = async (value: string): Promise<void> => {
    const written = await navigator.clipboard.writeText(value).then(
      () => true,
      () => false,
    );
    if (written) {
      setCopied(true);
    }
  };
  const setPrimary = async (checked: boolean): Promise<void> => {
    const next = checked ? color : null;
    const result = await window.pond.query("saves.setPrimaryColor", {
      id: saveId,
      color: next,
    });
    const save = pool.get(saveId);
    if (result.ok && save) {
      pool.upsert({ ...save, primaryColor: next });
    }
  };

  return (
    <SpecMenu
      buildItems={() =>
        buildColorSwatchMenu(
          color,
          primary,
          (checked) => void setPrimary(checked),
          (value) => void copyValue(value),
        )
      }
    >
      <Menu.Trigger
        icon
        size="xs"
        variant="ghost"
        rounding="full"
        title={color}
        aria-label={copied ? `Copied ${color}` : `Color ${color}`}
      >
        <Chip.Swatch color={color} selected={primary} />
      </Menu.Trigger>
    </SpecMenu>
  );
}
