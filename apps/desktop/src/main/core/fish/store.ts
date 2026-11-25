import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_FISH_ID,
  DEFAULT_FISH_NAME,
  FISH_COLORS,
  FISH_ROUTINE_CAP,
  FISH_RUN_CAP,
  FISH_SPECIES,
  FishPatchSchema,
  FishPlacementSchema,
  FishRoutineInputSchema,
  FishRoutinePatchSchema,
  FishSchema,
  FishSectionSchema,
} from "../../../shared/fish-contracts";
import type {
  Fish,
  FishPatch,
  FishPlacement,
  FishRoutine,
  FishRoutineInput,
  FishRoutinePatch,
  FishRun,
  FishSection,
  FishWhen,
} from "../../../shared/fish-contracts";
import { readBundleJson, writeBundleJson } from "../../lib/library-config";
import { resolvePaths } from "../../paths";

function fishFile(root: string): string {
  return join(root, "fish.json");
}

/** Sections live beside `fish.json` so builds that predate them still read the school. */
function sectionsFile(root: string): string {
  return join(root, "fish-sections.json");
}

function defaultFish(now: number): Fish {
  return {
    id: DEFAULT_FISH_ID,
    name: DEFAULT_FISH_NAME,
    color: "orange",
    species: "koi",
    instructions: "",
    scope: { folderIds: [], tags: [] },
    model: null,
    routines: [],
    lastRun: null,
    createdAt: now,
    updatedAt: now,
  };
}

function uniqueName(base: string, taken: ReadonlyArray<Fish>): string {
  const names = new Set(taken.map((fish) => fish.name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

const LEGACY_HOURS = { hour: 1, day: 24, week: 168 } as const;

const LegacyRoutineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("off") }),
  z.object({
    kind: z.literal("newSaves"),
    task: z.string(),
    paused: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("schedule"),
    every: z.enum(["hour", "day", "week"]),
    task: z.string(),
    paused: z.boolean().optional(),
  }),
]);

