import { IconPlusOutline18, IconXmarkOutline18 } from "@pond/icons/outline/18";
import { ContextMenu } from "@pond/ui";
import { Reorder } from "motion/react";
import { memo, useCallback, useMemo, useRef } from "react";
import { useSave } from "@/pool/hooks";
import { type Tab, useTabStore } from "@/stores/tabs";
import { iconForTab } from "./icons";
import { computeLabel, extractSaveId } from "./labels";
import styles from "./styles.module.css";

const REORDER_SPRING = { type: "spring", stiffness: 600, damping: 40 } as const;

const TAB_LIFTED = styles["tab-lifted"] ?? "";

interface TabBodyProps {
  tab: Tab;
  isActive: boolean;
  onClose: () => void;
}

const TabBody = memo(function TabBody({
  tab,
  isActive,
  onClose,
}: TabBodyProps) {
  const saveId = extractSaveId(tab.path);
  const save = useSave(saveId);
  const label = computeLabel(tab.path, save);
  const Icon = iconForTab(tab.path, save);

  return (
    <>
      <span aria-hidden className={styles["tab-icon"]}>
        <Icon width={14} height={14} />
      </span>
      <span className={styles["tab-label"]}>{label}</span>
      {!tab.pinned && (
        <button
          type="button"
          className={styles["tab-close"]}
          // Stop both pointer and mouse events so the close button
          // doesn't initiate a drag on the parent Reorder.Item.
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close tab"
        >
          <IconXmarkOutline18 width={10} height={10} />
        </button>
      )}
      {/* Keep hook order stable when `isActive` flips between renders. */}
      <span aria-hidden hidden data-active={isActive ? "true" : "false"} />
    </>
  );
});

function stopPropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const TabItem = memo(function TabItem({
  tab,
  isActive,
}: {
  tab: Tab;
  isActive: boolean;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  const handleClose = useCallback(
    () => useTabStore.getState().close(tab.id),
    [tab.id],
  );

  // Activation goes on `onClick`, not `onPointerDown` — motion only
  // fires `onClick` when the gesture didn't turn into a drag.
  // Activating mid-drag would re-render TabItem and tear down motion's
  // drag state, leaving the tab visually stuck.
  const onClick = useCallback(() => {
    if (!isActive) useTabStore.getState().activate(tab.id);
  }, [isActive, tab.id]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose],
  );

  const className = [
    styles.tab,
    isActive && styles["tab-active"],
    tab.pinned && styles["tab-pinned"],
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <Reorder.Item
            ref={itemRef}
            value={tab.id}
            as="div"
            className={className}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            transition={REORDER_SPRING}
            onClick={onClick}
            onMouseDown={onMouseDown}
            // Own the lift visual ourselves rather than motion's
            // `whileDrag`. Reorder.Group rebuilds its context value
            // on every render, which can desync motion's drag state
            // machine from the element during a mid-drag reorder —
            // the result is `scale` / `box-shadow` getting stuck on
            // release. A direct classList swap is synchronous and
            // survives any re-render in between.
            onDragStart={() => {
              itemRef.current?.classList.add(TAB_LIFTED);
            }}
            onDragEnd={() => {
              itemRef.current?.classList.remove(TAB_LIFTED);
            }}
          >
            <TabBody tab={tab} isActive={isActive} onClose={handleClose} />
          </Reorder.Item>
        }
      />
      <ContextMenu.Portal>
        <ContextMenu.Backdrop />
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            {tab.pinned ? (
              <ContextMenu.Item
                onClick={() => useTabStore.getState().unpin(tab.id)}
              >
                <ContextMenu.ItemLabel>Unpin Tab</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            ) : (
              <ContextMenu.Item
                onClick={() => useTabStore.getState().pin(tab.id)}
              >
                <ContextMenu.ItemLabel>Pin Tab</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            )}
            <ContextMenu.Item
              onClick={() => useTabStore.getState().duplicate(tab.id)}
            >
              <ContextMenu.ItemLabel>Duplicate Tab</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            {!tab.pinned && (
              <ContextMenu.Item onClick={handleClose}>
                <ContextMenu.ItemLabel>Close</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            )}
            <ContextMenu.Item
              onClick={() => useTabStore.getState().closeOthers(tab.id)}
            >
              <ContextMenu.ItemLabel>Close Others</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Item
              onClick={() => useTabStore.getState().closeToRight(tab.id)}
            >
              <ContextMenu.ItemLabel>Close to the Right</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

function Root() {
  const tabs = useTabStore((s) => s.tabs);
  const activeId = useTabStore((s) => s.activeId);

  const ids = useMemo(() => tabs.map((t) => t.id), [tabs]);

  const onReorder = useCallback((next: string[]) => {
    useTabStore.getState().setOrder(next);
  }, []);

  const onNewTab = useCallback(() => {
    useTabStore.getState().open("/");
  }, []);

  if (tabs.length <= 1) return null;

  return (
    <div className={styles.bar}>
      <Reorder.Group
        as="div"
        axis="x"
        className={styles.group}
        values={ids}
        onReorder={onReorder}
      >
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} isActive={tab.id === activeId} />
        ))}
      </Reorder.Group>
      <button
        type="button"
        className={styles["new-tab"]}
        onClick={onNewTab}
        aria-label="New tab"
      >
        <IconPlusOutline18 width={14} height={14} />
      </button>
    </div>
  );
}

export const TabBar = { Root };
