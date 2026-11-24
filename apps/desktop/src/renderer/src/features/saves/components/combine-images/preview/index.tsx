import { Empty, EmptyPreview } from "@pond/ui";
import type {
  CombineImagesOptions,
  CombineImagesZoomAction,
} from "@shared/combine-images-contracts";
import type { CombineLayout } from "@shared/combine-images-layout";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildPondUrl, thumbUrlFor } from "@/features/saves/lib/media/url";
import type { Save, SaveFile } from "@/features/saves/types";
import { supportsTransparency } from "../options";
import type { Highlight } from "../options";
import { clampZoom, stepZoom, ZoomBar } from "../zoom";
import styles from "./styles.module.css";

export interface CombineImage {
  save: Save;
  file: SaveFile;
}

const GUTTER = 32;
const BAR_SPACE = 72;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

export function Preview({
  images,
  layout,
  options,
  highlight,
  dropping,
  subscribeZoom,
}: {
  images: ReadonlyArray<CombineImage>;
  layout: CombineLayout;
  options: CombineImagesOptions;
  highlight: Highlight;
  dropping: boolean;
  subscribeZoom: (
    callback: (action: CombineImagesZoomAction) => void,
  ) => () => void;
}) {
  const { ref, size } = useSize<HTMLDivElement>();
  const [zoom, setZoom] = useState<number | null>(null);
  const fitScale = Math.min(
    1,
    (size.width - GUTTER * 2) / Math.max(1, layout.width),
    (size.height - GUTTER - BAR_SPACE) / Math.max(1, layout.height),
  );
  const scale = zoom ?? Math.max(0.01, fitScale);
  const scaleRef = useRef(scale);
  useLayoutEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useHotkey("Mod+9", () => setZoom(null));
  useEffect(
    () =>
      subscribeZoom((action) => {
        if (action === "view.zoom-reset") {
          setZoom(1);
        } else {
          setZoom(
            stepZoom(scaleRef.current, action === "view.zoom-in" ? 1 : -1),
          );
        }
      }),
    [subscribeZoom],
  );
  return (
    <div
      className={styles.preview}
      ref={ref}
      data-dropping={dropping || undefined}
    >
      {images.length === 0 ? (
        <Empty.Root size="card" className={styles.empty}>
          <Empty.Media>
            <EmptyPreview.Root kind="board" layout="single">
              <EmptyPreview.Row>
                <EmptyPreview.Thumb />
                <EmptyPreview.Thumb />
                <EmptyPreview.Thumb />
                <EmptyPreview.Space />
                <EmptyPreview.Line width={24} tone="mid" />
              </EmptyPreview.Row>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>No Images Selected</Empty.Title>
          <Empty.Description>
            Drag images from your library to add them.
          </Empty.Description>
        </Empty.Root>
      ) : (
        <>
          <div className={styles.viewport}>
            <div className={styles.content}>
              <Canvas
                images={images}
                layout={layout}
                options={options}
                highlight={highlight}
                scale={scale}
              />
            </div>
          </div>
          <ZoomBar
            scale={scale}
            fit={zoom === null}
            onZoom={(next) => setZoom(clampZoom(next))}
            onFit={() => setZoom(null)}
          />
        </>
      )}
    </div>
  );
}

function Canvas({
  images,
  layout,
  options,
  highlight,
  scale,
}: {
  images: ReadonlyArray<CombineImage>;
  layout: CombineLayout;
  options: CombineImagesOptions;
  highlight: Highlight;
  scale: number;
}) {
  const band = {
    width: layout.width - options.margin * 2,
    height: layout.height - options.margin * 2,
  };
  const horizontal = options.direction === "horizontal";
  return (
    <div
      className={styles.canvas}
      style={{
        width: layout.width * scale,
        height: layout.height * scale,
        background: options.background,
        borderRadius: supportsTransparency(options.format)
          ? options.canvasRadius * scale
          : 0,
      }}
    >
      {images.map(({ save, file }, index) => {
        const item = layout.items[index];
        if (!item) {
          return null;
        }
        const width = item.width * scale;
        return (
          <img
            key={save.id}
            className={styles.image}
            alt=""
            draggable={false}
            src={thumbUrlFor(buildPondUrl(save.id, file), width)}
            style={{
              left: item.left * scale,
              top: item.top * scale,
              width,
              height: item.height * scale,
              borderRadius: options.radius * scale,
              opacity: options.opacity,
            }}
          />
        );
      })}
      {highlight === "margin" && options.margin > 0 ? (
        <span
          className={styles.margin}
          style={{ borderWidth: options.margin * scale }}
        />
      ) : null}
      {highlight === "spacing" && options.spacing > 0
        ? layout.items.slice(0, -1).map((item, index) => (
            <span
              key={images[index]?.save.id}
              className={styles.gap}
              style={
                horizontal
                  ? {
                      left: (item.left + item.width) * scale,
                      top: options.margin * scale,
                      width: options.spacing * scale,
                      height: band.height * scale,
                    }
                  : {
                      left: options.margin * scale,
                      top: (item.top + item.height) * scale,
                      width: band.width * scale,
                      height: options.spacing * scale,
                    }
              }
            />
          ))
        : null}
    </div>
  );
}
