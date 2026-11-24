import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateClockwise,
  IconChevronDown,
  IconExternalLink,
  IconGlobe,
  IconLink2,
} from "@pond/icons";
import { Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  ViewerChrome,
} from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { copyUrl } from "@/features/saves/lib/actions";
import {
  archiveUrlKey,
  buildArchiveViewerUrl,
  loadArchiveManifest,
} from "@/features/saves/lib/media/archive";
import type { ArchiveManifest } from "@/features/saves/lib/media/archive";
import type { Save } from "@/features/saves/types";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import type { PondWebviewElement } from "@/shared/types/electron-webview";
import {
  currentPageIndex,
  displayArchiveAddress,
  initialPageHistory,
  stepPage,
  visitPage,
} from "./archive-navigation";
import styles from "./styles.module.css";

export function SaveArchiveViewer({ save }: { save: Save }) {
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  useEffect(() => {
    let alive = true;
    void loadArchiveManifest(save).then((m) => {
      if (alive) {
        setManifest(m);
      }
    });
    return () => {
      alive = false;
    };
  }, [save]);

  if (!manifest || manifest.pages.length === 0) {
    return null;
  }
  return (
    <ViewerChrome>
      <ArchiveFrame key={save.id} save={save} manifest={manifest} />
    </ViewerChrome>
  );
}

function ArchiveFrame({
  save,
  manifest,
}: {
  save: Save;
  manifest: ArchiveManifest;
}) {
  const [history, setHistory] = useState(initialPageHistory);
  const guestIdRef = useRef<number | null>(null);
  const webviewRef = useRef<PondWebviewElement | null>(null);

  const pageIndex = currentPageIndex(history);
  const canGoBack = history.cursor > 0;
  const canGoForward = history.cursor < history.entries.length - 1;

  const visit = useCallback((index: number) => {
    setHistory((current) => visitPage(current, index));
  }, []);

  const step = (delta: number) => {
    setHistory((current) => stepPage(current, delta));
  };

  const pageIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    manifest.pages.forEach((page, i) => {
      const key = archiveUrlKey(page.url);
      if (!map.has(key)) {
        map.set(key, i);
      }
    });
    return map;
  }, [manifest]);

  const page = manifest.pages[pageIndex] ?? manifest.pages[0];
  const src = page ? buildArchiveViewerUrl(save, page.url, manifest) : null;

  const attachWebview = useCallback((el: PondWebviewElement | null) => {
    webviewRef.current = el;
    if (!el) {
      guestIdRef.current = null;
      return;
    }
    el.addEventListener("dom-ready", () => {
      try {
        guestIdRef.current = el.getWebContentsId();
      } catch {
        guestIdRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    return window.pond.onArchiveNavigate(({ guestId, url }) => {
      if (
        guestId === null ||
        guestId === undefined ||
        guestId !== guestIdRef.current
      ) {
        return;
      }
      const index = pageIndexByKey.get(archiveUrlKey(url));
      if (index !== undefined) {
        visit(index);
      } else {
        void window.pond.openExternal(url);
      }
    });
  }, [pageIndexByKey, visit]);

  if (!page || !src) {
    return null;
  }

  const address = displayArchiveAddress(page.url);
  const buildPageItems = (): Array<MenuItemSpec> =>
    manifest.pages.map((p, index) => ({
      type: "checkbox",
      label: p.title.trim() || displayArchiveAddress(p.url),
      indicator: "check",
      checked: index === pageIndex,
      onCheckedChange: (checked) => {
        if (checked) {
          visit(index);
        }
      },
    }));

  return (
    <div className={styles.root}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Web archive"
          start={
            <>
              <ViewerSaveNav saveId={save.id} />
              <ViewerHud.Tool
                label="Back"
                disabled={!canGoBack}
                onClick={() => step(-1)}
              >
                <IconArrowLeft />
              </ViewerHud.Tool>
              <ViewerHud.Tool
                label="Forward"
                disabled={!canGoForward}
                onClick={() => step(1)}
              >
                <IconArrowRight />
              </ViewerHud.Tool>
              <ViewerHud.Tool
                label="Reload"
                onClick={() => webviewRef.current?.reload()}
              >
                <IconArrowRotateClockwise />
              </ViewerHud.Tool>
            </>
          }
          center={
            manifest.pages.length > 1 ? (
              <SpecMenu buildItems={buildPageItems} align="center">
                <Menu.Trigger
                  size="sm"
                  variant="ghost"
                  rounding="full"
                  className={styles.trigger}
                  aria-label="Archived Pages"
                  title={page.url}
                >
                  <span className={styles.address}>{address}</span>
                  <IconChevronDown size={12} />
                </Menu.Trigger>
              </SpecMenu>
            ) : (
              <span className={styles.address} title={page.url}>
                {address}
              </span>
            )
          }
          end={
            <>
              {manifest.scope === "page" ? (
                <ViewerHud.Tool
                  label="Archive Site"
                  onClick={() => void window.pond.archiveSite(save.id)}
                >
                  <IconGlobe />
                </ViewerHud.Tool>
              ) : null}
              <ViewerHud.Tool
                label="Copy Link"
                onClick={() => void copyUrl(page.url)}
              >
                <IconLink2 />
              </ViewerHud.Tool>
              <ViewerHud.Tool
                label="Open in Browser"
                onClick={() => void window.pond.openExternal(page.url)}
              >
                <IconExternalLink />
              </ViewerHud.Tool>
            </>
          }
        />
      </ChromePortal>
      <div className={styles.frame}>
        <webview ref={attachWebview} src={src} className={styles.webview} />
      </div>
    </div>
  );
}
