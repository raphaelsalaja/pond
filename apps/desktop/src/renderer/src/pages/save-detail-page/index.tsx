import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTrackVisit } from "@/components/recents";
import { ActivitySection } from "@/components/save-preview/activity-section";
import { DescriptionBody } from "@/components/save-preview/description";
import { DominantColorSwatches } from "@/components/save-preview/dominant-colors";
import { FileActions } from "@/components/save-preview/file-actions";
import { descriptionMatchesTitle } from "@/components/save-preview/helpers";
import { MediaViewer } from "@/components/save-preview/media-viewer";
import { ReaderAction } from "@/components/save-preview/reader-action";
import { RefreshAction } from "@/components/save-preview/refresh-action";
import { RelatedSaves } from "@/components/save-preview/related-saves";
import { SaveStats } from "@/components/save-stats";
import { Shell } from "@/components/shell";
import { useSave } from "@/pool/hooks";
import { DetailHeader } from "./header";
import { PropertiesRail } from "./properties-rail";
import styles from "./styles.module.css";
import { useListContext } from "./use-list-context";

/**
 * Linear-style detail surface — keeps the LibrarySidebar mounted and
 * replaces the grid with a wide centred body plus a ~220px right
 * properties rail.
 *
 * Reachable URLs (one per list mode the grid serves):
 *
 *   /detail/:id                 (default library)
 *   /source/:source/detail/:id  (source filter view)
 *   /untagged/detail/:id
 *   /recents/detail/:id
 *   /random/detail/:id
 *   /trash/detail/:id
 *
 * The active save is read from `useParams().id`. Pagination, breadcrumb
 * and back-link target are derived from the URL prefix via
 * `useListContext()`.
 */
export function SaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useTrackVisit(id);

  const list = useListContext({ activeId: id ?? null });

  const goPrev = useCallback(() => {
    if (!list.prevId) return;
    navigate(list.buildDetailPath(list.prevId));
  }, [list, navigate]);

  const goNext = useCallback(() => {
    if (!list.nextId) return;
    navigate(list.buildDetailPath(list.nextId));
  }, [list, navigate]);

  // Keyboard shortcuts: J / K and ArrowUp / ArrowDown move between
  // saves in the current filtered list. Skip when the user is typing
  // into an input (TagEditor lives inside this page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        if (!list.nextId) return;
        e.preventDefault();
        goNext();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (!list.prevId) return;
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        navigate(list.parentTo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, list.nextId, list.prevId, list.parentTo, navigate]);

  // Cover click → media lightbox. The lightbox is keyed on `?focus=`,
  // so we just toggle that param. Closing the lightbox returns here.
  const openLightbox = useCallback(() => {
    if (!save) return;
    const next = new URLSearchParams(searchParams);
    next.set("focus", save.id);
    setSearchParams(next, { replace: false });
  }, [save, searchParams, setSearchParams]);

  if (!save) {
    return (
      <Shell.Main>
        <Shell.Empty>
          {id ? "Save not found." : "Select a save to inspect."}
        </Shell.Empty>
      </Shell.Main>
    );
  }

  const onTitleBlur = async (e: React.FocusEvent<HTMLHeadingElement>) => {
    const next = e.currentTarget.textContent?.trim() ?? "";
    if (next === (save.title ?? "")) return;
    await window.pond.tx({
      kind: "update",
      model: "save",
      id: save.id,
      patch: { title: next || null },
      before: { title: save.title },
    });
  };

  return (
    <Shell.Main>
      <DetailHeader save={save} list={list} />
      <div className={styles.layout}>
        <article className={styles.body}>
          <div className={styles["media-frame"]}>
            <MediaViewer
              save={save}
              videoRef={videoRef}
              onExpand={openLightbox}
            />
          </div>
          <h1
            className={styles.title}
            contentEditable
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {save.title ?? save.url}
          </h1>
          {save.url ? (
            <p className={styles.url}>
              <a href={save.url} target="_blank" rel="noreferrer">
                {save.url}
              </a>
            </p>
          ) : null}
          {save.description && !descriptionMatchesTitle(save) ? (
            <DescriptionBody text={save.description} />
          ) : null}
          <SaveStats.Root save={save} videoRef={videoRef} />
          <ReaderAction save={save} />
          <DominantColorSwatches save={save} />
          <FileActions save={save} />
          <RefreshAction save={save} />
          <RelatedSaves save={save} />
          <ActivitySection save={save} />
        </article>
        <PropertiesRail save={save} />
      </div>
    </Shell.Main>
  );
}
