import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { DEFAULT_FISH_ID, FISH_RUN_CAP } from "../../../shared/fish-contracts";
import {
  arrangeFish,
  createFish,
  createRoutine,
  deleteFish,
  deleteRoutine,
  listFish,
  listFishSections,
  markFishSeen,
  recordFishRun,
  setFishSections,
  setRoutinePaused,
  updateFish,
  updateRoutine,
} from "./store";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function library(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-fish-"));
  roots.push(root);
  return root;
}

it("starts every Library with the default fish without writing a file", async () => {
  const root = await library();
  expect(listFish(root, 5)).toMatchObject([
    { id: DEFAULT_FISH_ID, name: "Koi", routines: [] },
  ]);
  await expect(readFile(join(root, "fish.json"), "utf8")).rejects.toThrow();
});

it("stores new fish in the Library with distinct names, colors, and species", async () => {
  const root = await library();
  const first = createFish({ name: "Librarian" }, root, 1);
  const second = createFish({ name: "Librarian" }, root, 2);

  expect(second.name).toBe("Librarian 2");
  expect(new Set(listFish(root).map((fish) => fish.color)).size).toBe(3);
  expect(new Set(listFish(root).map((fish) => fish.species)).size).toBe(3);
  const stored = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(JSON.parse(await readFile(join(root, "fish.json"), "utf8")));
  expect(stored.data.map((fish) => fish.id)).toEqual([
    DEFAULT_FISH_ID,
    first.id,
    second.id,
  ]);
});

it("edits a fish's fields and keeps the rest", async () => {
  const root = await library();
  const fish = createFish({ name: "Scout" }, root, 1);
  const edited = updateFish(
    fish.id,
    {
      instructions: "Watch for typography.",
      scope: { folderIds: [], tags: ["type"] },
    },
    root,
    9,
  );
  expect(edited).toMatchObject({
    name: "Scout",
    instructions: "Watch for typography.",
    scope: { tags: ["type"] },
    updatedAt: 9,
  });
  expect(listFish(root).find((entry) => entry.id === fish.id)).toEqual(edited);
  expect(() => updateFish(fish.id, { name: " " }, root)).toThrow();
});

it("keeps the default fish and removes others", async () => {
  const root = await library();
  const fish = createFish({}, root, 1);
  expect(deleteFish(DEFAULT_FISH_ID, root)).toMatchObject({ ok: false });
  expect(deleteFish(fish.id, root)).toEqual({ ok: true });
  expect(deleteFish(fish.id, root)).toMatchObject({ ok: false });
  expect(listFish(root).map((entry) => entry.id)).toEqual([DEFAULT_FISH_ID]);
});

it("records a routine result until it has been seen", async () => {
  const root = await library();
  recordFishRun(
    DEFAULT_FISH_ID,
    {
      chatId: "chat",
      at: 3,
      status: "done",
      changes: 2,
      seen: false,
    },
    root,
  );
  markFishSeen(DEFAULT_FISH_ID, root);
  expect(listFish(root)[0]?.lastRun).toMatchObject({ changes: 2, seen: true });
});

it("keeps a capped run history, newest first, and marks it all seen", async () => {
  const root = await library();
  for (let at = 1; at <= FISH_RUN_CAP + 5; at += 1) {
    recordFishRun(
      DEFAULT_FISH_ID,
      { chatId: "chat", at, status: "done", changes: 0, seen: false },
      root,
    );
  }
  const runs = listFish(root)[0]?.runs ?? [];
  expect(runs).toHaveLength(FISH_RUN_CAP);
  expect(runs[0]?.at).toBe(FISH_RUN_CAP + 5);
  expect(runs.at(-1)?.at).toBe(6);
  markFishSeen(DEFAULT_FISH_ID, root);
  expect(listFish(root)[0]?.runs?.every((run) => run.seen)).toBe(true);
});

