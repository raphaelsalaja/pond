import { classifyLibraryFile } from "@shared/file-format";
import { motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useLibraryCardCallbacks } from "@/features/saves/components/card/context";
import { useSaveCardModel } from "@/features/saves/components/card/model";
import { Card } from "@/features/saves/components/card/parts";
import type {
  LibraryCardSlot,
  LibraryCardView,
} from "@/features/saves/components/card/types";
import { GridCard } from "@/features/saves/components/card/views/grid";
import { JustifiedCard } from "@/features/saves/components/card/views/justified";
import { ListCard } from "@/features/saves/components/card/views/list";
import { WaterfallCard } from "@/features/saves/components/card/views/waterfall";
import { SaveContextMenu } from "@/features/saves/components/context-menu";
import { useSave } from "@/features/saves/hooks/use-saves";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import { beginSaveDrag, endSaveDrag } from "@/features/saves/lib/start-drag";
import { displayTitleForSave } from "@/features/saves/lib/text";
import {
  useIsCursor,
  useIsPrimary,
  useIsSelected,
} from "@/features/saves/state/selection";
import { useIsDepartingSave } from "@/features/saves/state/tag-picker";
import { useIsTumbling } from "@/features/saves/state/trash-tumble";
import type { Save } from "@/features/saves/types";

interface PackedCardStyle extends React.CSSProperties {
  "--card-preview-height": string;
}

const MotionCardRoot = motion.create(Card.Root);

const TUMBLE_TRANSITION = {
  duration: 0.34,
  ease: [0.5, 0, 0.85, 0.4] as const,
};

function tumbleTarget(id: string) {
  const lean = (id.charCodeAt(id.length - 1) ?? 0) % 2 === 0 ? 1 : -1;
  return { opacity: 0, y: 120, scale: 0.55, rotate: 8 * lean };
}

interface SaveCardProps {
  id: string;
  view: LibraryCardView;
  slot: LibraryCardSlot;
  position?: number;
  total?: number;
}

export const SaveCard = memo(function SaveCard({
  id,
  view,
  slot,
  position,
  total,
}: SaveCardProps) {
  const { onClick, onAuxClick, onDoubleClick, onPick } =
    useLibraryCardCallbacks();
  const save = useSave(id);
  const isMulti = useIsSelected(id);
  const isPrimary = useIsPrimary(id);
  const isCursor = useIsCursor(id);
  const departing = useIsDepartingSave(id);
  const tumbling = useIsTumbling(id);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useMemo(() => {
    const file = save?.files.find(
      (entry) =>
        classifyLibraryFile(entry.path, entry.mimeType).mediaType === "audio",
    );
    return save && file ? buildPondUrl(save.id, file) : null;
  }, [save]);
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );
  const startAudioPreview = useCallback(() => {
    if (!audioUrl) return;
    const audio = audioRef.current ?? new Audio();
    if (audio.dataset.previewUrl !== audioUrl) {
      audio.src = audioUrl;
      audio.dataset.previewUrl = audioUrl;
    }
    audio.preload = "metadata";
    audio.volume = 0.7;
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  }, [audioUrl]);
  const stopAudioPreview = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const style = useMemo<PackedCardStyle>(() => {
    const base: PackedCardStyle = {
      width: `${slot.width}px`,
      height: `${slot.height}px`,
      "--card-preview-height": `${slot.previewHeight}px`,
    };
    base.position = "absolute";
    base.top = 0;
    base.left = 0;
    /** A 3D translate gives every card its own GPU layer, which every frame on the page then pays to rebuild. */
    base.transform = `translate(${slot.left}px, ${slot.top}px)`;
    return base;
  }, [slot]);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      beginSaveDrag(id, e);
    },
    [id],
  );

  const onSelectClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick(id, e);
      e.currentTarget
        .closest<HTMLElement>("[data-save-collection]")
        ?.focus({ preventScroll: true });
    },
    [onClick, id],
  );
  const onSelectAuxClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => onAuxClick(id, e),
    [onAuxClick, id],
  );
  const onSelectDoubleClick = useCallback(
    () => onDoubleClick(id),
    [onDoubleClick, id],
  );
  const onPickClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      onPick?.(id, e);
      e.currentTarget
        .closest<HTMLElement>("[data-save-collection]")
        ?.focus({ preventScroll: true });
    },
    [onPick, id],
  );

  if (!save) return null;

  const children = (
    <>
      <Card.Select
        id={`save-option-${id}`}
        role="option"
        aria-label={displayTitleForSave(save)}
        aria-selected={isMulti}
        aria-posinset={position}
        aria-setsize={total}
        tabIndex={-1}
        onClick={onSelectClick}
        onAuxClick={onSelectAuxClick}
        onDoubleClick={onSelectDoubleClick}
      >
        <SaveCardBody save={save} view={view} width={slot.width} />
      </Card.Select>
      {onPick ? (
        <Card.Pick
          checked={isMulti}
          size={view === "list" ? "sm" : "md"}
          onClick={onPickClick}
        />
      ) : null}
    </>
  );

  const rootProps = {
    role: "presentation",
    selected: isPrimary,
    multi: isMulti,
    dimmed: departing,
    "data-library-card": "",
    "data-save-id": id,
    "data-view": view,
    "data-cursor": isCursor || undefined,
    "data-pickable": onPick ? "" : undefined,
    style,
    draggable: true,
    onNativeDragStart: onDragStart,
    onNativeDragEnd: endSaveDrag,
    onMouseEnter: startAudioPreview,
    onMouseLeave: stopAudioPreview,
    children,
  };

  return (
    <SaveContextMenu save={save}>
      {tumbling ? (
        <MotionCardRoot
          {...rootProps}
          initial={false}
          animate={tumbleTarget(id)}
          transition={TUMBLE_TRANSITION}
        />
      ) : (
        <Card.Root {...rootProps} />
      )}
    </SaveContextMenu>
  );
});

const SaveCardBody = memo(function SaveCardBody({
  save,
  view,
  width,
}: {
  save: Save;
  view: LibraryCardView;
  width?: number;
}) {
  const model = useSaveCardModel(save, view === "grid");
  if (view === "grid") return <GridCard model={model} width={width} />;
  if (view === "waterfall") {
    return <WaterfallCard model={model} width={width} />;
  }
  if (view === "justified") {
    return <JustifiedCard model={model} width={width} />;
  }
  return <ListCard model={model} width={width} />;
});