/** Fish written before routines were a list carry one `routine`; it becomes the first entry. */
const StoredFishSchema = z.preprocess((raw) => {
  const fish = z
    .looseObject({
      routine: LegacyRoutineSchema.optional(),
      routines: z.unknown().optional(),
      lastRun: z.unknown().optional(),
      updatedAt: z.number().optional(),
    })
    .safeParse(raw);
  if (!fish.success || fish.data.routines !== undefined) return raw;
  const { routine, ...rest } = fish.data;
  if (!routine || routine.kind === "off") return { ...rest, routines: [] };
  const when: FishWhen =
    routine.kind === "newSaves"
      ? { kind: "newSaves" }
      : { kind: "every", hours: LEGACY_HOURS[routine.every] };
  const at = fish.data.updatedAt ?? 0;
  return {
    ...rest,
    routines: [
      {
        id: "routine",
        name: routine.kind === "newSaves" ? "New Saves" : "Check In",
        instruction: routine.task,
        when,
        paused: routine.paused ?? false,
        lastRun: fish.data.lastRun ?? null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  };
}, FishSchema);

function write(root: string, school: ReadonlyArray<Fish>): void {
  writeBundleJson(fishFile(root), z.array(FishSchema).parse(school));
}

/** The default fish exists in every Library, even before `fish.json` is written. */
export function listFish(
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Array<Fish> {
  const file = fishFile(root);
  const stored = readBundleJson(file);
  if (!stored) {
    if (existsSync(file)) throw new Error("Your fish could not be read.");
    return [defaultFish(now)];
  }
  const school = z.array(StoredFishSchema).parse(stored.data);
  return school.some((fish) => fish.id === DEFAULT_FISH_ID)
    ? school
    : [defaultFish(now), ...school];
}

export function readFish(
  id: string,
  root = resolvePaths().libraryRoot,
): Fish | null {
  return listFish(root).find((fish) => fish.id === id) ?? null;
}

function requireFish(school: ReadonlyArray<Fish>, id: string): Fish {
  const fish = school.find((entry) => entry.id === id);
  if (!fish) throw new Error("This fish no longer exists.");
  return fish;
}

export function createFish(
  patch: FishPatch,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Fish {
  const fields = FishPatchSchema.parse(patch);
  const school = listFish(root, now);
  const used = new Set(school.map((fish) => fish.color));
  const fish = FishSchema.parse({
    id: randomUUID(),
    name: uniqueName(fields.name ?? "New Fish", school),
    color:
      fields.color ??
      FISH_COLORS.find((color) => !used.has(color)) ??
      FISH_COLORS[school.length % FISH_COLORS.length],
    species:
      fields.species ?? FISH_SPECIES[school.length % FISH_SPECIES.length],
    instructions: fields.instructions ?? "",
    scope: fields.scope ?? { folderIds: [], tags: [] },
    model: fields.model ?? null,
    routines: [],
    lastRun: null,
    createdAt: now,
    updatedAt: now,
  });
  write(root, [...school, fish]);
  return fish;
}

export function updateFish(
  id: string,
  patch: FishPatch,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Fish {
  const fields = FishPatchSchema.parse(patch);
  const school = listFish(root, now);
  const next = FishSchema.parse({
    ...requireFish(school, id),
    ...fields,
    updatedAt: now,
  });
  write(
    root,
    school.map((fish) => (fish.id === id ? next : fish)),
  );
  return next;
}

/** The latest run shows on the fish's row; a routine's own run shows on the routine. */
export function recordFishRun(
  id: string,
  run: FishRun | null,
  root = resolvePaths().libraryRoot,
): Fish {
  const school = listFish(root);
  const current = requireFish(school, id);
  const next = FishSchema.parse({
    ...current,
    lastRun: run,
    runs: run
      ? [run, ...(current.runs ?? [])].slice(0, FISH_RUN_CAP)
      : current.runs,
    routines: current.routines.map((routine) =>
      run?.routineId === routine.id ? { ...routine, lastRun: run } : routine,
    ),
  });
  write(
    root,
    school.map((fish) => (fish.id === id ? next : fish)),
  );
  return next;
}

function seen(run: FishRun): FishRun {
  return run.seen ? run : { ...run, seen: true };
}

export function markFishSeen(
  id: string,
  root = resolvePaths().libraryRoot,
): void {
  const school = listFish(root);
  const current = school.find((fish) => fish.id === id);
  if (!current) return;
  const unseen =
    current.lastRun?.seen === false ||
    current.runs?.some((run) => !run.seen) ||
    current.routines.some((routine) => routine.lastRun?.seen === false);
  if (!unseen) return;
  const next = FishSchema.parse({
    ...current,
    lastRun: current.lastRun && seen(current.lastRun),
    runs: current.runs?.map(seen),
    routines: current.routines.map((routine) =>
      routine.lastRun
        ? { ...routine, lastRun: seen(routine.lastRun) }
        : routine,
    ),
  });
  write(
    root,
    school.map((fish) => (fish.id === id ? next : fish)),
  );
}

export function deleteFish(
  id: string,
  root = resolvePaths().libraryRoot,
): { ok: true } | { ok: false; error: string } {
  if (id === DEFAULT_FISH_ID) {
    return { ok: false, error: "Your first fish stays in the pond." };
  }
  const school = listFish(root);
  if (!school.some((fish) => fish.id === id)) {
    return { ok: false, error: "This fish no longer exists." };
  }
  write(
    root,
    school.filter((fish) => fish.id !== id),
  );
  return { ok: true };
}

export function listFishSections(
  root = resolvePaths().libraryRoot,
): Array<FishSection> {
  const file = sectionsFile(root);
  const stored = readBundleJson(file);
  if (!stored) {
    if (existsSync(file)) {
      throw new Error("Your fish sections could not be read.");
    }
    return [];
  }
  return z.array(FishSectionSchema).parse(stored.data);
}

/** Replaces the section list; fish in a removed section return to the loose list. */
export function setFishSections(
  sections: ReadonlyArray<FishSection>,
  root = resolvePaths().libraryRoot,
): Array<FishSection> {
  const parsed = z.array(FishSectionSchema).parse(sections);
  const next = [
    ...new Map(parsed.map((section) => [section.id, section])).values(),
  ];
  const seen = new Set(next.map((section) => section.id));
  writeBundleJson(sectionsFile(root), next);
  const school = listFish(root);
  if (school.some((fish) => fish.section && !seen.has(fish.section))) {
    write(
      root,
      school.map((fish) =>
        fish.section && !seen.has(fish.section)
          ? { ...fish, section: undefined }
          : fish,
      ),
    );
  }
  return next;
}

/** Fish missing from `placements` keep their place after the placed ones. */
export function arrangeFish(
  placements: ReadonlyArray<FishPlacement>,
  root = resolvePaths().libraryRoot,
): void {
  const parsed = z.array(FishPlacementSchema).parse(placements);
  const school = listFish(root);
  const sections = new Set(listFishSections(root).map((section) => section.id));
  const byId = new Map(school.map((fish) => [fish.id, fish]));
  const placed = new Set<string>();
  const arranged: Array<Fish> = [];
  for (const placement of parsed) {
    const fish = byId.get(placement.id);
    if (!fish || placed.has(fish.id)) continue;
    placed.add(fish.id);
    const section =
      !placement.pinned && placement.section && sections.has(placement.section)
        ? placement.section
        : undefined;
    arranged.push({ ...fish, pinned: placement.pinned, section });
  }
  write(root, [...arranged, ...school.filter((fish) => !placed.has(fish.id))]);
}

function requireRoutine(fish: Fish, routineId: string): FishRoutine {
  const routine = fish.routines.find((entry) => entry.id === routineId);
  if (!routine) throw new Error("This routine no longer exists.");
  return routine;
}

function writeRoutines(
  id: string,
  edit: (fish: Fish) => Array<FishRoutine>,
  root: string,
  now: number,
): Fish {
  const school = listFish(root, now);
  const current = requireFish(school, id);
  const next = FishSchema.parse({
    ...current,
    routines: edit(current),
    updatedAt: now,
  });
  write(
    root,
    school.map((fish) => (fish.id === id ? next : fish)),
  );
  return next;
}

export interface RoutineChange {
  fish: Fish;
  routine: FishRoutine;
}

export function createRoutine(
  fishId: string,
  input: FishRoutineInput,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): RoutineChange {
  const fields = FishRoutineInputSchema.parse(input);
  const routine: FishRoutine = {
    ...fields,
    id: randomUUID(),
    paused: false,
    lastRun: null,
    createdAt: now,
    updatedAt: now,
  };
  const fish = writeRoutines(
    fishId,
    (current) => {
      if (current.routines.length >= FISH_ROUTINE_CAP) {
        throw new Error(
          `A fish can have up to ${FISH_ROUTINE_CAP} routines. Delete one first.`,
        );
      }
      return [...current.routines, routine];
    },
    root,
    now,
  );
  return { fish, routine };
}

export function updateRoutine(
  fishId: string,
  routineId: string,
  patch: FishRoutinePatch,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): RoutineChange {
  const fields = FishRoutinePatchSchema.parse(patch);
  let routine: FishRoutine | undefined;
  const fish = writeRoutines(
    fishId,
    (current) => {
      const next = { ...requireRoutine(current, routineId), ...fields };
      routine = { ...next, updatedAt: now };
      return current.routines.map((entry) =>
        entry.id === routineId && routine ? routine : entry,
      );
    },
    root,
    now,
  );
  if (!routine) throw new Error("This routine no longer exists.");
  return { fish, routine };
}

export function setRoutinePaused(
  fishId: string,
  routineId: string,
  paused: boolean,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Fish {
  return writeRoutines(
    fishId,
    (current) => {
      requireRoutine(current, routineId);
      return current.routines.map((entry) =>
        entry.id === routineId ? { ...entry, paused, updatedAt: now } : entry,
      );
    },
    root,
    now,
  );
}

export function deleteRoutine(
  fishId: string,
  routineId: string,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): RoutineChange {
  let routine: FishRoutine | undefined;
  const fish = writeRoutines(
    fishId,
    (current) => {
      routine = requireRoutine(current, routineId);
      return current.routines.filter((entry) => entry.id !== routineId);
    },
    root,
    now,
  );
  if (!routine) throw new Error("This routine no longer exists.");
  return { fish, routine };
}
