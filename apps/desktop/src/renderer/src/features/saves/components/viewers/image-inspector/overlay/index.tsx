import type { ImageCrop } from "@pond/schema/db";
import {
  CROP_HANDLES,
  isFullImageCrop,
} from "@/features/saves/lib/image-regions";
import { CROP_HANDLE_LABEL } from "../crop-handles";
import type { InspectorMode } from "../types";
import styles from "./styles.module.css";

interface ImageOverlayProps {
  draft: ImageCrop | null;
  mode: InspectorMode;
}

export function ImageOverlay({ draft, mode }: ImageOverlayProps) {
  if (!draft || mode !== "crop") return null;
  return (
    <div
      className={styles.selection}
      data-cropping=""
      data-full={isFullImageCrop(draft) || undefined}
      style={{
        left: `${draft.x * 100}%`,
        top: `${draft.y * 100}%`,
        width: `${draft.w * 100}%`,
        height: `${draft.h * 100}%`,
      }}
    >
      {CROP_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={styles.handle}
          data-handle={handle}
          aria-label={CROP_HANDLE_LABEL[handle]}
        />
      ))}
    </div>
  );
}
