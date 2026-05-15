import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DescriptionCard } from "@/components/save-preview/description-card";
import {
  descriptionMatchesTitle,
  getYouTubeChapters,
} from "@/components/save-preview/helpers";
import { TagsCard } from "@/components/save-preview/tags-card";
import { Shell } from "@/components/shell";
import type { Save } from "@/pool/types";
import { DetailHeader } from "../header";
import type { ListContext } from "../use-list-context";
import { AuthorRow } from "./author-row";
import { HeroVideo } from "./hero-video";
import { MetadataGrid } from "./metadata-grid";
import styles from "./styles.module.css";

export function YoutubeDetail({
  save,
  list,
}: {
  save: Save;
  list: ListContext;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const chapters = useMemo(() => getYouTubeChapters(save), [save]);

  const goPrev = useCallback(() => {
    if (!list.prevId) return;
    navigate(list.buildDetailPath(list.prevId));
  }, [list, navigate]);

  const goNext = useCallback(() => {
    if (!list.nextId) return;
    navigate(list.buildDetailPath(list.nextId));
  }, [list, navigate]);

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

  const openLightbox = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("focus", save.id);
    setSearchParams(next, { replace: false });
  }, [save.id, searchParams, setSearchParams]);

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

  const showDescription = !!save.description && !descriptionMatchesTitle(save);

  return (
    <Shell.Main>
      <DetailHeader save={save} list={list} />
      <article className={styles.body}>
        <HeroVideo
          save={save}
          chapters={chapters}
          videoRef={videoRef}
          onExpand={openLightbox}
        />
        <div className={styles["title-row"]}>
          <h1
            className={styles.title}
            contentEditable
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {save.title ?? save.url}
          </h1>
          <AuthorRow save={save} />
        </div>
        {showDescription && save.description ? (
          <DescriptionCard text={save.description} />
        ) : null}
        <TagsCard save={save} />
        <MetadataGrid save={save} />
      </article>
    </Shell.Main>
  );
}
