import { RestrictToHorizontalAxis } from "@dnd-kit/abstract/modifiers";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { RestrictToElement } from "@dnd-kit/dom/modifiers";
import { move } from "@dnd-kit/helpers";
import {
  DragDropProvider,
  type DragEndEvent,
  PointerSensor,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { IconPlusFill18 } from "@pond/icons/fill/18";
import { IconXmarkOutline12 } from "@pond/icons/outline/12";
import { IconGear3Outline18 } from "@pond/icons/outline/18";
import { Button, type MenuItemSpec } from "@pond/ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickAuthorColor } from "@/components/save/preview/lib/helpers";
import { SpecContextMenu } from "@/components/shared/spec-context-menu";
import { ChromeHistoryNav } from "@/components/shell/chrome-toolbar";
import { useAccounts } from "@/hooks/use-accounts";
import { useSave } from "@/hooks/use-saves";
import { useWatches } from "@/hooks/use-watches";
import { pickAuthorAvatarUrl } from "@/lib/media/url";
import type { Save } from "@/lib/types";
import { saveIdFromPath } from "@/lib/ui/save-nav";
import { initials } from "@/lib/util/initials";
import { settingsModal } from "@/stores/settings-modal";
import { useSyncByAccount } from "@/stores/sync-monitor";
import { type Tab, tabs, useActiveTabId, useTabs } from "@/stores/tabs";
import { ProgressPanel } from "./activity";
import { ErrorsPanel } from "./attention";
import { iconForTab } from "./icons";
import { computeLabel } from "./labels";
import type { Panel } from "./lib";
import { MediaIndexPanel } from "./media-index";
import { RecentPanel } from "./recent";
import styles from "./styles.module.css";
import { OngoingPanel } from "./sync";

/** Linear-style sibling slides; idle:false skips open/close layout motion. */
const SORT_TRANSITION = {
  duration: 120,
  easing: "linear",
  idle: false,
} as const;

function focusTabEl(id: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(id)}"]`,
    );
    el?.focus();
  });
}

function stopPropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

interface TabBodyProps {
  path: string;
  pinned: boolean;
  label: string;
  save: Save | undefined;
  onClose: () => void;
}

const TabBody = memo(function TabBody({
  path,
  pinned,
  label,
  save,
  onClose,
}: TabBodyProps) {
  const Icon = iconForTab(path, save);
  const avatarUrl = save ? pickAuthorAvatarUrl(save) : null;
  const author = save?.author?.trim() ?? "";
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showAvatar = Boolean(save && (avatarUrl || author));
  const showImg = Boolean(avatarUrl && failedUrl !== avatarUrl);

  return (
    <>
      {showAvatar ? (
        <span
          aria-hidden
          className={styles["tab-avatar"]}
          style={
            showImg
              ? undefined
              : { background: pickAuthorColor(author || label) }
          }
        >
          {showImg && avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setFailedUrl(avatarUrl)}
            />
          ) : (
            initials(author || label)
          )}
        </span>
      ) : (
        <span aria-hidden className={styles["tab-icon"]}>
          <Icon />
        </span>
      )}
      <span className={styles["tab-label"]}>{label}</span>
      {!pinned && (
        <Button
          icon
          size="xs"
          variant="ghost"
          className={styles["tab-close"]}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close tab"
        >
          <IconXmarkOutline12 />
        </Button>
      )}
    </>
  );
});

function tabMenu(tab: Tab, onClose: () => void): MenuItemSpec[] {
  const canReopen = tabs.getState().recentlyClosed.length > 0;
  return [
    tab.pinned
      ? { label: "Unpin Tab", onClick: () => tabs.unpin(tab.id) }
      : { label: "Pin Tab", onClick: () => tabs.pin(tab.id) },
    { label: "Duplicate Tab", onClick: () => tabs.duplicate(tab.id) },
    { type: "separator" },
    ...(tab.pinned
      ? []
      : [{ label: "Close", onClick: onClose } satisfies MenuItemSpec]),
    { label: "Close Others", onClick: () => tabs.closeOthers(tab.id) },
    { label: "Close to the Right", onClick: () => tabs.closeToRight(tab.id) },
    { label: "Close All", onClick: () => tabs.closeAll() },
    { type: "separator" },
    {
      label: "Reopen Closed Tab",
      disabled: !canReopen,
      onClick: () => tabs.reopenClosed(),
    },
  ];
}

