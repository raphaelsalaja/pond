import { IconBarsFilter, IconMerge, IconPencil, IconTrash } from "@pond/icons";
import { Button, Chip } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { FOLDER_SWATCHES } from "@/shared/lib/folder-icons";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

export interface TagGroupMenuActions {
  color: string | null;
  tagCount: number;
  onFilter: () => void;
  onRename: () => void;
  onChangeColor: (color: string | null) => void;
  mergeTargets: Array<string>;
  onMerge: (group: string) => void;
  onRequestDelete: () => void;
}

function ColorSwatches({
  color,
  onChange,
}: {
  color: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <fieldset className={styles.palette} aria-label="Group Color">
      {FOLDER_SWATCHES.map((swatch) => (
        <Button
          key={swatch.label}
          type="button"
          icon
          size="xs"
          variant="ghost"
          aria-label={swatch.label}
          aria-pressed={swatch.id === color}
          onClick={() => onChange(swatch.id)}
        >
          <Chip.Swatch color={swatch.css} selected={swatch.id === color} />
        </Button>
      ))}
    </fieldset>
  );
}

export function buildTagGroupMenuItems(
  a: TagGroupMenuActions,
): Array<MenuItemSpec> {
  return [
    {
      label: "Filter Items with the Tag(s)",
      icon: <IconBarsFilter />,
      disabled: a.tagCount === 0,
      onClick: a.onFilter,
    },
    { type: "separator" },
    {
      label: "Rename",
      icon: <IconPencil />,
      shortcut: shortcutGlyphs("tags.rename"),
      onClick: a.onRename,
    },
    {
      type: "submenu",
      label: "Merge Into",
      icon: <IconMerge />,
      disabled: a.mergeTargets.length === 0,
      items: a.mergeTargets.map((group) => ({
        label: group,
        onClick: () => a.onMerge(group),
      })),
    },
    {
      type: "custom",
      render: () => (
        <ColorSwatches color={a.color} onChange={a.onChangeColor} />
      ),
    },
    { type: "separator" },
    {
      label: "Remove",
      icon: <IconTrash />,
      variant: "destructive",
      onClick: a.onRequestDelete,
    },
  ];
}
