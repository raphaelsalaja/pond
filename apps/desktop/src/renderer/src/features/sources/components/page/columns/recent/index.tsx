import { cssVars } from "@pond/ui";
import log from "electron-log/renderer";
import { useEffect, useMemo } from "react";
import {
  layoutAspectFor,
  pickCardUnit,
  thumbUrlFor,
  useAspectVersion,
} from "@/features/saves/media";
import { ensureSaves, useRetainedSaves, useSave } from "@/features/saves/pool";
import { useSourceOverview } from "@/features/sources/hooks/use-source-activity";
import type { SourceTableRow } from "../../lib/helpers";
import styles from "./styles.module.css";

const COUNT = 8;
const THUMB_PX = 80;

function useRecentIds(row: SourceTableRow): Array<string> {
  const overview = useSourceOverview(row.id);
  const ids = useMemo(
    () => (overview.data?.recent ?? []).slice(0, COUNT),
    [overview.data],
  );
  const key = ids.join(",");
  useEffect(() => {
    if (key) {
      void ensureSaves(key.split(",")).catch((cause: unknown) => {
        log.warn("[pond sources] recent saves load failed", cause);
      });
    }
  }, [key]);
  useRetainedSaves(ids);
  return ids;
}

function Thumb({ id }: { id: string }) {
  const save = useSave(id);
  useAspectVersion(Boolean(save));
  const ratio = save ? layoutAspectFor(save) : 16 / 10;
  const src = useMemo(() => {
    if (!save) return undefined;
    const unit = pickCardUnit(save);
    const candidate = unit?.isVideo ? unit.posterUrl : unit?.url;
    return candidate?.startsWith("pond://")
      ? thumbUrlFor(candidate, THUMB_PX)
      : undefined;
  }, [save]);
  return (
    <span
      className={styles.thumb}
      style={cssVars({ "--ratio": String(ratio) })}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : null}
    </span>
  );
}

/** Newest saves at a shared height and their true widths. */
export function RecentCell({ row }: { row: SourceTableRow }) {
  const ids = useRecentIds(row);
  if (ids.length === 0) return null;
  return (
    <span className={styles.strip}>
      {ids.map((id) => (
        <Thumb key={id} id={id} />
      ))}
    </span>
  );
}
