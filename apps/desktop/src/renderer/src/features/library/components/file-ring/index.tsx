import type { Folder } from "@pond/schema/db";
import type { FileRingItem } from "@pond/schema/file-ring";
import { clsx as cn } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { recentFolderIds } from "@/features/library/lib/recent-folders";
import { useFolders } from "@/features/library/state/folders";
import {
  announceSaveDragTarget,
  assignSavesToFolder,
  canImportDrop,
  createFolderWithSaves,
  currentSaveDragSession,
  endSaveDrag,
  exportSelectionFiles,
  isLibrarySaveDrag,
  notifyUnsupportedDrop,
  type PasteImport,
  pasteImportOf,
  runPasteImport,
  type SaveDragSession,
  saveDropIds,
  useSaveDragSession,
} from "@/features/saves";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import { RING_ACTIONS } from "./actions";
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
  acceptsDrop,
  autoRingItems,
  dropOnRing,
  layoutRing,
  type RingAction,
  type RingDropHandlers,
  type RingLayout,
  type RingTarget,
  ringOpens,
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
const EMPTY_LAYOUT: RingLayout<Folder> = {};
const HUB_STYLE = { width: `${((HUB_RADIUS * 2) / RING_SIZE) * 100}%` };

const SAVE_DROPS: RingDropHandlers<Folder, readonly string[]> = {
  addToFolder: (ids, folder) => void assignSavesToFolder(ids, folder),
  createFolder: (ids) => createFolderWithSaves(ids),
  exportFiles: (ids) => void exportSelectionFiles(ids),
};

const IMPORT_DROPS: RingDropHandlers<Folder, PasteImport> = {
  addToFolder: (plan, folder) =>
    void runPasteImport(plan, { id: folder.id, name: folder.name }),
  createFolder: (plan) => {
    void runPasteImport(plan).then((ids) => {
      if (ids.length > 0) createFolderWithSaves(ids);
    });
  },
};

type RingSource =
  | { kind: "saves"; session: SaveDragSession }
  | { kind: "import" };

interface RingSession {
  source: RingSource;
  items: FileRingItem[];
  folderIds: string[];
}

function canExport(source: RingSource): boolean {
  return source.kind === "saves" && source.session.hasFiles;
}

interface HubCopy {
  title: string;
  detail?: string;
}

