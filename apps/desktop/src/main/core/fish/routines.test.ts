import { DEFAULT_PREFS } from "@pond/schema/db";
import { expect, it } from "vitest";
import type {
  AssistantMessage,
  AssistantSend,
  AssistantSendResult,
} from "../../../shared/assistant";
import type {
  Fish,
  FishRoutine,
  FishRun,
} from "../../../shared/fish-contracts";
import { isRoutineDue } from "../../../shared/fish-routine";
import {
  type RoutineDependencies,
  runDueRoutines,
  runFishRoutine,
  runInboxRoutines,
  runNewSaveRoutines,
} from "./routines";

const DAY = 24 * 60 * 60 * 1000;

const digest: FishRoutine = {
  id: "digest",
  name: "Daily digest",
  instruction: "Write a digest.",
  when: { kind: "every", hours: 24 },
  paused: false,
  lastRun: null,
  createdAt: 0,
  updatedAt: 0,
};

const tagging: FishRoutine = {
  ...digest,
  id: "tagging",
  name: "Tag new posters",
  instruction: "Tag new posters.",
  when: { kind: "newSaves" },
};

const curator: Fish = {
  id: "curator",
  name: "Curator",
  color: "teal",
  species: "angelfish",
  instructions: "",
  scope: { folderIds: [], tags: ["poster"] },
  model: { provider: "openai", modelId: "gpt-visible" },
  routines: [digest],
  lastRun: null,
  createdAt: 0,
  updatedAt: 0,
};

function pond(
  school: Fish[],
  reply: (input: AssistantSend) => AssistantSendResult = (input) => ({
    chatId: input.chatId,
    accepted: true,
  }),
) {
  const runs: Array<[string, FishRun]> = [];
  const sent: AssistantSend[] = [];
  const chats: string[] = [];
  const deleted: string[] = [];
  let announcements = 0;
  const messages: AssistantMessage[] = [
    {
      id: "reply",
      chatId: "chat-1",
      role: "assistant",
      content: "Done",
      metadata: {
        changes: [
          {
            id: "a",
            saveId: "s1",
            field: "tags",
            title: "Poster",
            reason: "Matches the poster tag",
            before: [],
            after: ["poster"],
            status: "pending",
          },
        ],
      },
    },
  ];
  const deps: RoutineDependencies = {
    listFish: () => school,
    recordRun: (id, run) => runs.push([id, run]),
    announce: () => {
      announcements += 1;
    },
    getPrefs: async () => ({
      ...DEFAULT_PREFS,
      agent: { ...DEFAULT_PREFS.agent, languageModel: "anthropic" },
    }),
    thread: async (fishId) => {
      chats.push(fishId);
      return { id: `chat-${chats.length}`, created: true };
    },
    deleteChat: async (chatId) => {
      deleted.push(chatId);
      return { ok: true };
    },
    send: async (input) => {
      sent.push(input);
      return reply(input);
    },
    listMessages: async () => messages,
    savesInScope: async (ids) => ids.filter((id) => id.startsWith("poster")),
    now: () => DAY,
  };
  return {
    deps,
    runs,
    sent,
    chats,
    deleted,
    announcements: () => announcements,
  };
}

it("runs a routine in the fish's conversation with the fish's model and counts pending changes", async () => {
  const fake = pond([curator]);
  const run = await runFishRoutine(
    curator,
    digest,
    { kind: "schedule" },
    fake.deps,
  );

  expect(fake.chats).toEqual(["curator"]);
  expect(fake.sent[0]).toMatchObject({
    chatId: "chat-1",
    provider: "openai",
    modelId: "gpt-visible",
    scope: { kind: "library" },
    routine: { trigger: "schedule", routineId: "digest", name: "Daily digest" },
  });
  expect(fake.sent[0]?.content).toContain('"Daily digest"');
  expect(fake.sent[0]?.content).toContain("Write a digest.");
  expect(run).toEqual({
    routineId: "digest",
    routineName: "Daily digest",
    chatId: "chat-1",
    at: DAY,
    status: "done",
    changes: 1,
    seen: false,
  });
  expect(fake.runs).toEqual([["curator", run]]);
  expect(fake.announcements()).toBe(1);
});

it("falls back to the chosen Assistant model when the fish has none", async () => {
  const fake = pond([]);
  await runFishRoutine(
    { ...curator, model: null },
    digest,
    { kind: "manual" },
    fake.deps,
  );
  expect(fake.sent[0]).toMatchObject({ provider: "anthropic" });
  expect(fake.sent[0]?.modelId).toBeUndefined();
});

it("removes the empty chat and reports why when the reply never starts", async () => {
  const fake = pond([curator], (input) => ({
    chatId: input.chatId,
    accepted: false,
    error: "Add an enabled provider key in Settings.",
  }));
  const run = await runFishRoutine(
    curator,
    digest,
    { kind: "schedule" },
    fake.deps,
  );
  expect(fake.deleted).toEqual(["chat-1"]);
  expect(run).toMatchObject({
    chatId: null,
    status: "failed",
    error: "Add an enabled provider key in Settings.",
  });
});

