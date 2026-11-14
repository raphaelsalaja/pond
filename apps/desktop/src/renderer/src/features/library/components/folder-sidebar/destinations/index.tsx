import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
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
  IconAlbum2,
  IconBookmark,
  IconBookmarkSlash,
  IconClockPlus,
  IconFolderBan,
  IconHistory,
  IconInbox,
  IconNodes3,
  IconShuffle,
  IconTrashXmark,
  IconWindowDownload,
} from "@pond/icons";
import type { SidebarDestination } from "@pond/schema";
import { Sidebar } from "@pond/ui";
import { QueueSummarySchema } from "@shared/queue-contracts";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotionConfig } from "motion/react";
import {
  type ReactElement,
  type RefAttributes,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import {
  reseedRandomSort,
  resetFilters,
  setSort,
} from "@/features/library/state/view-store";
import {
  moveVisibleSidebarDestination,
  resolveSidebarBadgeStyle,
  SIDEBAR_DESTINATION_GROUPS,
  SIDEBAR_DESTINATION_LABELS,
} from "@/features/settings";
import { useAccounts } from "@/features/sources";
import { useTags } from "@/features/tags";
import {
  createSortableAnnouncements,
  SIDEBAR_SORTABLE_KEYBOARD_CODES,
  SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
  SORTABLE_DROP_ANIMATION,
} from "@/shared/lib/dnd-kit";
import { usePrefs } from "@/shared/state/prefs";
import { BuiltInVisibilityMenu } from "../built-in-visibility-menu";
import { selectLibraryNav } from "../navigation";
import { Row } from "../sidebar-row";
import { buildTrashMenuItems } from "../trash-menu";
import styles from "./styles.module.css";

interface LibraryDestinationsProps {
  activeViewId: string | null;
  destination: LibraryNav | null;
}

const VERTICAL_SORT_MODIFIERS = [restrictToVerticalAxis];

type DestinationDragProps = Omit<
  React.ComponentPropsWithoutRef<typeof Row>,
  "label"
> &
  RefAttributes<HTMLButtonElement>;

function SortableDestination({
  destination,
  disabled,
  render,
}: {
  destination: SidebarDestination;
  disabled: boolean;
  render: (dragProps: DestinationDragProps) => ReactElement;
}) {
  const reduceMotion = useReducedMotionConfig();
  const { activatorEvent } = useDndContext();
  const keyboardDrag = activatorEvent?.type.startsWith("key") ?? false;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: destination, disabled });

  return (
    <div
      className={styles.sortable}
      data-dragging={isDragging || undefined}
      data-sidebar-sortable={destination}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reduceMotion || keyboardDrag ? "none" : transition,
      }}
    >
      {render({
        ...attributes,
        ...listeners,
        ref: setActivatorNodeRef,
      })}
    </div>
  );
}

function DestinationIcon({ destination }: { destination: SidebarDestination }) {
  switch (destination) {
    case "inbox":
      return <IconInbox />;
    case "all":
      return <IconAlbum2 />;
    case "uncategorized":
      return <IconFolderBan />;
    case "untagged":
      return <IconBookmarkSlash />;
    case "recentlyAdded":
      return <IconClockPlus />;
    case "recentlyUsed":
      return <IconHistory />;
    case "tags":
      return <IconBookmark />;
    case "random":
      return <IconShuffle />;
    case "trash":
      return <IconTrashXmark />;
    case "downloads":
      return <IconWindowDownload />;
    case "sources":
      return <IconNodes3 />;
  }
}

