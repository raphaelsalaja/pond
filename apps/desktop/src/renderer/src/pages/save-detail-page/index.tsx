import { IconSidebarLeft2ShowOutline18 } from "@pond/icons/outline/18";
import { Tooltip } from "@pond/ui";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTrackVisit } from "@/components/recents";
import { Shell } from "@/components/shell";
import { useInspector } from "@/lib/use-inspector";
import { SaveDetail } from "@/pages/save-detail";
import { useSave } from "@/pool/hooks";
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
          <Tooltip.Root content="Show inspector">
            <button
              type="button"
              className={styles["inspector-restore"]}
              onClick={toggleInspector}
              aria-label="Show inspector"
            >
              <IconSidebarLeft2ShowOutline18 width={16} height={16} />
            </button>
          </Tooltip.Root>
        ) : null}
      </Shell.Main>
      <SaveDetail />
    </>
  );
}