it("keeps an existing conversation when the reply never starts", async () => {
  const fake = pond([curator], (input) => ({
    chatId: input.chatId,
    accepted: false,
    error: "Add an enabled provider key in Settings.",
  }));
  fake.deps.thread = async () => ({ id: "thread", created: false });
  await runFishRoutine(curator, digest, { kind: "schedule" }, fake.deps);
  expect(fake.deleted).toEqual([]);
});

it("runs every-hours routines once their interval has passed since the last run", async () => {
  expect(isRoutineDue(digest, DAY - 1)).toBe(false);
  expect(isRoutineDue(digest, DAY)).toBe(true);
  expect(
    isRoutineDue(
      {
        ...digest,
        lastRun: {
          chatId: "c",
          at: DAY - 10,
          status: "done",
          changes: 0,
          seen: true,
        },
      },
      DAY,
    ),
  ).toBe(false);
  expect(isRoutineDue(tagging, 7 * DAY)).toBe(false);

  const fake = pond([
    { ...curator, routines: [digest, { ...digest, id: "second" }] },
    { ...curator, id: "idle", routines: [] },
  ]);
  await runDueRoutines(fake.deps);
  expect(fake.chats).toEqual(["curator", "curator"]);
  expect(fake.sent.map((input) => input.routine?.routineId)).toEqual([
    "digest",
    "second",
  ]);
});

it("waits for the next daily slot after a routine is created", () => {
  const created = new Date(2026, 9, 26, 8, 5).getTime();
  const weekdays: FishRoutine = {
    ...digest,
    when: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
    createdAt: created,
  };
  expect(isRoutineDue(weekdays, new Date(2026, 9, 26, 9, 0).getTime())).toBe(
    false,
  );
  expect(isRoutineDue(weekdays, new Date(2026, 9, 27, 7, 59).getTime())).toBe(
    false,
  );
  expect(isRoutineDue(weekdays, new Date(2026, 9, 27, 8, 0).getTime())).toBe(
    true,
  );
  const saturday = new Date(2026, 9, 31, 8, 0).getTime();
  expect(
    isRoutineDue(
      {
        ...weekdays,
        lastRun: {
          chatId: "c",
          at: new Date(2026, 9, 30, 8, 2).getTime(),
          status: "done",
          changes: 0,
          seen: true,
        },
      },
      saturday,
    ),
  ).toBe(false);
});

it("hands new Saves only to fish whose scope includes them", async () => {
  const librarian: Fish = {
    ...curator,
    id: "librarian",
    routines: [tagging],
  };
  const fake = pond([curator, librarian]);
  await runNewSaveRoutines(["poster-1", "film-1", "poster-2"], fake.deps);

  expect(fake.chats).toEqual(["librarian"]);
  expect(fake.sent[0]?.routine).toEqual({
    trigger: "newSaves",
    saves: 2,
    routineId: "tagging",
    name: "Tag new posters",
  });
  expect(fake.sent[0]?.content).toContain("poster-1, poster-2");
  expect(fake.sent[0]?.content).not.toContain("film-1");

  const none = pond([librarian]);
  await runNewSaveRoutines(["film-1"], none.deps);
  expect(none.chats).toEqual([]);
});

it("skips paused routines until you resume them", async () => {
  expect(isRoutineDue({ ...digest, paused: true }, 7 * DAY)).toBe(false);

  const fake = pond([
    {
      ...curator,
      id: "librarian",
      routines: [{ ...tagging, paused: true }],
    },
  ]);
  await runNewSaveRoutines(["poster-1"], fake.deps);
  expect(fake.chats).toEqual([]);
});

it("asks Inbox routines for suggestions on Saves still waiting for review", async () => {
  const triage: FishRoutine = {
    ...tagging,
    id: "triage",
    name: "Triage",
    when: { kind: "inbox" },
  };
  const sorter: Fish = {
    ...curator,
    id: "sorter",
    routines: [triage, tagging],
  };
  const fake = pond([sorter]);
  const asked: boolean[] = [];
  fake.deps.savesInScope = async (ids, _fish, inInbox) => {
    asked.push(inInbox === true);
    return ids.filter((id) => id !== "processed");
  };

  await runInboxRoutines(["poster-1", "processed"], fake.deps);

  expect(asked).toEqual([true]);
  expect(fake.sent).toHaveLength(1);
  expect(fake.sent[0]?.routine).toEqual({
    trigger: "inbox",
    saves: 1,
    routineId: "triage",
    name: "Triage",
  });
  expect(fake.sent[0]?.content).toContain(
    "Saves waiting in the Inbox (read them by ID): poster-1\n",
  );
  expect(isRoutineDue(triage, 7 * DAY)).toBe(false);
});
