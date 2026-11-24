import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  containImage,
  viewToImagePoint,
} from "@/features/saves/lib/image-regions";
import {
  FIT_POSE,
  poseToActual,
  viewerMemory,
  viewerWheelIntent,
  wheelZoomFactor,
  zoomImageAt,
} from "@/features/saves/lib/viewer-memory";
import type {
  ImagePose,
  ViewerWheelBehavior,
} from "@/features/saves/lib/viewer-memory";
import type { InspectorMode } from "./types";

interface ImageViewportOptions {
  active: boolean;
  defaultSize: "fit" | "actual";
  initialRatio: number | null;
  isDragging: () => boolean;
  mode: InspectorMode;
  naturalWidth: number;
  onNavigate: (delta: number) => void;
  onRatio: (ratio: number) => void;
  rememberPosition: boolean;
  src: string;
  wheelBehavior: ViewerWheelBehavior;
  /** Quick Preview keeps a fitted image still, so scrolling only pans once it's zoomed. */
  staticAtFit: boolean;
}

interface ImageViewport {
  actual: number;
  bounds: ReturnType<typeof containImage>;
  frame: RefObject<HTMLDivElement | null>;
  image: RefObject<HTMLImageElement | null>;
  live: boolean;
  oneToOne: number | null;
  pointFromClient: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number };
  pose: ImagePose;
  ratio: number | null;
  reportImage: (width: number, height: number) => void;
  setPosition: (
    update: (previous: ImagePose) => ImagePose,
    live?: boolean,
  ) => void;
  size: { width: number; height: number };
}

export function actualScale(input: {
  naturalWidth: number;
  fittedWidth: number;
}): number {
  if (input.naturalWidth <= 0 || input.fittedWidth <= 0) {
    return 1;
  }
  return input.naturalWidth / input.fittedWidth;
}

