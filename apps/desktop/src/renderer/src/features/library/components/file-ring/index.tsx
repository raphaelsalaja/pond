import { IconExport, IconFolderPlus } from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { clsx as cn } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { recentFolderIds } from "@/features/library/lib/recent-folders";
import { useFolders } from "@/features/library/state/folders";
import {
  announceSaveDragTarget,
  assignSavesToFolder,
  createFolderWithSaves,
  currentSaveDragSession,
  endSaveDrag,
  exportSelectionFiles,
  isLibrarySaveDrag,
  type SaveDragSession,
  saveDropIds,
  useSaveDragSession,
} from "@/features/saves";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import {
  HUB_RADIUS,
  RING_SIZE,
  RING_SLOTS,
  type RingSlot,
  ringHitAt,
  sectorPath,
  slotAnchor,
} from "./geometry";
import {
  ACTION_SLOTS,
  acceptsDrop,
  dropOnRing,
  FOLDER_SLOTS,
  layoutRing,
  pickRingFolders,
  type RingAction,
  type RingDropHandlers,
  type RingTarget,
} from "./slots";
import styles from "./styles.module.css";

/** Long enough to read the folder name on drop, short enough to stay out of the next drag. */
const HOLD_MS = 320;
const PREVIEW_COUNT = 2;
const SAVES = { one: "Save", other: "Saves" };
const ITEMS = { one: "Item", other: "Items" };
const SECTOR_PATHS = new Map(
  RING_SLOTS.map((slot) => [slot, sectorPath(slot)]),
);
const HUB_STYLE = { width: `${((HUB_RADIUS * 2) / RING_SIZE) * 100}%` };

interface ActionCopy {
  label: string;
  Icon: typeof IconExport;
}

const ACTIONS = {
  "new-folder": { label: "New Folder", Icon: IconFolderPlus },
  "export-files": { label: "Export Files", Icon: IconExport },
} satisfies Record<RingAction, ActionCopy>;

const DROP_HANDLERS: RingDropHandlers<Folder> = {
  addToFolder: (ids, folder) => void assignSavesToFolder(ids, folder),
  createFolder: (ids) => createFolderWithSaves(ids),
  exportFiles: (ids) => void exportSelectionFiles(ids),
};

interface RingSession {
  drag: SaveDragSession;
  folderIds: string[];
}

interface HubCopy {
  title: string;
  detail?: string;
}

function hubCopy(
  target: RingTarget<Folder> | undefined,
  counts: Record<string, number> | null,
  saveCount: number,
): HubCopy {
  if (!target) return { title: "File To" };
  if (target.kind === "action")
    return {
      title: ACTIONS[target.action].label,
      detail: formatPlural(saveCount, SAVES),
    };
  const count = counts?.[target.folder.id];
  return {
    title: target.folder.name,
    detail: count === undefined ? undefined : formatPlural(count, ITEMS),
  };
}

function anchorStyle(slot: RingSlot) {
  const anchor = slotAnchor(slot);
  return { left: `${anchor.left}%`, top: `${anchor.top}%` };
}

function ActionSlot({
  slot,
  action,
  disabled,
}: {
  slot: RingSlot;
  action: RingAction;
  disabled: boolean;
}) {
  const { label, Icon } = ACTIONS[action];
  return (
    <li
      className={cn(styles.slot, styles.action)}
      data-disabled={disabled || undefined}
      style={anchorStyle(slot)}
    >
      <Icon />
      <span className={styles.label}>{label}</span>
      {disabled ? (
        <span className={styles.name}>, unavailable for these Saves</span>
      ) : null}
    </li>
  );
}