export function LibraryDestinations({
  activeViewId,
  destination,
}: LibraryDestinationsProps) {
  const tags = useTags();
  const { accounts } = useAccounts();
  const queueSummary = useQuery({
    queryKey: ["queue.summary"],
    queryFn: async () =>
      QueueSummarySchema.parse(await window.pond.query("queue.summary", {})),
    refetchInterval: 2_000,
  });
  const counts = useSidebarCounts();
  const [sidebar, patch, loaded] = usePrefs("sidebar");
  const [order, setOrder] = useState(sidebar.order);
  const [activeSort, setActiveSort] = useState<{
    destination: SidebarDestination;
    group: string;
    keyboard: boolean;
  } | null>(null);
  const reduceMotion = useReducedMotionConfig();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SIDEBAR_SORTABLE_KEYBOARD_CODES,
    }),
  );
  const destinations = sidebar.destinations;
  const downloadsCount = queueSummary.data?.actionable ?? 0;
  const downloadingCount = queueSummary.data?.running ?? 0;

  useEffect(() => setOrder(sidebar.order), [sidebar.order]);

  const saveOrder = (next: SidebarDestination[]) => {
    setOrder(next);
    void patch({ order: next });
  };

  const isDestinationActive = (id: SidebarDestination): boolean => {
    if (!destination) return false;
    switch (id) {
      case "inbox":
        return destination.kind === "inbox";
      case "all":
        return destination.kind === "all" && !activeViewId;
      case "recentlyUsed":
        return destination.kind === "recents";
      case "uncategorized":
        return destination.kind === "uncategorized";
      case "untagged":
        return destination.kind === "untagged";
      case "recentlyAdded":
        return destination.kind === "recentlyAdded";
      case "tags":
        return destination.kind === "tags";
      case "random":
        return destination.kind === "random";
      case "trash":
        return destination.kind === "trash";
      case "downloads":
        return destination.kind === "downloads";
      case "sources":
        return destination.kind === "sources";
    }
  };

  const destinationCount = (
    destination: SidebarDestination,
  ): number | undefined => {
    switch (destination) {
      case "inbox":
        return counts.inbox;
      case "all":
        return counts.library;
      case "uncategorized":
        return counts.uncategorized;
      case "untagged":
        return counts.untagged;
      case "tags":
        return tags.length;
      case "trash":
        return counts.trash;
      case "downloads":
        return downloadsCount;
      case "sources":
        return accounts.length;
      case "recentlyAdded":
        return counts.recentlyAdded;
      case "recentlyUsed":
        return counts.recentlyUsed;
      case "random":
        return undefined;
    }
  };

  const renderDestination = (
    destination: SidebarDestination,
    dragProps: DestinationDragProps,
  ): ReactElement => {
    const badgeStyle = resolveSidebarBadgeStyle(sidebar, destination);
    switch (destination) {
      case "inbox":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Inbox"
              icon={<IconInbox />}
              count={counts.inbox}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "inbox" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "all":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="All"
              icon={<IconAlbum2 />}
              count={counts.library}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => {
                resetFilters();
                selectLibraryNav({ kind: "all" });
              }}
            />
          </BuiltInVisibilityMenu>
        );
      case "uncategorized":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Uncategorized"
              icon={<IconFolderBan />}
              count={counts.uncategorized}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => {
                resetFilters();
                selectLibraryNav({ kind: "uncategorized" });
              }}
            />
          </BuiltInVisibilityMenu>
        );
      case "untagged":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Untagged"
              icon={<IconBookmarkSlash />}
              count={counts.untagged}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "untagged" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "recentlyAdded":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Recently Added"
              icon={<IconClockPlus />}
              count={counts.recentlyAdded}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => {
                resetFilters();
                selectLibraryNav({ kind: "recentlyAdded" });
              }}
            />
          </BuiltInVisibilityMenu>
        );
      case "recentlyUsed":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Recently Used"
              icon={<IconHistory />}
              count={counts.recentlyUsed}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "recents" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "tags":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Tags"
              icon={<IconBookmark />}
              count={tags.length}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "tags" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "random":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Random"
              icon={<IconShuffle />}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => {
                resetFilters();
                setSort({ key: "random", dir: "asc" });
                reseedRandomSort();
                selectLibraryNav({ kind: "random" });
              }}
            />
          </BuiltInVisibilityMenu>
        );
      case "trash":
        return (
          <BuiltInVisibilityMenu
            destination={destination}
            additionalItems={() => buildTrashMenuItems(counts.trash > 0)}
            key={destination}
          >
            <Row
              label="Trash"
              icon={<IconTrashXmark />}
              count={counts.trash}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "trash" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "downloads":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Downloads"
              icon={<IconWindowDownload />}
              count={downloadsCount}
              downloading={downloadingCount}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "downloads" })}
            />
          </BuiltInVisibilityMenu>
        );
      case "sources":
        return (
          <BuiltInVisibilityMenu destination={destination} key={destination}>
            <Row
              label="Sources"
              icon={<IconNodes3 />}
              count={accounts.length}
              badgeStyle={badgeStyle}
              active={isDestinationActive(destination)}
              {...dragProps}
              onClick={() => selectLibraryNav({ kind: "sources" })}
            />
          </BuiltInVisibilityMenu>
        );
    }
  };

  const visibleGroups = SIDEBAR_DESTINATION_GROUPS.map((group) => ({
    label: group.label,
    heading: group.heading,
    allDestinations: group.destinations,
    destinations: order.filter(
      (destination) =>
        destinations[destination] &&
        group.destinations.some((item) => item === destination),
    ),
  })).filter((group) => group.destinations.length > 0);

  return (
    <>
      {visibleGroups.map((group) => (
        <Sidebar.Group key={group.label}>
          {group.heading ? (
            <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
          ) : null}
          <DndContext
            accessibility={{
              announcements: createSortableAnnouncements(
                group.destinations,
                (id) =>
                  /** SAFETY: this context only registers the group's destination ids. */
                  SIDEBAR_DESTINATION_LABELS[id as SidebarDestination],
              ),
              screenReaderInstructions:
                SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
            }}
            collisionDetection={closestCenter}
            modifiers={VERTICAL_SORT_MODIFIERS}
            sensors={sensors}
            onDragStart={({ active, activatorEvent }) =>
              setActiveSort({
                /** SAFETY: this context only registers the group's destination ids. */
                destination: active.id as SidebarDestination,
                group: group.label,
                keyboard: activatorEvent.type.startsWith("key"),
              })
            }
            onDragCancel={() => setActiveSort(null)}
            onDragEnd={({ active, over }: DragEndEvent) => {
              setActiveSort(null);
              if (!over || active.id === over.id) return;
              const destination = group.destinations.find(
                (item) => item === active.id,
              );
              const overDestination = group.destinations.find(
                (item) => item === over.id,
              );
              if (!destination || !overDestination) return;
              saveOrder(
                moveVisibleSidebarDestination(
                  order,
                  group.allDestinations,
                  group.destinations,
                  destination,
                  overDestination,
                ),
              );
            }}
          >
            <SortableContext
              items={group.destinations}
              strategy={verticalListSortingStrategy}
            >
              {group.destinations.map((destination) => (
                <SortableDestination
                  destination={destination}
                  disabled={!loaded}
                  key={destination}
                  render={(dragProps) =>
                    renderDestination(destination, dragProps)
                  }
                />
              ))}
            </SortableContext>
            {createPortal(
              <DragOverlay
                dropAnimation={
                  reduceMotion || activeSort?.keyboard
                    ? null
                    : SORTABLE_DROP_ANIMATION
                }
                modifiers={VERTICAL_SORT_MODIFIERS}
              >
                {activeSort?.group === group.label ? (
                  <div className={styles.overlay}>
                    <Row
                      label={SIDEBAR_DESTINATION_LABELS[activeSort.destination]}
                      icon={
                        <DestinationIcon destination={activeSort.destination} />
                      }
                      active={isDestinationActive(activeSort.destination)}
                      badgeStyle={resolveSidebarBadgeStyle(
                        sidebar,
                        activeSort.destination,
                      )}
                      count={destinationCount(activeSort.destination)}
                      tabIndex={-1}
                    />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </Sidebar.Group>
      ))}
    </>
  );
}
