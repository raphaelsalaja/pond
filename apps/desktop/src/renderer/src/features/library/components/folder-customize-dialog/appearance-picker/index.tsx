import { IconDots, IconMagnifier } from "@pond/icons";
import {
  Button,
  Chip,
  ColorField,
  Empty,
  Input,
  Popover,
  Tooltip,
} from "@pond/ui";
import { useState } from "react";
import { useFolderAppearanceRecents } from "@/features/library/state/folder-appearance";
import {
  FOLDER_ICONS,
  FOLDER_SWATCHES,
  type FolderIconId,
  type FolderIconOption,
  folderSwatchCss,
  searchFolderIcons,
} from "@/shared/lib/folder-icons";
import styles from "./styles.module.css";

interface AppearancePickerProps {
  icon: FolderIconId;
  color: string | null;
  disabled: boolean;
  onIconChange: (icon: FolderIconId) => void;
  onColorChange: (color: string | null) => void;
}

export function AppearancePicker({
  icon,
  color,
  disabled,
  onIconChange,
  onColorChange,
}: AppearancePickerProps) {
  return (
    <Popover.Root>
      <Tooltip label="Icon and Color">
        <Popover.Trigger
          render={
            <Button
              type="button"
              icon
              size="sm"
              variant="secondary"
              rounding="full"
              className={styles.edit}
              disabled={disabled}
            />
          }
          aria-label="Icon and Color"
        >
          <IconDots size={12} />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={8}>
          <Popover.Popup className={styles.picker} aria-label="Icon and Color">
            <IconChoices icon={icon} onIconChange={onIconChange} />
            <ColorChoices color={color} onColorChange={onColorChange} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function IconChoice({
  option,
  selected,
  onSelect,
}: {
  option: FolderIconOption;
  selected: boolean;
  onSelect: (icon: FolderIconId) => void;
}) {
  return (
    <Tooltip label={option.label}>
      <Button
        type="button"
        icon
        size="md"
        variant={selected ? "tertiary" : "ghost"}
        aria-label={option.label}
        aria-pressed={selected}
        onClick={() => onSelect(option.id)}
      >
        <option.Icon />
      </Button>
    </Tooltip>
  );
}

function iconOptions(ids: readonly FolderIconId[]): FolderIconOption[] {
  return ids.flatMap((id) => FOLDER_ICONS.find((icon) => icon.id === id) ?? []);
}

function IconChoices({
  icon,
  onIconChange,
}: {
  icon: FolderIconId;
  onIconChange: (icon: FolderIconId) => void;
}) {
  const [query, setQuery] = useState("");
  const { recentIcons } = useFolderAppearanceRecents();
  const results = searchFolderIcons(query);
  const recent = query ? [] : iconOptions(recentIcons);

  return (
    <>
      <Input.Root size="sm" className={styles.search}>
        <Input.Icon>
          <IconMagnifier size={12} />
        </Input.Icon>
        <Input.Field
          aria-label="Search Icons"
          placeholder="Search icons…"
          spellCheck={false}
          autoComplete="off"
          value={query}
          onValueChange={setQuery}
          onKeyDown={(event) => {
            const first = results[0];
            if (event.key !== "Enter" || !query || !first) return;
            event.preventDefault();
            onIconChange(first.id);
          }}
        />
      </Input.Root>
      <div className={styles.icons} data-scroll-fade="vertical">
        {recent.length ? (
          <section className={styles.section} aria-label="Recently Used Icons">
            <h3 className={styles.label}>Recently Used</h3>
            <div className={styles.grid}>
              {recent.map((option) => (
                <IconChoice
                  key={option.id}
                  option={option}
                  selected={icon === option.id}
                  onSelect={onIconChange}
                />
              ))}
            </div>
          </section>
        ) : null}
        {results.length ? (
          <section className={styles.section} aria-label="Icons">
            {recent.length ? <h3 className={styles.label}>All Icons</h3> : null}
            <div className={styles.grid}>
              {results.map((option) => (
                <IconChoice
                  key={option.id}
                  option={option}
                  selected={icon === option.id}
                  onSelect={onIconChange}
                />
              ))}
            </div>
          </section>
        ) : (
          <Empty.Root role="status" className={styles.empty}>
            <Empty.Title>No results found</Empty.Title>
            <Empty.Description>Try another word.</Empty.Description>
          </Empty.Root>
        )}
      </div>
    </>
  );
}

function colorLabel(color: string): string {
  const swatch = FOLDER_SWATCHES.find((entry) => entry.id === color);
  return swatch?.label ?? color.toUpperCase();
}

function ColorChoice({
  color,
  label,
  selected,
  onSelect,
}: {
  color: string | null;
  label: string;
  selected: boolean;
  onSelect: (color: string | null) => void;
}) {
  return (
    <Tooltip label={label}>
      <Button
        type="button"
        icon
        size="md"
        variant="ghost"
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onSelect(color)}
      >
        <Chip.Swatch
          color={folderSwatchCss(color) ?? FOLDER_SWATCHES[0].css}
          selected={selected}
        />
      </Button>
    </Tooltip>
  );
}

function ColorChoices({
  color,
  onColorChange,
}: {
  color: string | null;
  onColorChange: (color: string | null) => void;
}) {
  const { recentColors } = useFolderAppearanceRecents();
  const custom = color?.startsWith("#") ? color : "";

  return (
    <div className={styles.colors}>
      <div className={styles.swatches}>
        {FOLDER_SWATCHES.map((swatch) => (
          <ColorChoice
            key={swatch.label}
            color={swatch.id}
            label={swatch.label}
            selected={color === swatch.id}
            onSelect={onColorChange}
          />
        ))}
      </div>
      {recentColors.length ? (
        <section className={styles.section} aria-label="Recently Used Colors">
          <h3 className={styles.label}>Recently Used</h3>
          <div className={styles.recent}>
            {recentColors.map((recent) => (
              <ColorChoice
                key={recent}
                color={recent}
                label={colorLabel(recent)}
                selected={color === recent}
                onSelect={onColorChange}
              />
            ))}
          </div>
        </section>
      ) : null}
      <div className={styles.custom}>
        <span className={styles.label}>Custom</span>
        <ColorField.Root
          aria-label="Custom Color"
          value={custom}
          onChange={onColorChange}
        />
      </div>
    </div>
  );
}
