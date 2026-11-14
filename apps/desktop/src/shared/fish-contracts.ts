import { z } from "zod";
import { type AssistantActivity, assistantProvider } from "./assistant";

export const DEFAULT_FISH_ID = "default";
export const DEFAULT_FISH_NAME = "Koi";

export const FISH_COLORS = [
  "red",
  "orange",
  "gold",
  "yellow",
  "lime",
  "green",
  "jade",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "magenta",
  "pink",
] as const;
export const FishColorSchema = z.enum(FISH_COLORS);
export type FishColor = z.infer<typeof FishColorSchema>;

export const FISH_SPECIES = [
  "koi",
  "goldfish",
  "puffer",
  "clownfish",
  "angelfish",
  "shark",
  "anglerfish",
  "sunfish",
  "swordfish",
  "seahorse",
  "betta",
  "manta",
  "eel",
  "catfish",
  "lionfish",
] as const;
export const FishSpeciesSchema = z.enum(FISH_SPECIES);
export type FishSpecies = z.infer<typeof FishSpeciesSchema>;

export const FishIdSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/, "Invalid fish id");

export const FishScopeSchema = z.object({
  folderIds: z.array(z.string().min(1).max(200)).max(200),
  tags: z.array(z.string().min(1).max(200)).max(200),
});
export type FishScope = z.infer<typeof FishScopeSchema>;

const FishModelSchema = z.object({
  provider: assistantProvider,
  modelId: z.string().trim().min(1).max(300),
});

export const FishRunSchema = z.object({
  routineId: z.string().min(1).max(64).optional(),
  routineName: z.string().max(60).optional(),
  chatId: z.string().min(1).nullable(),
  at: z.number(),
  status: z.enum(["done", "failed"]),
  error: z.string().max(2000).optional(),
  changes: z.number().int().min(0),
  seen: z.boolean(),
});
export type FishRun = z.infer<typeof FishRunSchema>;

export const FISH_ROUTINE_CAP = 50;

/** Days use `Date.getDay()` numbering, so 0 is Sunday. */
export const FishWhenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("newSaves") }),
  z.object({ kind: z.literal("inbox") }),
  z.object({
    kind: z.literal("every"),
    hours: z.number().int().min(1).max(168),
  }),
  z.object({
    kind: z.literal("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
]);
export type FishWhen = z.infer<typeof FishWhenSchema>;

export const FishRoutineInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  instruction: z.string().trim().min(1).max(4000),
  when: FishWhenSchema,
});
export type FishRoutineInput = z.infer<typeof FishRoutineInputSchema>;

export const FishRoutinePatchSchema = FishRoutineInputSchema.partial();
export type FishRoutinePatch = z.infer<typeof FishRoutinePatchSchema>;

export const FishRoutineSchema = FishRoutineInputSchema.extend({
  id: z.string().min(1).max(64),
  paused: z.boolean(),
  lastRun: FishRunSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type FishRoutine = z.infer<typeof FishRoutineSchema>;

const FishFieldsSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: FishColorSchema,
  species: FishSpeciesSchema,
  instructions: z.string().max(8000),
  scope: FishScopeSchema,
  model: FishModelSchema.nullable(),
});
export const FishSchema = FishFieldsSchema.extend({
  species: FishSpeciesSchema.default("koi"),
  id: FishIdSchema,
  routines: z.array(FishRoutineSchema).max(FISH_ROUTINE_CAP),
  lastRun: FishRunSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Fish = z.infer<typeof FishSchema>;

export const FishPatchSchema = FishFieldsSchema.partial();
export type FishPatch = z.infer<typeof FishPatchSchema>;

/** What a fish is doing right now; `null` when it is idle. */
export type FishPresence = AssistantActivity | null;

export type FishEvent =
  | { kind: "changed" }
  | { kind: "presence"; fishId: string; activity: FishPresence };

/** Saves captured in the browser for a fish, to attach in its chat. */
export interface FishOpen {
  fishId: string;
  saveIds: string[];
}

export interface FishLatest {
  from: "you" | "fish" | "routine";
  text: string;
  at: number;
}

export interface FishSummary extends Fish {
  activity: FishPresence;
  latest: FishLatest | null;
}

export interface FishQueryInputs {
  "fish.list": Record<string, never>;
  "fish.create": FishPatch;
  "fish.update": { id: string; patch: FishPatch };
  "fish.delete": { id: string };
  "fish.markSeen": { id: string };
  "fish.run": { id: string; routineId: string };
  "fish.pauseRoutine": { id: string; routineId: string; paused: boolean };
  "fish.deleteRoutine": { id: string; routineId: string };
}

export interface FishQueryResults {
  "fish.list": FishSummary[];
  "fish.create": Fish;
  "fish.update": Fish;
  "fish.delete": { ok: true } | { ok: false; error: string };
  "fish.markSeen": { ok: true };
  "fish.run": { ok: true } | { ok: false; error: string };
  "fish.pauseRoutine": Fish;
  "fish.deleteRoutine": Fish;
}
