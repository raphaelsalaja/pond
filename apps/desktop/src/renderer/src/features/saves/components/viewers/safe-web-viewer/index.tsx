import { IconCode, IconGlobe } from "@pond/icons";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { type MhtmlPage, parseMhtml } from "./mhtml";
import { sanitizeOfflineHtml } from "./sanitize";
import styles from "./styles.module.css";

interface SafeWebViewerProps {
  url: string;
  path: string;
  size: number;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}

const MAX_HTML_BYTES = 10 * 1024 ** 2;

export function SafeWebViewer({
  url,
  path,
  size,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: SafeWebViewerProps) {
  const [source, setSource] = useState<string | null>(null);
  const [pages, setPages] = useState<MhtmlPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<"rendered" | "source">("rendered");

  useEffect(() => {
    if (size > MAX_HTML_BYTES) {
      onUnavailable();
      return;
    }
    let alive = true;
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!alive) return;
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 32_768)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 32_768),
          );
        if (/\.mhtml?$/i.test(path)) {
          const archivePages = parseMhtml(binary);
          if (archivePages.length === 0) throw new Error("No archived page");
          setPages(archivePages);
          setPageIndex(0);
          setSource(archivePages[0]?.html ?? "");
          return;
        }
        setPages([]);
        setSource(new TextDecoder("utf-8").decode(bytes));
      })
      .catch(() => {
        if (alive) onUnavailable();
      });
    return () => {
      alive = false;
    };
  }, [onUnavailable, path, size, url]);

  useEffect(() => {
    const page = pages[pageIndex];
    if (page) setSource(page.html);
  }, [pageIndex, pages]);

  const safeHtml = useMemo(
    () => (source === null ? "" : sanitizeOfflineHtml(source)),
    [source],
  );

  return (
    <div className={styles.root}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Web archive"
          start={toolbarStart}
          center={
            <ViewerToolbarGroups
              controls={
                <>
                  <ViewerHud.Tool
                    label="Rendered"
                    pressed={mode === "rendered"}
                    onClick={() => setMode("rendered")}
                  >
                    <IconGlobe />
                  </ViewerHud.Tool>
                  <ViewerHud.Tool
                    label="Source"
                    pressed={mode === "source"}
                    onClick={() => setMode("source")}
                  >
                    <IconCode />
                  </ViewerHud.Tool>
                </>
              }
              actions={toolbarActions}
            />
          }
          end={
            <>
              <span className={styles.hint}>
                Scripts, forms, embeds, and network requests are disabled.
              </span>
              {pages.length > 1
                ? pages.map((page, index) => (
                    <ViewerHud.Tool
                      key={page.label}
                      label={page.label}
                      pressed={pageIndex === index}
                      onClick={() => setPageIndex(index)}
                    >
                      {index + 1}
                    </ViewerHud.Tool>
                  ))
                : null}
            </>
          }
        />
      </ChromePortal>
      {source === null ? (
        <div className={styles.status}>Reading page</div>
      ) : null}
      {source !== null && mode === "rendered" ? (
        <iframe
          className={styles.frame}
          title="Offline HTML preview"
          sandbox=""
          srcDoc={safeHtml}
        />
      ) : null}
      {source !== null && mode === "source" ? (
        <pre className={styles.source} data-scroll-fade="vertical">
          {source}
        </pre>
      ) : null}
    </div>
  );
}
