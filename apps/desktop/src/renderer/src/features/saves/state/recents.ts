import type { RecentSaveVisit } from "@pond/schema/db";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import { protectSaves } from "@/features/saves/state/pool";
import { loadPrefs, patchPrefsSection } from "@/shared/state/prefs";

const RECENTS_CAP = 20;

const store = new Store<RecentSaveVisit[]>([]);

protectSaves(() => store.state.map((entry) => entry.saveId));

const RecentsSchema = z.array(
  z
    .object({ saveId: z.string(), visitedAt: z.number() })
    .nullable()
    .catch(null),
);

let hydrated = false;
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  void loadPrefs()
    .then((prefs) => {
      const entries = RecentsSchema.safeParse(prefs.saveRecents?.entries);
      if (entries.success) {
        store.setState(() =>
          entries.data
            .filter((e): e is RecentSaveVisit => e !== null)
            .slice(0, RECENTS_CAP),
        );
      }
    })
    .catch(() => {});
}

hydrate();

function recordVisit(saveId: string): void {
  store.setState((state) => {
    const top = state[0];
    if (top?.saveId === saveId) {
      return [{ saveId, visitedAt: Date.now() }, ...state.slice(1)];
    }
    return [
      { saveId, visitedAt: Date.now() },
      ...state.filter((e) => e.saveId !== saveId),
    ].slice(0, RECENTS_CAP);
  });
  patchPrefsSection("saveRecents", { entries: store.state });
}

export function clearRecents(): void {
  store.setState(() => []);
  patchPrefsSection("saveRecents", { entries: [] });
}

export function useRecents(): RecentSaveVisit[] {
  return useSelector(store, (s) => s);
}

export function useTrackVisit(saveId: string | null | undefined): void {
  useEffect(() => {
    if (!saveId) return;
    recordVisit(saveId);
  }, [saveId]);
}
