import { Button } from "@pond/ui";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

export function PdfThumbnail({
  document,
  pageNumber,
  rotation,
  root,
  active,
  onSelect,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  rotation: number;
  root: HTMLElement | null;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 3);

  useEffect(() => {
    const button = buttonRef.current;
    if (visible || !button || !root) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
        }
      },
      { root, rootMargin: "100% 0px" },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [root, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let activeRender = true;
    let renderTask: ReturnType<
      Awaited<ReturnType<typeof document.getPage>>["render"]
    > | null = null;
    void document.getPage(pageNumber).then((page) => {
      if (!activeRender || !canvasRef.current) {
        return;
      }
      const base = page.getViewport({ scale: 1, rotation });
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: (96 / base.width) * pixelRatio,
        rotation,
      });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = "96px";
      canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      void renderTask.promise.catch(() => {});
    });
    return () => {
      activeRender = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, rotation, visible]);

  return (
    <Button
      ref={buttonRef}
      variant="bare"
      className={styles.thumbnail}
      data-active={active || undefined}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(pageNumber)}
    >
      {visible ? <canvas ref={canvasRef} /> : <span aria-hidden />}
      <strong>{pageNumber}</strong>
    </Button>
  );
}
