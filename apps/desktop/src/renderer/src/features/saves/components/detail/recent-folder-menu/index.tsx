import { Button, Keyboard, PickerPanel } from "@pond/ui";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useState,
} from "react";
import { FolderIcon, folderColorCss } from "@/shared/lib/folder-icons";
import type { FolderMenuItem } from "../folder-menu";
import styles from "./styles.module.css";

/** Digit keys 1 through 9 each pick one destination, so the list stops there. */
const RECENT_FOLDER_LIMIT = 9;

interface RecentFolderMenuProps {
  folders: readonly FolderMenuItem[];
  selectionSize: number;
  onPick(folder: FolderMenuItem): void;
  onShowAll(): void;
}

function iconStyle(
  color: string | null | undefined,
): CSSProperties | undefined {
  const css = folderColorCss(color);
  return css ? { color: css } : undefined;
}

export function RecentFolderMenu({
  folders,
  selectionSize,
  onPick,
  onShowAll,
}: RecentFolderMenuProps) {
  const listId = useId();
  const shown = folders.slice(0, RECENT_FOLDER_LIMIT);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, shown.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;
  const activeOption = shown.length ? optionId(activeIndex) : undefined;

  useEffect(() => {
    document.getElementById(listId)?.focus();
  }, [listId]);

  function pick(folder: FolderMenuItem | undefined) {
    if (folder && folder.count !== selectionSize) onPick(folder);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : null;
    if (digit !== null) {
      event.preventDefault();
      event.stopPropagation();
      pick(shown[digit - 1]);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!shown.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + shown.length) % shown.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      pick(shown[activeIndex]);
      return;
    }
    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
  }

  return (
    <PickerPanel.Surface className={styles.root}>
      <PickerPanel.Header className={styles.header}>
        <span className={styles.title}>Add to Recent Folder</span>
      </PickerPanel.Header>
      <PickerPanel.Collection
        id={listId}
        className={styles.list}
        role="listbox"
        aria-label="Recent Folders"
        aria-activedescendant={activeOption}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {shown.map((folder, index) => {
          const added = folder.count === selectionSize;
          return (
            <PickerPanel.Item
              key={folder.id}
              id={optionId(index)}
              active={index === activeIndex}
              aria-selected={index === activeIndex}
              aria-disabled={added || undefined}
              aria-description={added ? "Already added" : undefined}
              data-disabled={added || undefined}
              className={styles.row}
              onPointerMove={() => setActive(index)}
              onClick={() => pick(folder)}
            >
              <PickerPanel.ItemIcon style={iconStyle(folder.color)}>
                <FolderIcon name={folder.icon} />
              </PickerPanel.ItemIcon>
              <PickerPanel.ItemLabel title={folder.name}>
                {folder.name}
              </PickerPanel.ItemLabel>
              <PickerPanel.ItemMeta>
                <Keyboard.Cluster keys={[String(index + 1)]} density="flat" />
              </PickerPanel.ItemMeta>
            </PickerPanel.Item>
          );
        })}
        {!shown.length ? (
          <PickerPanel.Empty>
            Folders you add Saves to show up here.
          </PickerPanel.Empty>
        ) : null}
      </PickerPanel.Collection>
      <PickerPanel.Footer className={styles.footer}>
        <Button size="xs" variant="ghost" onClick={onShowAll}>
          All Folders
        </Button>
      </PickerPanel.Footer>
    </PickerPanel.Surface>
  );
}
