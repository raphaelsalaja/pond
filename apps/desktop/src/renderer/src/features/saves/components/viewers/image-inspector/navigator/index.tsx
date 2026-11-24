import type { ImagePose } from "@/features/saves/lib/viewer-memory";
import {
  poseFromNavigatorPoint,
  viewportFraction,
  viewportOverflows,
} from "./navigator-geometry";
import styles from "./styles.module.css";

interface NavigatorProps {
  src: string;
  pose: ImagePose;
  stage: { width: number; height: number };
  bounds: { width: number; height: number };
  onPose: (pose: ImagePose) => void;
}

function clampCenter(value: number, length: number) {
  return Math.max(length / 2, Math.min(1 - length / 2, value));
}

export function Navigator({
  src,
  pose,
  stage,
  bounds,
  onPose,
}: NavigatorProps) {
  const box = viewportFraction(pose, stage, bounds);
  if (!viewportOverflows(box)) {
    return null;
  }
  return (
    <section className={styles.root} aria-label="Navigator">
      <button
        type="button"
        className={styles.map}
        aria-label="Move view. Use arrow keys to pan, Shift for larger steps, or Enter to center."
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (!direction) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 0.1 : 0.02;
          const x = clampCenter(
            box.x + box.width / 2 + (direction[0] ?? 0) * step,
            box.width,
          );
          const y = clampCenter(
            box.y + box.height / 2 + (direction[1] ?? 0) * step,
            box.height,
          );
          onPose(poseFromNavigatorPoint(x, y, pose.zoom, bounds));
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            onPose({ ...pose, x: 0, y: 0 });
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) {
            return;
          }
          const x = clampCenter(
            (event.clientX - rect.left) / rect.width,
            box.width,
          );
          const y = clampCenter(
            (event.clientY - rect.top) / rect.height,
            box.height,
          );
          onPose(poseFromNavigatorPoint(x, y, pose.zoom, bounds));
        }}
      >
        <img src={src} alt="" className={styles.image} draggable={false} />
        <span
          className={styles.viewport}
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      </button>
    </section>
  );
}