const TabItem = memo(function TabItem({
  tab,
  index,
  isActive,
  frozenWidth,
  onBeginRapidClose,
}: {
  tab: Tab;
  index: number;
  isActive: boolean;
  frozenWidth: number | undefined;
  onBeginRapidClose: () => void;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const { ref: sortableRef, isDragging } = useSortable({
    id: tab.id,
    index,
    transition: SORT_TRANSITION,
  });

  const saveId = saveIdFromPath(tab.path.split("?")[0] ?? tab.path);
  const save = useSave(saveId);
  const label = computeLabel(tab.path, save);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      itemRef.current = node;
      sortableRef(node);
    },
    [sortableRef],
  );

  const handleClose = useCallback(() => {
    onBeginRapidClose();
    tabs.close(tab.id);
  }, [onBeginRapidClose, tab.id]);

  /** Activate on click so a drag-to-reorder does not also switch tabs mid-gesture. */
  const onClick = useCallback(() => {
    if (!isActive) tabs.activate(tab.id);
  }, [isActive, tab.id]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const focusActive = () => focusTabEl(tabs.getState().activeId);

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          tabs.activateNext();
          focusActive();
          return;
        case "ArrowLeft":
          e.preventDefault();
          tabs.activatePrev();
          focusActive();
          return;
        case "Home":
          e.preventDefault();
          tabs.activateByIndex(0);
          focusActive();
          return;
        case "End": {
          e.preventDefault();
          const n = tabs.getState().tabs.length;
          if (n > 0) tabs.activateByIndex(n - 1);
          focusActive();
          return;
        }
        case "Delete":
        case "Backspace": {
          if (tab.pinned || tabs.getState().tabs.length <= 1) return;
          e.preventDefault();
          onBeginRapidClose();
          tabs.close(tab.id);
          focusActive();
          return;
        }
        case "Enter":
        case " ":
          e.preventDefault();
          if (!isActive) tabs.activate(tab.id);
          return;
        default:
          return;
      }
    },
    [isActive, onBeginRapidClose, tab.id, tab.pinned],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose],
  );

  useEffect(() => {
    if (!isActive) return;
    itemRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [isActive]);

  const className = [
    styles.tab,
    isActive && styles["tab-active"],
    tab.pinned && styles["tab-pinned"],
    isDragging && styles["tab-lifted"],
    frozenWidth != null && styles["tab-frozen"],
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SpecContextMenu buildItems={() => tabMenu(tab, handleClose)}>
      <div
        ref={setRefs}
        className={className}
        style={frozenWidth != null ? { width: frozenWidth } : undefined}
        role="tab"
        data-tab-id={tab.id}
        tabIndex={isActive ? 0 : -1}
        aria-selected={isActive}
        title={label}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
      >
        <TabBody
          path={tab.path}
          pinned={tab.pinned}
          label={label}
          save={save}
          onClose={handleClose}
        />
      </div>
    </SpecContextMenu>
  );
});

