import type { ImageCrop } from "@pond/schema/db";
import { isNode } from "@pond/ui/dom";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { containImage, nudgeCrop } from "@/features/saves/lib/image-regions";
import type { InspectorMode } from "./types";

type CropDelta = readonly [number, number, number, number];

interface CropKeyboardOptions {
  active: boolean;
  draft: ImageCrop | null;
  frame: RefObject<HTMLDivElement | null>;
  mode: InspectorMode;
  onApply: () => void;
  ratio: number | null;
  setDraft: Dispatch<SetStateAction<ImageCrop | null>>;
  setMode: Dispatch<SetStateAction<InspectorMode>>;
}

export function useCropKeyboard({
  active,
  draft,
  frame,
  mode,
  onApply,
  ratio,
  setDraft,
  setMode,
}: CropKeyboardOptions): void {
  const applyRef = useRef(onApply);
  useLayoutEffect(() => {
    applyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    if (!active || mode !== "crop" || !draft) return;
    const element = frame.current;
    if (!element) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !isNode(event.target) ||
        !frame.current?.contains(event.target)
      ) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        applyRef.current();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMode("view");
        setDraft(null);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const bounds = containImage(
        frame.current?.getBoundingClientRect() ?? {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        },
        ratio,
      );
      const px = bounds.width ? step / bounds.width : 0;
      const py = bounds.height ? step / bounds.height : 0;
      const resize = event.metaKey || event.ctrlKey;
      const delta: CropDelta | null =
        event.key === "ArrowLeft"
          ? resize
            ? [0, 0, -px, 0]
            : [-px, 0, 0, 0]
          : event.key === "ArrowRight"
            ? resize
              ? [0, 0, px, 0]
              : [px, 0, 0, 0]
            : event.key === "ArrowUp"
              ? resize
                ? [0, 0, 0, -py]
                : [0, -py, 0, 0]
              : event.key === "ArrowDown"
                ? resize
                  ? [0, 0, 0, py]
                  : [0, py, 0, 0]
                : null;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const [dx, dy, dw, dh] = delta;
      setDraft((current) =>
        current ? nudgeCrop(current, dx, dy, dw, dh) : current,
      );
    };
    element.addEventListener("keydown", onKey);
    return () => element.removeEventListener("keydown", onKey);
  }, [active, draft, frame, mode, ratio, setDraft, setMode]);
}