function hubCopy(
  target: RingTarget<Folder> | undefined,
  counts: Record<string, number> | null,
  saveCount: number | null,
): HubCopy {
  if (!target) return { title: "File To" };
  if (target.kind === "action")
    return {
      title: RING_ACTIONS[target.action].label,
      detail: saveCount === null ? undefined : formatPlural(saveCount, SAVES),
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
  const { label, Icon } = RING_ACTIONS[action];
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

/** Library drop targets that open over the grid during a Save drag that started in it, or a drag in from another app. */
export function FileRing() {
  const [viewer] = usePrefs("viewer");
  const [folderViews] = usePrefs("folderViews");
  const [fileRing] = usePrefs("fileRing");
  const folderRows = useFolders();
  const drag = useSaveDragSession();
  const [ring, setRing] = useState<RingSession | null>(null);
  const [importing, setImporting] = useState(false);
  const [inside, setInside] = useState(true);
  const [hovered, setHovered] = useState<RingSlot | null>(null);
  const [held, setHeld] = useState<RingSlot | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const discRef = useRef<HTMLFieldSetElement>(null);
  const announcedRef = useRef<RingSlot | null>(null);
  const importingRef = useRef(false);
  const latest = useRef({ folderRows, folderViews, fileRing });
  latest.current = { folderRows, folderViews, fileRing };

  const enabled = viewer.dragToFile;
  const source = ring?.source;
  const live =
    enabled &&
    (source?.kind === "import" ? importing : source?.session === drag);
  const open = (live && inside) || held !== null;

  useEffect(() => {
    if (!enabled) return;
    let internal = false;
    const start = (next: RingSource) => {
      const { folderRows, folderViews, fileRing } = latest.current;
      const items =
        fileRing.items ??
        autoRingItems(folderRows, folderViews, recentFolderIds());
      const layout = layoutRing(items, folderRows, canExport(next));
      if (!ringOpens(layout, fileRing.items !== null)) return;
      const folderIds = items.flatMap((item) =>
        item.kind === "folder" ? [item.folderId] : [],
      );
      announcedRef.current = null;
      importingRef.current = next.kind === "import";
      setImporting(next.kind === "import");
      setRing({ source: next, items, folderIds });
      setInside(true);
      setHovered(null);
      setHeld(null);
    };
    /** Runs after the card's own handler, so the session it started is already current and a cancelled HTML5 drag shows as prevented. */
    const onDragStart = (event: DragEvent) => {
      internal = !event.defaultPrevented;
      const session = currentSaveDragSession();
      if (
        session &&
        event.target instanceof Element &&
        event.target.closest("[data-library-grid]")
      )
        start({ kind: "saves", session });
    };
    const onDragEnd = () => {
      internal = false;
    };
    /** A drag from another app fires no `dragstart` here, so it is the one that enters with no drag of ours in flight. */
    const onDragEnter = (event: DragEvent) => {
      if (internal || importingRef.current || currentSaveDragSession()) return;
      if (!event.dataTransfer || !canImportDrop(event.dataTransfer.types))
        return;
      start({ kind: "import" });
    };
    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("drop", onDragEnd, true);
    window.addEventListener("dragenter", onDragEnter, true);
    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("drop", onDragEnd, true);
      window.removeEventListener("dragenter", onDragEnter, true);
    };
  }, [enabled]);

  /** Native drags report no `relatedTarget`, so leaving the window shows up as enter and leave events no longer balancing. */
  useEffect(() => {
    if (!live) return;
    let depth = 1;
    const endImport = () => {
      if (!importingRef.current) return;
      importingRef.current = false;
      setImporting(false);
    };
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
      endImport();
    };
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("drop", endImport);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("dragenter", enter, true);
      window.removeEventListener("dragleave", leave, true);
      window.removeEventListener("drop", endImport);
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

  const layout = useMemo(
    () =>
      ring
        ? layoutRing(ring.items, folderRows, canExport(ring.source))
        : EMPTY_LAYOUT,
    [folderRows, ring],
  );

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

  function accepts(data: DataTransfer): boolean {
    if (source?.kind === "import")
      return !isLibrarySaveDrag(data) && canImportDrop(data.types);
    return isLibrarySaveDrag(data);
  }

  function onDragOver(event: React.DragEvent) {
    if (!live || !accepts(event.dataTransfer)) return;
    const hit = targetAt(event);
    setHovered(hit?.slot ?? null);
    if (announcedRef.current !== (hit?.slot ?? null)) {
      announcedRef.current = hit?.slot ?? null;
      if (hit?.target.kind === "folder" && source?.kind === "saves")
        announceSaveDragTarget(
          hit.target.folder.name,
          source.session.ids.length,
        );
    }
    if (!hit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function dropSaves(event: React.DragEvent, target: RingTarget<Folder>) {
    const ids = saveDropIds(event.dataTransfer);
    const dropped = ids.length > 0 && dropOnRing(target, ids, SAVE_DROPS);
    endSaveDrag();
    return dropped;
  }

  function dropImport(event: React.DragEvent, target: RingTarget<Folder>) {
    const plan = pasteImportOf(event.dataTransfer);
    if (plan && plan.kind !== "clipboard")
      return dropOnRing(target, plan, IMPORT_DROPS);
    notifyUnsupportedDrop();
    return false;
  }

  function onDrop(event: React.DragEvent) {
    const hit = live ? targetAt(event) : null;
    if (!hit) return;
    event.preventDefault();
    const dropped =
      source?.kind === "import"
        ? dropImport(event, hit.target)
        : dropSaves(event, hit.target);
    setHovered(null);
    if (dropped) setHeld(hit.slot);
  }

  const shown = held ?? hovered;
  const copy = hubCopy(
    shown ? layout[shown] : undefined,
    counts,
    source?.kind === "saves" ? source.session.ids.length : null,
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
          {RING_SLOTS.map((slot) => {
            const target = layout[slot];
            if (!target) return null;
            if (target.kind === "action")
              return (
                <ActionSlot
                  key={slot}
                  slot={slot}
                  action={target.action}
                  disabled={target.disabled}
                />
              );
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
