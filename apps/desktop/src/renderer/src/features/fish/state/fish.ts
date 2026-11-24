import {
  DEFAULT_FISH_ID,
  type Fish,
  type FishPatch,
  type FishPlacement,
  type FishSection,
  type FishSummary,
} from "@shared/fish-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { getAppRouter } from "@/shared/lib/app-router";

interface OpenRoutine {
  fishId: string;
  routineId: string;
}

interface FishState {
  school: FishSummary[];
  sections: FishSection[];
  editingId: string | null;
  routine: OpenRoutine | null;
}

const store = new Store<FishState>({
  school: [],
  sections: [],
  editingId: null,
  routine: null,
});

let subscribers = 0;
let unsubscribe: (() => void) | null = null;

export function fishPath(id: string): string {
  return `/fish/${encodeURIComponent(id)}`;
}

export function fishIdFromPath(pathname: string): string | null {
  const match = /^\/fish\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function replace(next: Fish): void {
  store.setState((state) => ({
    ...state,
    school: state.school.some((fish) => fish.id === next.id)
      ? state.school.map((fish) =>
          fish.id === next.id
            ? { ...next, activity: fish.activity, latest: fish.latest }
            : fish,
        )
      : [...state.school, { ...next, activity: null, latest: null }],
  }));
}

async function rollbackOnFailure(write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch (error) {
    await fish.refresh().catch(() => undefined);
    throw error;
  }
}

export const fish = {
  snapshot(): FishSummary[] {
    return store.state.school;
  },
  find(id: string): FishSummary | undefined {
    return store.state.school.find((entry) => entry.id === id);
  },
  sections(): FishSection[] {
    return store.state.sections;
  },
  async refresh(): Promise<void> {
    const [school, sections] = await Promise.all([
      window.pond.query("fish.list", {}),
      window.pond.query("fish.sections", {}),
    ]);
    store.setState((state) => ({ ...state, school, sections }));
  },
  /** Applies the new order before main confirms it, so a dropped fish never snaps back. */
  async arrange(placements: FishPlacement[]): Promise<void> {
    store.setState((state) => {
      const byId = new Map(state.school.map((entry) => [entry.id, entry]));
      const placed = placements.flatMap((placement) => {
        const entry = byId.get(placement.id);
        if (!entry) return [];
        byId.delete(placement.id);
        return [
          {
            ...entry,
            pinned: placement.pinned,
            section: placement.section ?? undefined,
          },
        ];
      });
      return { ...state, school: [...placed, ...byId.values()] };
    });
    await rollbackOnFailure(window.pond.query("fish.arrange", { placements }));
  },
  async setSections(sections: FishSection[]): Promise<void> {
    store.setState((state) => ({ ...state, sections }));
    await rollbackOnFailure(
      window.pond.query("fish.setSections", { sections }),
    );
  },
  open(id: string): void {
    getAppRouter()?.history.push(fishPath(id));
  },
  async create(patch: FishPatch = {}): Promise<Fish> {
    const created = await window.pond.query("fish.create", patch);
    replace(created);
    return created;
  },
  async update(id: string, patch: FishPatch): Promise<Fish> {
    const updated = await window.pond.query("fish.update", { id, patch });
    replace(updated);
    return updated;
  },
  async remove(id: string): Promise<void> {
    const result = await window.pond.query("fish.delete", { id });
    if (!result.ok) throw new Error(result.error);
    const router = getAppRouter();
    if (router && fishIdFromPath(router.state.location.pathname) === id)
      fish.open(DEFAULT_FISH_ID);
    await fish.refresh();
  },
  async run(id: string, routineId: string): Promise<void> {
    const result = await window.pond.query("fish.run", { id, routineId });
    if (!result.ok) throw new Error(result.error);
  },
  async pauseRoutine(
    id: string,
    routineId: string,
    paused: boolean,
  ): Promise<void> {
    replace(
      await window.pond.query("fish.pauseRoutine", { id, routineId, paused }),
    );
  },
  async deleteRoutine(id: string, routineId: string): Promise<void> {
    replace(await window.pond.query("fish.deleteRoutine", { id, routineId }));
    if (store.state.routine?.routineId === routineId) fish.closeRoutine();
  },
  /** Opens the fish's page with one of its routines showing in the details pane. */
  openRoutine(fishId: string, routineId: string): void {
    const router = getAppRouter();
    if (router && fishIdFromPath(router.state.location.pathname) !== fishId)
      fish.open(fishId);
    store.setState((state) => ({ ...state, routine: { fishId, routineId } }));
  },
  closeRoutine(): void {
    store.setState((state) => ({ ...state, routine: null }));
  },
  async markSeen(id: string): Promise<void> {
    const current = fish.find(id);
    if (
      !current ||
      (current.lastRun?.seen !== false &&
        !current.runs?.some((run) => !run.seen))
    )
      return;
    replace({
      ...current,
      lastRun: current.lastRun && { ...current.lastRun, seen: true },
      runs: current.runs?.map((run) => ({ ...run, seen: true })),
    });
    await window.pond.query("fish.markSeen", { id });
  },
  /** Opens the fish's page with its details pane focused on the name. */
  startEditing(id: string): void {
    const router = getAppRouter();
    if (router && fishIdFromPath(router.state.location.pathname) !== id)
      fish.open(id);
    store.setState((state) => ({ ...state, editingId: id }));
  },
  finishEditing(): void {
    store.setState((state) => ({ ...state, editingId: null }));
  },
};

export function useFishList(): FishSummary[] {
  return useSelector(store, (state) => state.school);
}

export function useFishSections(): FishSection[] {
  return useSelector(store, (state) => state.sections);
}

export function useFish(id: string | null): FishSummary | undefined {
  return useSelector(store, (state) =>
    id ? state.school.find((entry) => entry.id === id) : undefined,
  );
}

export function useFishEditingId(): string | null {
  return useSelector(store, (state) => state.editingId);
}

export function useOpenRoutineId(fishId: string | null): string | null {
  return useSelector(store, (state) =>
    state.routine && state.routine.fishId === fishId
      ? state.routine.routineId
      : null,
  );
}

/** One subscription to main's fish events serves every mounted consumer. */
export function useHydrateFish(): void {
  useEffect(() => {
    if (subscribers++ === 0) {
      void fish.refresh().catch(() => undefined);
      unsubscribe = window.pond.onFish((event) => {
        if (event.kind === "changed" || event.activity === null) {
          void fish.refresh().catch(() => undefined);
          if (event.kind === "changed") return;
        }
        store.setState((state) => ({
          ...state,
          school: state.school.map((entry) =>
            entry.id === event.fishId
              ? { ...entry, activity: event.activity }
              : entry,
          ),
        }));
      });
    }
    return () => {
      if (--subscribers === 0) {
        unsubscribe?.();
        unsubscribe = null;
      }
    };
  }, []);
}
