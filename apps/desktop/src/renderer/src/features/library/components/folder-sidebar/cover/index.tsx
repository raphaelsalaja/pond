import { useEffect, useMemo, useState } from "react";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { normalise } from "@/features/saves";
import type { Save } from "@/features/saves/types";
import { FolderIcon } from "@/shared/lib/folder-icons";
import type { FolderIconState } from "@/shared/lib/folder-icons";
import styles from "./styles.module.css";

export function FolderCover({
  icon,
  coverSaveId,
  state,
}: {
  icon?: string;
  coverSaveId?: string | null;
  state?: FolderIconState;
}) {
  const [save, setSave] = useState<Save | null>(null);
  if (!coverSaveId && save) {
    setSave(null);
  }
  useEffect(() => {
    if (!coverSaveId) {
      return;
    }
    let cancelled = false;
    void window.pond.query("saves.get", { id: coverSaveId }).then((row) => {
      if (!cancelled) {
        setSave(normalise(row));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [coverSaveId]);
  const src = useMemo(() => (save ? folderCoverUrl(save) : null), [save]);
  if (src) {
    return <img className={styles.cover} src={src} alt="" />;
  }
  return <FolderIcon name={icon} state={state} />;
}
