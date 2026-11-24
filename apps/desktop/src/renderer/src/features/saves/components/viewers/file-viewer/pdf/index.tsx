import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileBar } from "../file-bar";
import {
  addPdfRenderWindow,
  pdfPageWidth,
  stepPdfZoom,
} from "../pdf-render-window";
import type { ViewerProps } from "../types";
import { PdfPage } from "./page";
import { PdfThumbnail } from "./thumbnail";
import { PdfToolbar } from "./toolbar";
import type { PdfFitMode } from "./toolbar";
import styles from "./styles.module.css";

export function PdfViewer(props: ViewerProps & { url: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollRoot(node);
  }, []);
  const [opened, setOpened] = useState<{
    url: string;
    document: PDFDocumentProxy;
  } | null>(null);
  const document = opened?.url === props.url ? opened.document : null;
  const [pagesToRender, setPagesToRender] = useState<Set<number>>(new Set());
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [pageAspectRatio, setPageAspectRatio] = useState(8.5 / 11);
  const [fitMode, setFitMode] = useState<PdfFitMode>("width");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [thumbnailRoot, setThumbnailRoot] = useState<HTMLElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const error = failedUrl === props.url;

  useEffect(() => {
    let task: PDFDocumentLoadingTask | undefined;
    let active = true;
    const url = props.url;
    void import("pdfjs-dist")
      .then(async (pdf) => {
        if (!active) {
          return;
        }
        pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        task = pdf.getDocument({ url });
        const next = await task.promise;
        if (active) {
          setOpened({ url, document: next });
          setPagesToRender(addPdfRenderWindow(new Set(), 1, next.numPages));
          const firstPage = await next.getPage(1);
          if (active) {
            const firstViewport = firstPage.getViewport({ scale: 1 });
            setPageAspectRatio(firstViewport.width / firstViewport.height);
          }
        }
      })
      .catch(() => {
        if (active) {
          setFailedUrl(url);
        }
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [props.url]);

  const schedulePage = useCallback(
    (pageNumber: number) => {
      if (!document) {
        return;
      }
      setPagesToRender((current) =>
        addPdfRenderWindow(current, pageNumber, document.numPages),
      );
    },
    [document],
  );

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) {
      return;
    }
    const update = () =>
      setViewport({ width: root.clientWidth, height: root.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const width = pdfPageWidth({
    containerWidth: viewport.width,
    containerHeight: viewport.height,
    pageAspectRatio:
      rotation % 180 === 0 ? pageAspectRatio : 1 / pageAspectRatio,
    thumbnailsOpen,
    fitMode,
    zoom,
  });

  const goToPage = useCallback(
    (pageNumber: number) => {
      if (!document) {
        return;
      }
      const page = Math.min(document.numPages, Math.max(1, pageNumber));
      setCurrentPage(page);
      setPagesToRender((current) =>
        addPdfRenderWindow(current, page, document.numPages),
      );
      const target = scrollRef.current?.querySelector<HTMLElement>(
        `[data-pdf-page="${page}"]`,
      );
      const reduceMotion = globalThis.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      target?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [document],
  );

  const syncCurrentPage = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      return;
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const root = scrollRef.current;
      if (!root) {
        return;
      }
      const rootTop = root.getBoundingClientRect().top;
      let nearestPage = currentPage;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const page of root.querySelectorAll<HTMLElement>(
        "[data-pdf-page]",
      )) {
        const pageNumber = Number(page.dataset.pdfPage);
        const distance = Math.abs(
          page.getBoundingClientRect().top - rootTop - 24,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPage = pageNumber;
        }
      }
      if (Number.isFinite(nearestPage)) {
        setCurrentPage(nearestPage);
      }
    });
  }, [currentPage]);

  return (
    <div className={styles.pdf}>
      <div ref={bodyRef} className={styles.body}>
        {document && thumbnailsOpen ? (
          <nav
            ref={setThumbnailRoot}
            className={styles.thumbnails}
            aria-label="Page thumbnails"
          >
            {Array.from(
              { length: document.numPages },
              (_, pageIndex) => pageIndex + 1,
            ).map((pageNumber) => (
              <PdfThumbnail
                key={pageNumber}
                document={document}
                pageNumber={pageNumber}
                rotation={rotation}
                root={thumbnailRoot}
                active={pageNumber === currentPage}
                onSelect={goToPage}
              />
            ))}
          </nav>
        ) : null}
        <div
          ref={attachScroll}
          className={styles.scroll}
          data-scroll-fade="vertical"
          onScroll={syncCurrentPage}
        >
          {!document && !error ? (
            <div className={styles.status}>Loading PDF</div>
          ) : null}
          {error ? (
            <div className={styles.status}>
              This PDF could not be rendered. You can still open or export it.
            </div>
          ) : null}
          {document
            ? Array.from(
                { length: document.numPages },
                (_, pageIndex) => pageIndex + 1,
              ).map((pageNumber) => (
                <PdfPage
                  key={pageNumber}
                  document={document}
                  pageNumber={pageNumber}
                  width={width}
                  rotation={rotation}
                  render={pagesToRender.has(pageNumber)}
                  scrollRoot={scrollRoot}
                  onNear={schedulePage}
                />
              ))
            : null}
        </div>
      </div>
      <FileBar {...props} label="PDF">
        <PdfToolbar
          document={document}
          url={props.url}
          currentPage={currentPage}
          goToPage={goToPage}
          thumbnailsOpen={thumbnailsOpen}
          onThumbnailsToggle={() => setThumbnailsOpen((value) => !value)}
          zoom={zoom}
          fitMode={fitMode}
          onZoomStep={(direction) => {
            setFitMode(null);
            setZoom((value) => stepPdfZoom(value, direction));
          }}
          onFit={(mode) => {
            setFitMode(mode);
            setZoom(1);
          }}
          onRotate={() => setRotation((value) => (value + 90) % 360)}
        />
      </FileBar>
    </div>
  );
}
