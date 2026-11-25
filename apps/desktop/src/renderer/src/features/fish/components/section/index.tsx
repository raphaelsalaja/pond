import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { IconPlus } from "@pond/icons";
import { Menu, Sidebar } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SidebarSectionMenu } from "@/features/settings";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import {
  createSortableAnnouncements,
  SIDEBAR_SORTABLE_KEYBOARD_CODES,
  SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
  SORTABLE_DROP_ANIMATION,
} from "@/shared/lib/dnd-kit";
import { usePrefs } from "@/shared/state/prefs";
import {
  fishLayout,
  LOOSE,
  layoutPlacements,
  moveFish,
  PINNED,
  sameLayout,
  shelfKeys,
  shelfOf,
} from "../../lib/layout";
import type { FishLayout } from "../../lib/layout";
import { arrangeFish, newItems, sectionItems } from "../../lib/menu";
import { useFishList, useFishSections, useHydrateFish } from "../../state/fish";
import { FishRow } from "../row";
import { SectionGroup } from "../section-group";
import { Shelf, SortableFish } from "../sortable";
import { FishTile } from "../tile";
import styles from "./styles.module.css";

interface Drag {
  id: string;
  pinned: boolean;
  keyboard: boolean;
}

export function FishSection({ activeId }: { activeId: string | null }) {
  useHydrateFish();
  const school = useFishList();
  const sections = useFishSections();
  const [sidebar] = usePrefs("sidebar");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<FishLayout | null>(null);
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const reduceMotion = useReducedMotionConfig();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SIDEBAR_SORTABLE_KEYBOARD_CODES,
    }),
  );

  if (!sidebar.sections.fish) return null;

  const saved = fishLayout(school, sections);
  const layout = draft ?? saved;
  const byId = new Map(school.map((fish) => [fish.id, fish]));
  const ordered = shelfKeys(sections).flatMap((key) => layout[key] ?? []);
  const pinned = layout[PINNED] ?? [];
  const loose = layout[LOOSE] ?? [];
  const labelFor = (id: UniqueIdentifier): string => {
    const key = String(id);
    if (key === PINNED) return "Pinned";
    if (key === LOOSE) return "Fish";
    return (
      byId.get(key)?.name ??
      sections.find((section) => section.id === key)?.name ??
      key
    );
  };

  /** Prefer the fish under the pointer; over a shelf's gaps, the nearest fish on that shelf. */
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    const hits = pointer.length > 0 ? pointer : rectIntersection(args);
    const fishHit = hits.find((hit) => !layout[String(hit.id)]);
    const shelfHit = hits[0];
    let over = fishHit?.id ?? shelfHit?.id ?? null;
    if (!fishHit && shelfHit) {
      const ids = layout[String(shelfHit.id)] ?? [];
      over =
        closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((entry) =>
            ids.includes(String(entry.id)),
          ),
        })[0]?.id ?? shelfHit.id;
    }
    if (over !== null) {
      lastOver.current = over;
    }
    return lastOver.current !== null ? [{ id: lastOver.current }] : [];
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    setDraft((current) => {
      const base = current ?? saved;
      const from = shelfOf(base, id);
      const to = shelfOf(base, overId);
      if (!from || !to || from === to) return current;
      const target = base[to] ?? [];
      const overIndex = target.indexOf(overId);
      const moved = active.rect.current.translated;
      const below = moved
        ? moved.top > over.rect.top + over.rect.height / 2
        : false;
      return moveFish(
        base,
        id,
        to,
        overIndex < 0 ? target.length : overIndex + (below ? 1 : 0),
      );
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const base = draft ?? saved;
    setDraft(null);
    setDrag(null);
    lastOver.current = null;
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const shelf = shelfOf(base, id);
    let next = base;
    if (shelf && id !== overId && shelf === shelfOf(base, overId)) {
      const ids = base[shelf] ?? [];
      const to = ids.indexOf(overId);
      if (to >= 0) {
        next = { ...base, [shelf]: arrayMove(ids, ids.indexOf(id), to) };
      }
    }
    if (!sameLayout(next, saved)) arrangeFish(layoutPlacements(next, sections));
  };

  const rows = (ids: ReadonlyArray<string>) =>
    ids.map((id) => {
      const fish = byId.get(id);
      if (!fish) return null;
      return (
        <SortableFish
          key={id}
          id={id}
          render={(dragProps) => (
            <FishRow
              fish={fish}
              active={fish.id === activeId}
              dragProps={dragProps}
            />
          )}
        />
      );
    });

  const dragged = drag ? byId.get(drag.id) : undefined;

  return (
    <Sidebar.Group>
      <SidebarSectionMenu
        section="fish"
        search
        searchLabel="Search Fish operations"
        buildItems={sectionItems}
      >
        <Sidebar.GroupHeader>
          <Sidebar.GroupLabel>Fish</Sidebar.GroupLabel>
          <SpecMenu align="end" buildItems={newItems}>
            <Menu.Trigger icon size="sm" variant="ghost" aria-label="New">
              <IconPlus />
            </Menu.Trigger>
          </SpecMenu>
        </Sidebar.GroupHeader>
      </SidebarSectionMenu>
      <Sidebar.GroupContent aria-label="Fish">
        <DndContext
          accessibility={{
            announcements: createSortableAnnouncements(ordered, labelFor),
            screenReaderInstructions:
              SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
          }}
          collisionDetection={collisionDetection}
          sensors={sensors}
          onDragStart={({ active, activatorEvent }) => {
            const id = String(active.id);
            setDraft(saved);
            setDrag({
              id,
              pinned: shelfOf(saved, id) === PINNED,
              keyboard: activatorEvent.type.startsWith("key"),
            });
          }}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDraft(null);
            setDrag(null);
            lastOver.current = null;
          }}
        >
          {pinned.length > 0 || drag ? (
            <Shelf id={PINNED}>
              <SortableContext items={pinned} strategy={rectSortingStrategy}>
                {pinned.length > 0 ? (
                  <Sidebar.Tiles>
                    {pinned.map((id) => {
                      const fish = byId.get(id);
                      if (!fish) return null;
                      return (
                        <SortableFish
                          key={id}
                          id={id}
                          render={(dragProps) => (
                            <FishTile
                              fish={fish}
                              active={fish.id === activeId}
                              dragProps={dragProps}
                            />
                          )}
                        />
                      );
                    })}
                  </Sidebar.Tiles>
                ) : (
                  <Sidebar.Empty>Drag here to pin</Sidebar.Empty>
                )}
              </SortableContext>
            </Shelf>
          ) : null}
          <Shelf id={LOOSE}>
            <SortableContext
              items={loose}
              strategy={verticalListSortingStrategy}
            >
              {rows(loose)}
            </SortableContext>
            {drag && loose.length === 0 && sections.length > 0 ? (
              <Sidebar.Empty>Drag here to leave its section</Sidebar.Empty>
            ) : null}
          </Shelf>
          {sections.map((section) => {
            const ids = layout[section.id] ?? [];
            return (
              <SectionGroup
                key={section.id}
                section={section}
                empty={ids.length === 0}
              >
                <SortableContext
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  {rows(ids)}
                </SortableContext>
              </SectionGroup>
            );
          })}
          {createPortal(
            <DragOverlay
              dropAnimation={
                reduceMotion || drag?.keyboard ? null : SORTABLE_DROP_ANIMATION
              }
            >
              {dragged ? (
                <div className={styles.overlay}>
                  {drag?.pinned ? (
                    <FishTile
                      fish={dragged}
                      active={dragged.id === activeId}
                      dragProps={{ tabIndex: -1 }}
                    />
                  ) : (
                    <FishRow
                      fish={dragged}
                      active={dragged.id === activeId}
                      dragProps={{ tabIndex: -1 }}
                    />
                  )}
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
}
