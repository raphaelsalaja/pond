import {
  type FileRingOverlayFolder,
  type FileRingOverlaySnapshot,
  overlayMenuAction,
} from "@shared/file-ring-overlay-contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { RING_ACTIONS } from "@/features/library/components/file-ring/actions";
import { Disc } from "@/features/library/components/file-ring/disc";
import {
  RING_SLOTS,
  type RingSlot,
  ringHitAt,
} from "@/features/library/components/file-ring/geometry";
import { hubCopy } from "@/features/library/components/file-ring/hub";
import {
  autoRingItems,
  layoutRing,
  type RingAction,
  type RingLayout,
  type RingTarget,
} from "@/features/library/components/file-ring/slots";
import {
  recentFolderIds,
  rememberFolderDestinations,
} from "@/features/library/lib/recent-folders";
import { FolderIcon } from "@/shared/lib/folder-icons";
import type { PondRingApi } from "../../../../preload/file-ring";
import { paintShell } from "../boot-shell";
import { dropPayload } from "./drop-payload";
import { type DropStatus, dropStatus } from "./status";
import styles from "./styles.module.css";

declare global {
  interface Window {
    pondRing?: PondRingApi;
  }
}

/** Long enough to read the result in the hub before the ring closes. */
const RESULT_MS = 1400;
const EMPTY_LAYOUT: RingLayout<FileRingOverlayFolder> = {};

type Target = RingTarget<FileRingOverlayFolder>;

interface Result {
  slot: RingSlot;
  folder: FileRingOverlayFolder;
  status: DropStatus;
}

function runsHere(action: RingAction): boolean {
  return overlayMenuAction(action) !== null;
}

function overlayLayout(snapshot: FileRingOverlaySnapshot) {
  const presentations = Object.fromEntries(
    snapshot.folders.map((folder) => [folder.id, folder]),
  );
  const items =
    snapshot.items ??
    autoRingItems(snapshot.folders, presentations, recentFolderIds());
  return layoutRing(items, snapshot.folders, runsHere);
}

function slotId(slot: RingSlot): string {
  return `file-ring-${slot}`;
}

function dismiss() {
  void window.pondRing?.dismiss();
}

/** The File To ring as its own window over other apps: click a sector to open it, or drop files and links on a folder. */
export function FileRingOverlay() {
  const [snapshot, setSnapshot] = useState<FileRingOverlaySnapshot | null>(
    null,
  );
  const [active, setActive] = useState<RingSlot | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const discRef = useRef<HTMLFieldSetElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void window.pondRing?.ready().then((next) => {
      if (!live || !next) return;
      paintShell(next.shell);
      setSnapshot(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.focus();
      void window.pondRing?.present();
    });
    return () => cancelAnimationFrame(frame);
  }, [snapshot]);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(dismiss, RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  const layout = useMemo(
    () => (snapshot ? overlayLayout(snapshot) : EMPTY_LAYOUT),
    [snapshot],
  );
  const filled = RING_SLOTS.filter((slot) => layout[slot]);

  function slotAt(event: React.MouseEvent): RingSlot | "hub" | null {
    const disc = discRef.current;
    if (!disc) return null;
    return ringHitAt(
      event.clientX,
      event.clientY,
      disc.getBoundingClientRect(),
    );
  }

  function activate(target: Target | undefined) {
    if (!target || result) return;
    if (target.kind === "folder")
      void window.pondRing?.activate({
        kind: "folder",
        folderId: target.folder.id,
      });
    else if (!target.disabled)
      void window.pondRing?.activate({
        kind: "action",
        action: target.action,
      });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (result) return;
    const hit = slotAt(event);
    setActive(hit && hit !== "hub" && layout[hit] ? hit : null);
  }

  function onClick(event: React.MouseEvent) {
    const hit = slotAt(event);
    if (hit === null || hit === "hub") {
      dismiss();
      return;
    }
    activate(layout[hit]);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (result || filled.length === 0) return;
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step !== 0) {
      event.preventDefault();
      const index = active ? filled.indexOf(active) : step > 0 ? -1 : 0;
      const next = (index + step + filled.length) % filled.length;
      setActive(filled[next] ?? null);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && active) {
      event.preventDefault();
      activate(layout[active]);
    }
  }

  function folderAt(event: React.DragEvent) {
    const hit = slotAt(event);
    if (hit === null || hit === "hub") return null;
    const target = layout[hit];
    return target?.kind === "folder"
      ? { slot: hit, folder: target.folder }
      : null;
  }

  function onDragOver(event: React.DragEvent) {
    if (result) return;
    const hit = folderAt(event);
    setActive(hit?.slot ?? null);
    if (!hit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async function onDrop(event: React.DragEvent) {
    const hit = result ? null : folderAt(event);
    if (!hit) return;
    event.preventDefault();
    const api = window.pondRing;
    if (!api) return;
    const payload = dropPayload(event.dataTransfer, hit.folder.id, (file) =>
      api.pathForFile(file),
    );
    const reply = payload ? await api.drop(payload) : null;
    if (reply?.ok && reply.imported > 0)
      rememberFolderDestinations([hit.folder.id]);
    setResult({ ...hit, status: dropStatus(reply, hit.folder.name) });
  }

  const shown = result?.slot ?? active;
  const target = shown ? layout[shown] : undefined;
  const hover = hubCopy(target, snapshot?.counts ?? null, null);
  const copy = result
    ? { title: result.folder.name, detail: result.status.detail }
    : target?.kind === "action" && target.disabled
      ? { title: hover.title, detail: "Library only" }
      : hover;

  return (
    <div
      ref={menuRef}
      className={styles.root}
      role="menu"
      aria-label="File To"
      tabIndex={0}
      aria-activedescendant={active ? slotId(active) : undefined}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setActive(null)}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={() => setActive(null)}
      onDrop={(event) => void onDrop(event)}
    >
      <Disc.Root ref={discRef} open={snapshot !== null} live surface="solid">
        <Disc.Sectors layout={layout} active={shown} />
        <Disc.Slots role="none">
          {RING_SLOTS.map((slot) => {
            const item = layout[slot];
            if (!item) return null;
            if (item.kind === "action") {
              const { label, Icon } = RING_ACTIONS[item.action];
              return (
                <Disc.Slot
                  key={slot}
                  id={slotId(slot)}
                  slot={slot}
                  kind="action"
                  disabled={item.disabled}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                >
                  <Icon />
                  <Disc.Label>{label}</Disc.Label>
                </Disc.Slot>
              );
            }
            const { folder } = item;
            return (
              <Disc.Slot
                key={slot}
                id={slotId(slot)}
                slot={slot}
                kind="folder"
                role="menuitem"
                tabIndex={-1}
              >
                <Disc.Fallback>
                  <FolderIcon name={folder.icon} color={folder.color} />
                </Disc.Fallback>
                <Disc.Label>{folder.name}</Disc.Label>
              </Disc.Slot>
            );
          })}
        </Disc.Slots>
        <Disc.Hub title={copy.title} detail={copy.detail} />
      </Disc.Root>
      <div className={styles.status} role="status">
        {result
          ? [
              result.status.announcement.title,
              result.status.announcement.description,
            ]
              .filter(Boolean)
              .join(". ")
          : null}
      </div>
    </div>
  );
}
