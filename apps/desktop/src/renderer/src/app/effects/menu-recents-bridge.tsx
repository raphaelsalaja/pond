import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import { openSave } from "@/features/saves/lib/save-nav";
import { pool, savesStore } from "@/features/saves/state/pool";
import { useRecents } from "@/features/saves/state/recents";

interface RecentMenuEntry {
  id: string;
  title: string;
}

function titleFor(id: string): string | null {
  const save = pool.get(id);
  if (!save) {
    return null;
  }
  const trimmed = save.title?.trim();
  if (trimmed) {
    return trimmed;
  }
  return save.url || "Untitled";
}

export function MenuRecentsBridge(): null {
  const recents = useRecents();
  const revision = useSelector(savesStore, (s) => s.revision);

  const entries = useMemo<Array<RecentMenuEntry>>(() => {
    void revision;
    const out: Array<RecentMenuEntry> = [];
    for (const entry of recents) {
      const title = titleFor(entry.saveId);
      if (title) {
        out.push({ id: entry.saveId, title });
      }
    }
    return out;
  }, [recents, revision]);

  useEffect(() => {
    window.pond.sendMenuRecents(entries);
  }, [entries]);

  useEffect(() => {
    return window.pond.onMenuOpenSave((id) => {
      openSave(id);
    });
  }, []);

  return null;
}
