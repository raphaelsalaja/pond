import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowsExpand,
  IconMagnifier,
  IconMinus,
  IconPlus,
  IconPrint,
  IconResizeX,
  IconRotateImageClockwise,
  IconSidebarLeft,
} from "@pond/icons";
import { Input } from "@pond/ui";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { printPdf } from "../print-pdf";
import { usePdfSearch } from "../use-pdf-search";
import styles from "./styles.module.css";

export type PdfFitMode = "width" | "page" | null;

export function PdfToolbar({
  document,
  url,
  currentPage,
  goToPage,
  thumbnailsOpen,
  onThumbnailsToggle,
  zoom,
  fitMode,
  onZoomStep,
  onFit,
  onRotate,
}: {
  document: PDFDocumentProxy | null;
  url: string;
  currentPage: number;
  goToPage: (pageNumber: number) => void;
  thumbnailsOpen: boolean;
  onThumbnailsToggle: () => void;
  zoom: number;
  fitMode: PdfFitMode;
  onZoomStep: (direction: -1 | 1) => void;
  onFit: (mode: "width" | "page") => void;
  onRotate: () => void;
}) {
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searching,
    searchResults,
    searchResultIndex,
    runSearch,
    stepSearchResult,
  } = usePdfSearch(document, goToPage);
  const [pageEntry, setPageEntry] = useState(() => String(currentPage));
  const [entryPage, setEntryPage] = useState(currentPage);
  if (entryPage !== currentPage) {
    setEntryPage(currentPage);
    setPageEntry(String(currentPage));
  }

  return (
    <>
      <ViewerHud.Tool
        label="Page Thumbnails"
        pressed={thumbnailsOpen}
        disabled={!document}
        onClick={onThumbnailsToggle}
      >
        <IconSidebarLeft />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Search Document"
        pressed={searchOpen}
        disabled={!document}
        onClick={() => setSearchOpen((value) => !value)}
      >
        <IconMagnifier />
      </ViewerHud.Tool>
      {searchOpen ? (
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <Input.Root size="sm" variant="secondary">
            <Input.Field
              autoFocus
              value={searchQuery}
              aria-label="Search PDF"
              placeholder="Find"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </Input.Root>
          <span className={styles.count} aria-live="polite">
            {searching
              ? "Searching"
              : searchResults.length
                ? `${searchResultIndex + 1} / ${searchResults.length}`
                : searchQuery
                  ? "No results"
                  : ""}
          </span>
          <ViewerHud.Tool
            label="Previous Result"
            disabled={!searchResults.length}
            onClick={() => stepSearchResult(-1)}
          >
            <IconArrowLeft />
          </ViewerHud.Tool>
          <ViewerHud.Tool
            label="Next Result"
            disabled={!searchResults.length}
            onClick={() => stepSearchResult(1)}
          >
            <IconArrowRight />
          </ViewerHud.Tool>
        </form>
      ) : null}
      <ViewerHud.Tool
        label="Previous Page"
        disabled={!document || currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
      >
        <IconArrowLeft />
      </ViewerHud.Tool>
      <form
        className={styles["page-entry"]}
        onSubmit={(event) => {
          event.preventDefault();
          const next = Number.parseInt(pageEntry, 10);
          if (Number.isFinite(next)) goToPage(next);
        }}
      >
        <Input.Root size="sm" variant="secondary">
          <Input.Field
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Page number"
            value={pageEntry}
            onChange={(event) => setPageEntry(event.target.value)}
            onBlur={() => {
              const next = Number.parseInt(pageEntry, 10);
              if (Number.isFinite(next)) goToPage(next);
              else setPageEntry(String(currentPage));
            }}
          />
        </Input.Root>
        <span aria-hidden>/ {document?.numPages ?? 0}</span>
      </form>
      <ViewerHud.Tool
        label="Next Page"
        disabled={!document || currentPage >= document.numPages}
        onClick={() => goToPage(currentPage + 1)}
      >
        <IconArrowRight />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Zoom Out"
        disabled={!document}
        onClick={() => onZoomStep(-1)}
      >
        <IconMinus />
      </ViewerHud.Tool>
      <ViewerHud.Scale>{Math.round(zoom * 100)}%</ViewerHud.Scale>
      <ViewerHud.Tool
        label="Zoom In"
        disabled={!document}
        onClick={() => onZoomStep(1)}
      >
        <IconPlus />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Fit Width"
        pressed={fitMode === "width"}
        disabled={!document}
        onClick={() => onFit("width")}
      >
        <IconResizeX />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Fit Page"
        pressed={fitMode === "page"}
        disabled={!document}
        onClick={() => onFit("page")}
      >
        <IconArrowsExpand />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Rotate Clockwise"
        disabled={!document}
        onClick={onRotate}
      >
        <IconRotateImageClockwise />
      </ViewerHud.Tool>
      <ViewerHud.Tool
        label="Print"
        disabled={!document}
        onClick={() => printPdf(url)}
      >
        <IconPrint />
      </ViewerHud.Tool>
    </>
  );
}
