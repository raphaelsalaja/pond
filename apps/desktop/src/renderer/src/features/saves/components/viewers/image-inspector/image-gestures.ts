import type { ImageCrop } from "@pond/schema/db";
import { isElement } from "@pond/ui/dom";
import type {
  Dispatch,
  PointerEventHandler,
  RefObject,
  SetStateAction,
} from "react";
import {
  clampImagePoint,
  cropContains,
  inImage,
  isFullImageCrop,
  lockCropAspect,
  nudgeCrop,
  resizeCrop,
  snapCrop,
  snapImagePoint,
} from "@/features/saves/lib/image-regions";
import type { CropHandle } from "@/features/saves/lib/image-regions";
import { zoomImageAt } from "@/features/saves/lib/viewer-memory";
import type { ImagePose } from "@/features/saves/lib/viewer-memory";
import { cropHandleFromTarget } from "./crop-handles";
import type { InspectorMode } from "./types";

export interface ImageDrag {
  button: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  cropX: number;
  cropY: number;
  crop?: ImageCrop;
  handle?: CropHandle;
}

interface ImageGestureOptions {
  active: boolean;
  draft: ImageCrop | null;
  dragRef: RefObject<ImageDrag | null>;
  gestureMovedRef: RefObject<boolean>;
  mode: InspectorMode;
  onNavigate: (delta: number) => void;
  pointFromClient: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number };
  poseZoom: number;
  ratio: number | null;
  setDraft: Dispatch<SetStateAction<ImageCrop | null>>;
  setPosition: (
    update: (previous: ImagePose) => ImagePose,
    live?: boolean,
  ) => void;
}

interface ImageGestures {
  onContextMenu: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
}

export function useImageGestures({
  active,
  draft,
  dragRef,
  gestureMovedRef,
  mode,
  onNavigate,
  pointFromClient,
  poseZoom,
  ratio,
  setDraft,
  setPosition,
}: ImageGestureOptions): ImageGestures {
  return {
    onContextMenu: (event) => {
      if (gestureMovedRef.current) {
        event.preventDefault();
      }
    },
    onPointerDown: (event) => {
      if (!active) return;
      const handle = cropHandleFromTarget(event.target);
      if (
        isElement(event.target) &&
        event.target.closest("button") &&
        !handle
      ) {
        return;
      }
      if (mode !== "view" && event.button !== 0) {
        return;
      }
      if (event.button !== 0 && event.button !== 2) {
        return;
      }
      if (event.button === 0 && mode === "view" && poseZoom <= 1) {
        return;
      }
      const raw = pointFromClient(event.clientX, event.clientY);
      const point = snapImagePoint(clampImagePoint(raw));
      const moving =
        mode === "crop" &&
        inImage(raw) &&
        !handle &&
        !!draft &&
        !isFullImageCrop(draft) &&
        cropContains(draft, point);
      event.preventDefault();
      event.stopPropagation();
      gestureMovedRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        cropX: point.x,
        cropY: point.y,
        crop: handle || moving ? (draft ?? undefined) : undefined,
        handle: handle ?? undefined,
      };
    },
    onPointerMove: (event) => {
      const origin = dragRef.current;
      if (!origin) {
        return;
      }
      event.stopPropagation();
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (origin.button === 2) {
        if (
          Math.abs(event.clientX - origin.startX) +
            Math.abs(event.clientY - origin.startY) >
          4
        ) {
          gestureMovedRef.current = true;
        }
        if (
          Math.abs(event.clientY - origin.startY) >
          Math.abs(event.clientX - origin.startX)
        ) {
          setPosition(
            (previous) =>
              zoomImageAt(previous, previous.zoom * Math.exp(-dy * 0.01), {
                x: 0,
                y: 0,
              }),
            true,
          );
        }
      } else if (mode !== "view") {
        const point = snapImagePoint(
          clampImagePoint(pointFromClient(event.clientX, event.clientY)),
        );
        if (origin.handle && origin.crop) {
          const next = resizeCrop(origin.crop, origin.handle, point);
          setDraft(
            event.shiftKey && ratio ? lockCropAspect(next, ratio) : next,
          );
        } else if (origin.crop) {
          setDraft(
            snapCrop(
              nudgeCrop(
                origin.crop,
                point.x - origin.cropX,
                point.y - origin.cropY,
              ),
            ),
          );
        } else {
          const next = {
            x: Math.min(point.x, origin.cropX),
            y: Math.min(point.y, origin.cropY),
            w: Math.abs(point.x - origin.cropX),
            h: Math.abs(point.y - origin.cropY),
          };
          setDraft(
            event.shiftKey && ratio ? lockCropAspect(next, ratio) : next,
          );
        }
      } else {
        setPosition(
          (previous) => ({
            ...previous,
            x: previous.x + dx,
            y: previous.y + dy,
          }),
          true,
        );
      }
      origin.x = event.clientX;
      origin.y = event.clientY;
    },
    onPointerUp: (event) => {
      const origin = dragRef.current;
      if (
        origin?.button === 2 &&
        Math.abs(event.clientX - origin.startX) > 80 &&
        Math.abs(event.clientX - origin.startX) >
          Math.abs(event.clientY - origin.startY)
      ) {
        onNavigate(event.clientX > origin.startX ? -1 : 1);
      }
      dragRef.current = null;
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerCancel: () => {
      dragRef.current = null;
    },
  };
}