function FolderSlot({
  slot,
  folder,
  icon,
  previewIds,
  count,
}: {
  slot: RingSlot;
  folder: Folder;
  icon?: string;
  previewIds: readonly string[];
  count: number | undefined;
}) {
  const theme = useResolvedTheme();
  const first = useSave(previewIds[0]);
  const second = useSave(previewIds[1]);
  const thumbs = [first, second].flatMap((save) => {
    const src = save ? folderCoverUrl(save, 96, theme) : null;
    return save && src ? [{ id: save.id, src }] : [];
  });
  return (
    <li className={styles.slot} style={anchorStyle(slot)}>
      <span className={styles.thumbs}>
        {thumbs.length > 0 ? (
          thumbs.map((thumb) => (
            <img
              key={thumb.id}
              className={styles.thumb}
              src={thumb.src}
              alt=""
              draggable={false}
            />
          ))
        ) : (
          <span className={styles.fallback}>
            <FolderIcon name={icon} color={folder.color} />
          </span>
        )}
      </span>
      <span className={styles.name}>
        {count === undefined
          ? folder.name
          : `${folder.name}, ${formatPlural(count, ITEMS)}`}
      </span>
    </li>
  );
}

/** Library-only drop targets that open over the grid while a Save drag that started in it is in flight. */
export function FileRing() {
  const [viewer] = usePrefs("viewer");
  const [folderViews] = usePrefs("folderViews");
  const folderRows = useFolders();
  const drag = useSaveDragSession();
  const [ring, setRing] = useState<RingSession | null>(null);
  const [inside, setInside] = useState(true);
  const [hovered, setHovered] = useState<RingSlot | null>(null);
  const [held, setHeld] = useState<RingSlot | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const discRef = useRef<HTMLFieldSetElement>(null);
  const announcedRef = useRef<RingSlot | null>(null);
  const latest = useRef({ folderRows, folderViews });
  latest.current = { folderRows, folderViews };

  const enabled = viewer.dragToFile;
  const live = enabled && ring !== null && drag === ring.drag;
  const open = (live && inside) || held !== null;

  useEffect(() => {
    if (!enabled) return;
    /** Runs after the card's own handler, so the session it started is already current. */
    const onDragStart = (event: DragEvent) => {
      const session = currentSaveDragSession();
      if (
        !session ||
        !(event.target instanceof Element) ||
        !event.target.closest("[data-library-grid]")
      )
        return;
      const { folderRows, folderViews } = latest.current;
      const folderIds = pickRingFolders(
        folderRows,
        folderViews,
        recentFolderIds(),
      ).map((folder) => folder.id);
      if (folderIds.length === 0) return;
      announcedRef.current = null;
      setRing({ drag: session, folderIds });
      setInside(true);
      setHovered(null);
      setHeld(null);
    };
    window.addEventListener("dragstart", onDragStart);
    return () => window.removeEventListener("dragstart", onDragStart);
  }, [enabled]);

  /** Native drags report no `relatedTarget`, so leaving the window shows up as enter and leave events no longer balancing. */
  useEffect(() => {
    if (!live) return;
    let depth = 1;
    const over = (event: DragEvent) => {
      depth = 1;
      setInside(true);
      const disc = discRef.current;
      if (
        !disc ||
        !(event.target instanceof Node) ||
        !disc.contains(event.target)
      )
        setHovered(null);
    };
    const enter = () => {
      depth += 1;
      setInside(true);
    };
    const leave = () => {
      depth -= 1;
      if (depth > 0) return;
      depth = 0;
      setInside(false);
      setHovered(null);
    };
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragleave", leave, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("dragenter", enter, true);
      window.removeEventListener("dragleave", leave, true);
    };
  }, [live]);

  useEffect(() => {
    if (!ring) return;
    let active = true;
    const covers = ring.folderIds.flatMap(
      (id) => latest.current.folderViews[id]?.coverSaveId ?? [],
    );
    void window.pond
      .query("saves.sidebarCounts", {})
      .then((next) => {
        if (active && next) setCounts(next.folders);
      })
      .catch((error) => console.warn("[pond] file ring counts failed", error));
    void window.pond
      .query("folders.previews", {
        folderIds: ring.folderIds,
        limit: PREVIEW_COUNT,
      })
      .then(async (next) => {
        await ensureSaves([...covers, ...Object.values(next).flat()]);
        if (active) setPreviews(next);
      })
      .catch((error) =>
        console.warn("[pond] file ring previews failed", error),
      );
    return () => {
      active = false;
    };
  }, [ring]);

  useEffect(() => {
    if (held === null) return;
    const timer = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(timer);
  }, [held]);

  const layout = useMemo(() => {
    const byId = new Map(folderRows.map((folder) => [folder.id, folder]));
    const ids = ring?.folderIds ?? [];
    const folders = ids.flatMap((id) => byId.get(id) ?? []);
    return layoutRing(folders, ring?.drag.hasFiles ?? false);
  }, [folderRows, ring]);

  function targetAt(event: React.DragEvent) {
    const disc = discRef.current;
    if (!disc) return null;
    const hit = ringHitAt(
      event.clientX,
      event.clientY,
      disc.getBoundingClientRect(),
    );
    if (hit === null || hit === "hub") return null;
    const target = layout[hit];
    return acceptsDrop(target) ? { slot: hit, target } : null;
  }

  function onDragOver(event: React.DragEvent) {
    if (!live || !isLibrarySaveDrag(event.dataTransfer)) return;
    const hit = targetAt(event);
    setHovered(hit?.slot ?? null);
    if (announcedRef.current !== (hit?.slot ?? null)) {
      announcedRef.current = hit?.slot ?? null;
      if (hit?.target.kind === "folder" && ring)
        announceSaveDragTarget(hit.target.folder.name, ring.drag.ids.length);
    }
    if (!hit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: React.DragEvent) {
    const hit = live ? targetAt(event) : null;
    if (!hit) return;
    event.preventDefault();
    const ids = saveDropIds(event.dataTransfer);
    const dropped = dropOnRing(hit.target, ids, DROP_HANDLERS);
    setHovered(null);
    if (dropped) setHeld(hit.slot);
    endSaveDrag();
  }

  const shown = held ?? hovered;
  const copy = hubCopy(
    shown ? layout[shown] : undefined,
    counts,
    ring?.drag.ids.length ?? 0,
  );

  return (
    <div className={styles.root} data-open={open || undefined}>
      <div className={styles.scrim} data-open={open || undefined} />
      <fieldset
        ref={discRef}
        aria-label="File To"
        className={styles.disc}
        data-open={open || undefined}
        data-live={live || undefined}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg
          className={styles.sectors}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
        >
          {RING_SLOTS.map((slot) => (
            <path
              key={slot}
              className={styles.sector}
              d={SECTOR_PATHS.get(slot)}
              data-kind={layout[slot]?.kind ?? "empty"}
              data-hovered={shown === slot || undefined}
            />
          ))}
        </svg>
        <ul className={styles.slots}>
          {ACTION_SLOTS.map((slot) => {
            const target = layout[slot];
            return target?.kind === "action" ? (
              <ActionSlot
                key={slot}
                slot={slot}
                action={target.action}
                disabled={target.disabled}
              />
            ) : null;
          })}
          {FOLDER_SLOTS.map((slot) => {
            const target = layout[slot];
            if (target?.kind !== "folder") return null;
            const { folder } = target;
            const coverSaveId = folderViews[folder.id]?.coverSaveId;
            const previewIds = [
              ...(coverSaveId ? [coverSaveId] : []),
              ...(previews[folder.id] ?? []).filter((id) => id !== coverSaveId),
            ].slice(0, PREVIEW_COUNT);
            return (
              <FolderSlot
                key={slot}
                slot={slot}
                folder={folder}
                icon={folderViews[folder.id]?.icon}
                previewIds={previewIds}
                count={counts?.[folder.id]}
              />
            );
          })}
        </ul>
        <div className={styles.hub} style={HUB_STYLE} aria-hidden="true">
          <span className={styles.title}>{copy.title}</span>
          {copy.detail ? (
            <span className={styles.detail}>{copy.detail}</span>
          ) : null}
        </div>
      </fieldset>
    </div>
  );
}
