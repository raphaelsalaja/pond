import { IconSidebarLeft2ShowOutline18 } from "@pond/icons/outline/18";
import { Tooltip } from "@pond/ui";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTrackVisit } from "@/components/recents";
import { Shell } from "@/components/shell";
import { useInspector } from "@/lib/use-inspector";
import { SaveDetail } from "@/pages/save-detail";
import { useSave } from "@/pool/hooks";
import { pickPrimaryUnit } from "@/pool/media";
import { pool } from "@/pool/pool";
import { useResolvedTheme } from "@/pool/theme";
import { DetailContent } from "./content";
import { DetailHeader } from "./header";
import styles from "./styles.module.css";
import { useListContext } from "./use-list-context";

export function SaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const save = useSave(id);
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useTrackVisit(id);

  const list = useListContext({ activeId: id ?? null });
  const { open: inspectorOpen, toggle: toggleInspector } = useInspector();
  const theme = useResolvedTheme();

  // Warm the browser cache for the next / previous save's primary
  // image so j / k feels instant. Skips videos — they're too heavy to
  // speculatively fetch.
  useEffect(() => {
    const targets: string[] = [];
    for (const adjacent of [list.nextId, list.prevId]) {
      if (!adjacent) continue;
      const save = pool.get(adjacent);
      if (!save) continue;
      const unit = pickPrimaryUnit(save, { theme });
      if (!unit || unit.isVideo) continue;
      targets.push(unit.url);
    }
    if (targets.length === 0) return;
    const imgs = targets.map((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img;
    });
    return () => {
      // Drop refs so GC can reclaim — pending decode aborts on its own.
      for (const img of imgs) img.src = "";
    };
  }, [list.nextId, list.prevId, theme]);

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

  if (!save) {
    return (
      <Shell.Main>
        <Shell.Empty>
          {id ? "Save not found." : "Select a save to inspect."}
        </Shell.Empty>
      </Shell.Main>
    );
  }

  return (
    <>
      <Shell.Main className={styles["main-immersive"]}>
        <DetailHeader save={save} list={list} />
        <DetailContent save={save} videoRef={videoRef} />
        {!inspectorOpen ? (
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <button
                  type="button"
                  className={styles["inspector-restore"]}
                  onClick={toggleInspector}
                  aria-label="Show inspector"
                >
                  <IconSidebarLeft2ShowOutline18 width={16} height={16} />
                </button>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup>Show inspector</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : null}
      </Shell.Main>
      <SaveDetail />
    </>
  );
}
