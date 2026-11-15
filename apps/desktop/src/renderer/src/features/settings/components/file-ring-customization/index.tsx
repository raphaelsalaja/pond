import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconArrowDown,
  IconArrowUp,
  IconGripDotsVertical,
  IconXmark,
} from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import {
  FILE_RING_ACTIONS,
  FILE_RING_CAPACITY,
  type FileRingItem,
  fileRingItemKey,
} from "@pond/schema/file-ring";
import { Button, Dialog, Empty, Menu, Settings } from "@pond/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  RING_ACTIONS,
  ringSlotName,
  useFileRingItems,
} from "@/features/library/file-ring";
import {
  addRingItem,
  canAddRingItem,
  moveRingItem,
  removeRingItem,
} from "@/features/settings/lib/file-ring-items";
import { createSortableAnnouncements } from "@/shared/lib/dnd-kit";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const VERTICAL_SORT_MODIFIERS = [restrictToVerticalAxis];

interface RowCopy {
  label: string;
  icon: ReactNode;
  missing: boolean;
}

function SortableRow({
  id,
  index,
  count,
  copy,
  disabled,
  onMove,
  onRemove,
}: {
  id: string;
  index: number;
  count: number;
  copy: RowCopy;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      className={styles.row}
      data-dragging={isDragging || undefined}
      data-missing={copy.missing || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        ref={setActivatorNodeRef}
        icon
        size="xs"
        variant="ghost"
        className={styles.handle}
        aria-label={`Reorder ${copy.label}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <IconGripDotsVertical size={12} />
      </Button>
      <span className={styles.icon}>{copy.icon}</span>
      <span className={styles.label}>{copy.label}</span>
      <span className={styles.slot}>{ringSlotName(index)}</span>
      <span className={styles.controls}>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label={`Move ${copy.label} Up`}
          disabled={disabled || index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          <IconArrowUp size={12} />
        </Button>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label={`Move ${copy.label} Down`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index, index + 1)}
        >
          <IconArrowDown size={12} />
        </Button>
        <Button
          icon
          size="xs"
          variant="ghost"
          aria-label={`Remove ${copy.label}`}
          disabled={disabled}
          onClick={() => onRemove(index)}
        >
          <IconXmark size={12} />
        </Button>
      </span>
    </li>
  );
}

function AddItemMenu({
  items,
  folders,
  disabled,
  onAdd,
}: {
  items: readonly FileRingItem[];
  folders: readonly Folder[];
  disabled: boolean;
  onAdd: (item: FileRingItem) => void;
}) {
  const [folderViews] = usePrefs("folderViews");
  const actions = FILE_RING_ACTIONS.flatMap((action) => {
    const item: FileRingItem = { kind: "action", action };
    return canAddRingItem(items, item) ? [{ action, item }] : [];
  });
  const addable = folders
    .flatMap((folder) => {
      const item: FileRingItem = { kind: "folder", folderId: folder.id };
      return canAddRingItem(items, item) ? [{ folder, item }] : [];
    })
    .sort((a, b) => a.folder.name.localeCompare(b.folder.name));
  const full = items.length >= FILE_RING_CAPACITY;

  return (
    <Menu.Root>
      <Menu.Trigger
        variant="secondary"
        size="sm"
        disabled={disabled || full || (!actions.length && !addable.length)}
      >
        Add Item
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup>
            <Menu.List>
              {actions.length ? (
                <Menu.Group>
                  <Menu.GroupLabel>Actions</Menu.GroupLabel>
                  {actions.map(({ action, item }) => {
                    const { label, Icon } = RING_ACTIONS[action];
                    return (
                      <Menu.Item key={action} onClick={() => onAdd(item)}>
                        <Menu.ItemIcon>
                          <Icon />
                        </Menu.ItemIcon>
                        <Menu.ItemLabel>{label}</Menu.ItemLabel>
                      </Menu.Item>
                    );
                  })}
                </Menu.Group>
              ) : null}
              {actions.length && addable.length ? <Menu.Separator /> : null}
              {addable.length ? (
                <Menu.Group>
                  <Menu.GroupLabel>Folders</Menu.GroupLabel>
                  {addable.map(({ folder, item }) => (
                    <Menu.Item key={folder.id} onClick={() => onAdd(item)}>
                      <Menu.ItemIcon>
                        <FolderIcon
                          name={folderViews[folder.id]?.icon}
                          color={folder.color}
                        />
                      </Menu.ItemIcon>
                      <Menu.ItemLabel>{folder.name}</Menu.ItemLabel>
                    </Menu.Item>
                  ))}
                </Menu.Group>
              ) : null}
            </Menu.List>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function FileRingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, patch, loaded] = usePrefs("fileRing");
  const [folderViews] = usePrefs("folderViews");
  const { items, customized, folders } = useFileRingItems();
  const [order, setOrder] = useState(items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => setOrder(items), [items]);

  const byId = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const ids = order.map(fileRingItemKey);

  const copyOf = (item: FileRingItem): RowCopy => {
    if (item.kind === "action") {
      const { label, Icon } = RING_ACTIONS[item.action];
      return { label, icon: <Icon />, missing: false };
    }
    const folder = byId.get(item.folderId);
    if (!folder)
      return {
        label: "Unavailable Folder",
        icon: <FolderIcon />,
        missing: true,
      };
    return {
      label: folder.name,
      icon: (
        <FolderIcon name={folderViews[folder.id]?.icon} color={folder.color} />
      ),
      missing: false,
    };
  };

  const save = (next: FileRingItem[]) => {
    setOrder(next);
    void patch({ items: next });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) save(moveRingItem(order, from, to));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Customize Ring</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            <Dialog.Description>
              {customized
                ? "Items fill the top first, then the sides and bottom. A deleted folder leaves its sector empty."
                : "Shows New Folder, Export Files, then Quick Access and recent folders. Any change saves your own ring."}
            </Dialog.Description>
            {order.length ? (
              <DndContext
                accessibility={{
                  announcements: createSortableAnnouncements(ids, (id) => {
                    const item = order[ids.indexOf(String(id))];
                    return item ? copyOf(item).label : String(id);
                  }),
                }}
                collisionDetection={closestCenter}
                modifiers={VERTICAL_SORT_MODIFIERS}
                sensors={sensors}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className={styles.list} aria-label="Ring Items">
                    {order.map((item, index) => (
                      <SortableRow
                        key={fileRingItemKey(item)}
                        id={fileRingItemKey(item)}
                        index={index}
                        count={order.length}
                        copy={copyOf(item)}
                        disabled={!loaded}
                        onMove={(from, to) =>
                          save(moveRingItem(order, from, to))
                        }
                        onRemove={(at) => save(removeRingItem(order, at))}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            ) : (
              <Empty.Root className={styles.empty} role="status">
                <Empty.Title>No ring items</Empty.Title>
                <Empty.Description>
                  Add a folder or action to file into while you drag.
                </Empty.Description>
              </Empty.Root>
            )}
            <div className={styles.add}>
              <AddItemMenu
                items={order}
                folders={folders}
                disabled={!loaded}
                onAdd={(item) => save(addRingItem(order, item))}
              />
              <span className={styles.capacity}>
                {order.length} of {FILE_RING_CAPACITY}
              </span>
            </div>
          </Dialog.Content>
          <Dialog.Footer>
            <Button
              variant="tertiary"
              disabled={!loaded || !customized}
              onClick={() => void patch({ items: null })}
            >
              Reset
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FileRingSetting({ disabled }: { disabled: boolean }) {
  const [, , loaded] = usePrefs("fileRing");
  const [customizing, setCustomizing] = useState(false);
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Ring Items</Settings.ItemTitle>
        <Settings.ItemDescription>
          Choose the folders and actions in the ring, and their order.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !loaded}
          onClick={() => setCustomizing(true)}
        >
          Customize
        </Button>
      </Settings.ItemControl>
      <FileRingDialog open={customizing} onOpenChange={setCustomizing} />
    </>
  );
}
