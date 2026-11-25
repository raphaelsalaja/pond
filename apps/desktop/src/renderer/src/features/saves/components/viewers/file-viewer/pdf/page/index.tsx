import log from "electron-log/renderer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef } from "react";
import styles from "./styles.module.css";

/** Scrolling away or resizing cancels a render, which rejects its promise on purpose. */
function reportRenderFailure(cause: unknown): void {
  if (cause instanceof Error && cause.name === "RenderingCancelledException") {
    return;
  }
  log.warn("[pond pdf] page render failed", cause);
}

export function PdfPage({
  document,
  pageNumber,
  width,
  rotation,
  render,
  scrollRoot,
  onNear,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  rotation: number;
  render: boolean;
  scrollRoot: HTMLDivElement | null;
  onNear: (pageNumber: number) => void;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const figure = figureRef.current;
    if (render || !figure || !scrollRoot) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onNear(pageNumber);
      },
      { root: scrollRoot, rootMargin: "100% 0px" },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, [onNear, pageNumber, render, scrollRoot]);

  useEffect(() => {
    if (!render) return;
    let active = true;
    let renderTask: ReturnType<
      Awaited<ReturnType<typeof document.getPage>>["render"]
    > | null = null;
    void document.getPage(pageNumber).then((page) => {
      if (!active || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1, rotation });
      const cssScale = Math.min(2, width / base.width);
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: cssScale * pixelRatio,
        rotation,
      });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.round(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      void renderTask.promise.catch(reportRenderFailure);
    });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, render, rotation, width]);

  return (
    <figure
      ref={figureRef}
      className={styles.page}
      aria-label={`Page ${pageNumber}`}
      data-pdf-page={pageNumber}
      style={{
        width,
        minHeight: Math.round(
          width * (rotation % 180 === 0 ? 11 / 8.5 : 8.5 / 11),
        ),
      }}
    >
      {render ? <canvas ref={canvasRef} /> : null}
      <figcaption>{pageNumber}</figcaption>
    </figure>
  );
}