export function Toolbar() {
  const tabList = useTabs();
  const activeId = useActiveTabId();
  const groupRef = useRef<HTMLDivElement | null>(null);
  const frozenRef = useRef(false);
  const canScrollXRef = useRef(false);
  const fadeRafRef = useRef(0);
  const { accounts } = useAccounts();
  const { watches } = useWatches();
  const byAccount = useSyncByAccount();
  const [open, setOpen] = useState<Panel | null>(null);
  const [frozenWidths, setFrozenWidths] = useState<Record<string, number>>({});

  const ids = useMemo(() => tabList.map((t) => t.id), [tabList]);

  const modifiers = useMemo(
    () => [
      RestrictToHorizontalAxis,
      RestrictToElement.configure({
        element: () => groupRef.current,
      }),
    ],
    [],
  );

  const beginRapidClose = useCallback(() => {
    if (frozenRef.current) return;
    const el = groupRef.current;
    if (!el) return;
    const next: Record<string, number> = {};
    for (const node of el.querySelectorAll<HTMLElement>("[data-tab-id]")) {
      const id = node.dataset.tabId;
      if (!id) continue;
      next[id] = node.getBoundingClientRect().width;
    }
    if (Object.keys(next).length === 0) return;
    frozenRef.current = true;
    setFrozenWidths(next);
  }, []);

  const endRapidClose = useCallback(() => {
    if (!frozenRef.current) return;
    frozenRef.current = false;
    setFrozenWidths({});
  }, []);

  /** Persist order when the gesture ends; dnd-kit handles optimistic motion mid-drag. */
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled || !event.operation.source) return;
      const next = move(ids, event);
      if (next === ids) return;
      tabs.setOrder(next.map(String));
    },
    [ids],
  );

  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;

    const syncFade = () => {
      fadeRafRef.current = 0;
      const max = el.scrollWidth - el.clientWidth;
      canScrollXRef.current = max > 1;
      if (max <= 1) {
        el.removeAttribute("data-fade");
        return;
      }
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < max - 1;
      el.dataset.fade = left && right ? "both" : left ? "left" : "right";
    };

    const syncSoon = () => {
      if (fadeRafRef.current) return;
      fadeRafRef.current = requestAnimationFrame(syncFade);
    };

    const onWheel = (e: WheelEvent) => {
      if (!canScrollXRef.current) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    syncSoon();
    el.addEventListener("scroll", syncFade, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mouseleave", endRapidClose);
    const ro = new ResizeObserver(syncSoon);
    ro.observe(el);
    const mo = new MutationObserver(syncSoon);
    mo.observe(el, { childList: true });
    return () => {
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
      el.removeEventListener("scroll", syncFade);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mouseleave", endRapidClose);
      ro.disconnect();
      mo.disconnect();
    };
  }, [endRapidClose]);

  return (
    <div className={styles.bar}>
      <ChromeHistoryNav />
      <div className={styles.tabs}>
        <DragDropProvider
          modifiers={modifiers}
          sensors={(defaults) => [
            ...defaults.filter((sensor) => sensor !== PointerSensor),
            PointerSensor.configure({
              activationConstraints: [
                new PointerActivationConstraints.Distance({ value: 6 }),
              ],
            }),
          ]}
          onDragEnd={onDragEnd}
        >
          <div
            ref={groupRef}
            className={styles.group}
            role="tablist"
            aria-label="Open tabs"
            aria-orientation="horizontal"
          >
            {tabList.map((tab, index) => (
              <TabItem
                key={tab.id}
                tab={tab}
                index={index}
                isActive={tab.id === activeId}
                frozenWidth={frozenWidths[tab.id]}
                onBeginRapidClose={beginRapidClose}
              />
            ))}
          </div>
        </DragDropProvider>
        <Button
          variant="ghost"
          size="sm"
          icon
          className={styles["new-tab"]}
          onClick={() => tabs.open("/")}
          aria-label="New tab"
        >
          <IconPlusFill18 />
        </Button>
      </div>

      <div className={styles.dragSpacer} aria-hidden />

      <div className={styles.actions}>
        <ProgressPanel open={open === "progress"} onOpenChange={setOpen} />
        <RecentPanel open={open === "recent"} onOpenChange={setOpen} />
        <ErrorsPanel
          open={open === "errors"}
          onOpenChange={setOpen}
          accounts={accounts}
          watches={watches}
          byAccount={byAccount}
        />
        <OngoingPanel
          open={open === "ongoing"}
          onOpenChange={setOpen}
          accounts={accounts}
          watches={watches}
          byAccount={byAccount}
        />
        <MediaIndexPanel open={open === "media-index"} onOpenChange={setOpen} />
        <Button
          variant="ghost"
          size="sm"
          icon
          onClick={() => settingsModal.open()}
          aria-label="Settings"
        >
          <IconGear3Outline18 />
        </Button>
      </div>
    </div>
  );
}