export function useImageViewport({
  active,
  defaultSize,
  initialRatio,
  isDragging,
  mode,
  naturalWidth,
  onNavigate,
  onRatio,
  rememberPosition,
  src,
  staticAtFit,
  wheelBehavior,
}: ImageViewportOptions): ImageViewport {
  const [pose, setPose] = useState<ImagePose>(() =>
    rememberPosition ? viewerMemory.image(src) : FIT_POSE,
  );
  const [live, setLive] = useState(false);
  const [ratio, setRatio] = useState(initialRatio);
  const [decoded, setDecoded] = useState({ src, width: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const latestPose = useRef(pose);
  const poseFrame = useRef(0);
  const bounds = containImage({ left: 0, top: 0, ...size }, ratio);
  const hasDecodedImage = decoded.src === src && decoded.width > 0;
  const renderedNaturalWidth =
    (hasDecodedImage ? decoded.width : 0) || naturalWidth;
  const oneToOne =
    renderedNaturalWidth > 0 && bounds.width > 0
      ? actualScale({
          naturalWidth: renderedNaturalWidth,
          fittedWidth: bounds.width,
        })
      : null;

  const [rememberedPosition, setRememberedPosition] =
    useState(rememberPosition);
  if (rememberedPosition !== rememberPosition) {
    setRememberedPosition(rememberPosition);
    if (!rememberPosition) {
      setPose(FIT_POSE);
    }
  }
  const [defaultPose, setDefaultPose] = useState<{
    src: string;
    pose: ImagePose;
  } | null>(null);
  if (
    defaultPose?.src !== src &&
    defaultSize === "actual" &&
    !(rememberPosition && viewerMemory.hasImage(src)) &&
    hasDecodedImage &&
    oneToOne
  ) {
    const next = { zoom: Math.min(32, oneToOne), x: 0, y: 0 };
    setDefaultPose({ src, pose: next });
    setPose(next);
  }

  const setPosition = (
    update: (previous: ImagePose) => ImagePose,
    nextLive = false,
  ) => {
    if (poseFrame.current) {
      cancelAnimationFrame(poseFrame.current);
      poseFrame.current = 0;
    }
    const next = update(latestPose.current);
    latestPose.current = next;
    setLive(nextLive);
    setPose(next);
  };

  useEffect(() => {
    if (!rememberPosition) {
      return;
    }
    const timer = window.setTimeout(
      () => viewerMemory.setImage(src, pose),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [pose, rememberPosition, src]);
  useEffect(
    () => () => {
      if (rememberPosition) {
        viewerMemory.setImage(src, latestPose.current);
      }
    },
    [rememberPosition, src],
  );
  useLayoutEffect(() => {
    if (!rememberPosition) {
      latestPose.current = FIT_POSE;
    }
  }, [rememberPosition]);
  useLayoutEffect(() => {
    if (defaultPose) {
      latestPose.current = defaultPose.pose;
    }
  }, [defaultPose]);
  /** Fitted bounds must exist before first paint so the open transition lands on the image, not the whole stage. */
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    if (!globalThis.ResizeObserver) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const wheelState = useRef({
    active,
    isDragging,
    mode,
    onNavigate,
    staticAtFit,
    wheelBehavior,
  });
  useLayoutEffect(() => {
    wheelState.current = {
      active,
      isDragging,
      mode,
      onNavigate,
      staticAtFit,
      wheelBehavior,
    };
  }, [active, isDragging, mode, onNavigate, staticAtFit, wheelBehavior]);

  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const queuePose = (update: (previous: ImagePose) => ImagePose) => {
      latestPose.current = update(latestPose.current);
      if (poseFrame.current) {
        return;
      }
      poseFrame.current = requestAnimationFrame(() => {
        poseFrame.current = 0;
        setLive(true);
        setPose(latestPose.current);
      });
    };
    const onWheel = (event: WheelEvent) => {
      const state = wheelState.current;
      if (!state.active || state.mode === "crop") {
        if (event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const intent = viewerWheelIntent({
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        wheelBehavior: state.wheelBehavior,
      });
      event.preventDefault();
      event.stopPropagation();
      if (
        intent === "pan" &&
        state.staticAtFit &&
        latestPose.current.zoom <= 1
      ) {
        return;
      }
      if (intent === "navigate") {
        if (state.mode === "view") {
          state.onNavigate(event.deltaY > 0 ? 1 : -1);
        }
        return;
      }
      if (intent !== "zoom" && state.isDragging()) {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (intent === "zoom") {
        const factor = wheelZoomFactor(
          event.deltaY,
          event.deltaMode,
          event.ctrlKey,
        );
        queuePose((previous) =>
          zoomImageAt(previous, previous.zoom * factor, {
            x: event.clientX - rect.left - rect.width / 2,
            y: event.clientY - rect.top - rect.height / 2,
          }),
        );
        return;
      }
      queuePose((previous) => ({
        ...previous,
        x: previous.x - event.deltaX,
        y: previous.y - event.deltaY,
      }));
    };
    element.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      element.removeEventListener("wheel", onWheel, { capture: true });
      if (poseFrame.current) {
        cancelAnimationFrame(poseFrame.current);
        poseFrame.current = 0;
      }
    };
  }, []);

  const reportImage = (width: number, height: number) => {
    if (!(Number.isFinite(width) && Number.isFinite(height))) {
      return;
    }
    if (width <= 0 || height <= 0) {
      return;
    }
    setDecoded((current) =>
      current.src === src && current.width === width ? current : { src, width },
    );
    const nextRatio = width / height;
    setRatio(nextRatio);
    onRatio(nextRatio);
  };
  const pointFromClient = (clientX: number, clientY: number) =>
    viewToImagePoint(
      frame.current?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      },
      latestPose.current,
      ratio,
      clientX,
      clientY,
    );
  return {
    actual: poseToActual(pose.zoom, oneToOne),
    bounds,
    frame,
    image,
    live,
    oneToOne,
    pointFromClient,
    pose,
    ratio,
    reportImage,
    setPosition,
    size,
  };
}