it("keeps many routines per fish and records each one's own run", async () => {
  const root = await library();
  const fish = createFish({ name: "Scout" }, root, 1);
  const { routine: ping } = createRoutine(
    fish.id,
    {
      name: "Weekday morning ping",
      instruction: "Say good morning.",
      when: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    },
    root,
    2,
  );
  const { routine: tagging } = createRoutine(
    fish.id,
    {
      name: "Tag new Saves",
      instruction: "Tag them.",
      when: { kind: "newSaves" },
    },
    root,
    3,
  );
  updateRoutine(fish.id, ping.id, { name: "Morning ping" }, root, 4);
  setRoutinePaused(fish.id, tagging.id, true, root, 5);
  recordFishRun(
    fish.id,
    {
      routineId: ping.id,
      chatId: "chat",
      at: 6,
      status: "done",
      changes: 0,
      seen: false,
    },
    root,
  );
  const stored = listFish(root).find((entry) => entry.id === fish.id);
  expect(stored?.routines).toMatchObject([
    { name: "Morning ping", paused: false, lastRun: { at: 6 } },
    { name: "Tag new Saves", paused: true, lastRun: null },
  ]);
  expect(stored?.lastRun).toMatchObject({ routineId: ping.id });

  deleteRoutine(fish.id, tagging.id, root, 7);
  expect(
    listFish(root)
      .find((entry) => entry.id === fish.id)
      ?.routines.map((routine) => routine.id),
  ).toEqual([ping.id]);
  expect(() => deleteRoutine(fish.id, tagging.id, root)).toThrow(
    "This routine no longer exists.",
  );
});

it("reads a fish's single routine from before routines were a list", async () => {
  const root = await library();
  createFish({ name: "Scout" }, root, 1);
  const file = join(root, "fish.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  const [koi, scout] = stored.data;
  delete koi.routines;
  koi.routine = { kind: "off" };
  delete scout.routines;
  scout.routine = {
    kind: "schedule",
    every: "week",
    task: "Sum up the week.",
    paused: true,
  };
  await writeFile(file, JSON.stringify(stored));
  const [first, second] = listFish(root);
  expect(first?.routines).toEqual([]);
  expect(second?.routines).toMatchObject([
    {
      instruction: "Sum up the week.",
      when: { kind: "every", hours: 168 },
      paused: true,
    },
  ]);
});

it("reads fish saved before species existed as koi", async () => {
  const root = await library();
  createFish({ name: "Scout", species: "shark" }, root, 1);
  const file = join(root, "fish.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  for (const fish of stored.data) {
    delete fish.species;
  }
  await writeFile(file, JSON.stringify(stored));
  expect(listFish(root).map((fish) => fish.species)).toEqual(["koi", "koi"]);
});

it("arranges fish into sections and keeps unplaced fish after them", async () => {
  const root = await library();
  const scout = createFish({ name: "Scout" }, root, 1);
  const clerk = createFish({ name: "Clerk" }, root, 2);
  expect(listFishSections(root)).toEqual([]);
  setFishSections([{ id: "staff", name: "Staff" }], root);

  arrangeFish(
    [
      { id: clerk.id, pinned: true, section: null },
      { id: scout.id, pinned: false, section: "staff" },
      { id: "missing", pinned: false, section: null },
    ],
    root,
  );

  expect(
    listFish(root).map(({ id, pinned, section }) => ({ id, pinned, section })),
  ).toEqual([
    { id: clerk.id, pinned: true, section: undefined },
    { id: scout.id, pinned: false, section: "staff" },
    { id: DEFAULT_FISH_ID, pinned: undefined, section: undefined },
  ]);
});

it("returns a deleted section's fish to the loose list", async () => {
  const root = await library();
  const scout = createFish({ name: "Scout" }, root, 1);
  setFishSections(
    [
      { id: "app", name: "App" },
      { id: "app", name: "Apps" },
    ],
    root,
  );
  expect(listFishSections(root)).toEqual([{ id: "app", name: "Apps" }]);
  arrangeFish([{ id: scout.id, pinned: false, section: "app" }], root);

  setFishSections([], root);

  expect(listFish(root).find((fish) => fish.id === scout.id)?.section).toBe(
    undefined,
  );
});

it("refuses to treat an unreadable fish file as an empty pond", async () => {
  const root = await library();
  await writeFile(join(root, "fish.json"), "{not json");
  expect(() => listFish(root)).toThrow("Your fish could not be read.");
});
