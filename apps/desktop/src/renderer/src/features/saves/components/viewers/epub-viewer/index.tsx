import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import { Select, Slider } from "@pond/ui";
import type { Book, NavItem, Rendition } from "epubjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import styles from "./styles.module.css";

interface EpubViewerProps {
  url: string;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}

function isValueList(
  value: number | ReadonlyArray<number>,
): value is ReadonlyArray<number> {
  return Array.isArray(value);
}

function flattenNavigation(
  items: Array<NavItem>,
  depth = 0,
): Array<NavItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenNavigation(item.subitems ?? [], depth + 1),
  ]);
}

export function EpubViewer({
  url,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: EpubViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [toc, setToc] = useState<Array<NavItem & { depth: number }>>([]);
  const [chapter, setChapter] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(100);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let alive = true;
    let book: Book | null = null;
    let rendition: Rendition | null = null;

    void Promise.all([
      fetch(url).then((response) => response.arrayBuffer()),
      import("epubjs"),
    ])
      .then(async ([buffer, module]) => {
        if (!alive) return;
        book = module.default();
        await book.open(buffer, "binary");
        if (!alive || !book) return;
        rendition = book.renderTo(root, {
          width: "100%",
          height: "100%",
          flow: "scrolled-doc",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.default({
          body: {
            "font-family": "ui-serif, Georgia, serif !important",
            color: "#202124 !important",
            background: "#f7f3e9 !important",
            padding: "24px !important",
          },
          img: { "max-width": "100% !important" },
        });
        const navigation = await book.loaded.navigation;
        if (alive) setToc(flattenNavigation(navigation.toc));
        await rendition.display();
        if (alive) setReady(true);
      })
      .catch(() => {
        if (alive) onUnavailable();
      });

    return () => {
      alive = false;
      renditionRef.current = null;
      rendition?.destroy();
      book?.destroy();
      root.replaceChildren();
    };
  }, [onUnavailable, url]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  const chapters = useMemo(
    () =>
      toc.map((item) => ({
        value: item.href,
        label: `${"\u00a0".repeat(item.depth * 2)}${item.label}`,
      })),
    [toc],
  );
  const selected = chapters.find((item) => item.value === chapter);

  return (
    <div className={styles.root}>
      <div ref={rootRef} className={styles.reader} />
      {!ready ? <div className={styles.status}>Opening book</div> : null}
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Book"
          start={toolbarStart}
          center={
            <ViewerToolbarGroups
              controls={
                <div className={styles.size}>
                  <ViewerHud.Scale>{fontSize}%</ViewerHud.Scale>
                  <Slider.Root
                    min={75}
                    max={175}
                    step={1}
                    value={fontSize}
                    onValueChange={(next) => {
                      const value = isValueList(next) ? (next[0] ?? 100) : next;
                      setFontSize(value);
                    }}
                  >
                    <Slider.Control>
                      <Slider.Track>
                        <Slider.Indicator />
                        <Slider.Thumb aria-label="Book font size" />
                      </Slider.Track>
                    </Slider.Control>
                  </Slider.Root>
                </div>
              }
              actions={toolbarActions}
              view={
                <>
                  <ViewerHud.Tool
                    label="Previous"
                    onClick={() => void renditionRef.current?.prev()}
                  >
                    <IconArrowLeft />
                  </ViewerHud.Tool>
                  <ViewerHud.Tool
                    label="Next"
                    onClick={() => void renditionRef.current?.next()}
                  >
                    <IconArrowRight />
                  </ViewerHud.Tool>
                </>
              }
            />
          }
        />
      </ChromePortal>
      {chapters.length > 0 ? (
        <ViewerHud.Root>
          <ViewerHud.Cluster anchor="bottom-center">
            <ViewerHud.Pill className={styles.contents}>
              <Select.Root
                items={chapters}
                value={chapter}
                onValueChange={(next) => {
                  if (next === null) return;
                  setChapter(next);
                  void renditionRef.current?.display(next);
                }}
              >
                <Select.Trigger variant="chip" aria-label="Table of contents">
                  <Select.Value placeholder="Contents">
                    {selected?.label ?? "Contents"}
                  </Select.Value>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner side="top" sideOffset={8}>
                    <Select.Popup>
                      <Select.Items items={chapters} />
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </ViewerHud.Pill>
          </ViewerHud.Cluster>
        </ViewerHud.Root>
      ) : null}
    </div>
  );
}
