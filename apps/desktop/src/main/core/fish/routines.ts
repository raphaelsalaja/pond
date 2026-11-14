import { randomUUID } from "node:crypto";
import type { Prefs } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import {
  ASSISTANT_MODELS,
  type AssistantMessage,
  type AssistantSend,
  type AssistantSendResult,
  assistantMessages,
} from "../../../shared/assistant";
import type {
  Fish,
  FishRoutine,
  FishRun,
} from "../../../shared/fish-contracts";
import { isRoutineDue } from "../../../shared/fish-routine";
import type { OkSuccess } from "../../../shared/query-contracts-shared";
import { getDb } from "../../db";
import { libraryScopeClauses } from "../library-retrieval";
import { getPrefs } from "../prefs";
import { announceFishChanged } from "./presence";
import { fishScopeFilter } from "./scope";
import { listFish, recordFishRun } from "./store";

const MAX_NEW_SAVES = 200;

export type RoutineTrigger =
  | { kind: "manual" }
  | { kind: "schedule" }
  | { kind: "newSaves"; saveIds: string[] }
  | { kind: "inbox"; saveIds: string[] };

export interface RoutineDependencies {
  listFish(): Fish[];
  recordRun(id: string, run: FishRun): void;
  announce(): void;
  getPrefs(): Promise<Prefs>;
  thread(fishId: string): Promise<{ id: string; created: boolean }>;
  deleteChat(chatId: string): Promise<OkSuccess>;
  send(input: AssistantSend): Promise<AssistantSendResult>;
  listMessages(chatId: string): Promise<AssistantMessage[]>;
  savesInScope(
    saveIds: readonly string[],
    fish: Fish,
    inInbox?: boolean,
  ): Promise<string[]>;
  now(): number;
}

const defaultDependencies: RoutineDependencies = {
  listFish: () => listFish(),
  recordRun: (id, run) => {
    recordFishRun(id, run);
  },
  announce: announceFishChanged,
  getPrefs,
  async thread(fishId) {
    const { fishThread } = await import("../agent/persist");
    return fishThread(fishId);
  },
  async deleteChat(chatId) {
    const { deleteChat } = await import("../agent/persist");
    return deleteChat(chatId);
  },
  async send(input) {
    const { sendMessage } = await import("../agent/chat");
    return sendMessage(input);
  },
  async listMessages(chatId) {
    const { listMessages } = await import("../agent/persist");
    return assistantMessages.parse(await listMessages(chatId));
  },
  async savesInScope(saveIds, fish, inInbox) {
    if (!saveIds.length) return [];
    const db = await getDb();
    const rows = await db
      .select({ id: saves.id })
      .from(saves)
      .where(
        and(
          ...libraryScopeClauses({
            saveIds: [...saveIds],
            filter: fishScopeFilter(fish.scope),
          }),
          inInbox ? eq(saves.inboxState, "review") : undefined,
        ),
      );
    return rows.map((row) => row.id);
  },
  now: () => Date.now(),
};

const running = new Set<string>();

function routineMessage(routine: FishRoutine, trigger: RoutineTrigger): string {
  const lines = [
    `This is your routine ${JSON.stringify(routine.name)}${trigger.kind === "manual" ? ", run now" : ""}. Nobody is watching live, so don't ask questions; propose any Library changes for review.`,
    routine.instruction,
  ];
  if (trigger.kind === "newSaves")
    lines.push(
      `New Saves to look at (read them by ID): ${trigger.saveIds.join(", ")}`,
    );
  if (trigger.kind === "inbox")
    lines.push(
      `Saves waiting in the Inbox (read them by ID): ${trigger.saveIds.join(", ")}`,
      "For each one, suggest folders, tags, and a note or short summary where it helps, and point out likely duplicates already in the Library. Leave marking processed, snoozing, and the Trash to the person reviewing.",
    );
  return lines.join("\n\n");
}

function providerFor(fish: Fish, prefs: Prefs) {
  const provider =
    fish.model?.provider ??
    ASSISTANT_MODELS.find((model) => model.id === prefs.agent.languageModel)
      ?.id;
  return provider ? { provider, modelId: fish.model?.modelId } : null;
}

/** Runs one routine in its fish's conversation; any changes it proposes wait for review. */
export async function runFishRoutine(
  fish: Fish,
  routine: FishRoutine,
  trigger: RoutineTrigger,
  deps: RoutineDependencies = defaultDependencies,
): Promise<FishRun | null> {
  if (running.has(fish.id)) return null;
  running.add(fish.id);
  const at = deps.now();
  const finish = (result: Omit<FishRun, "routineId" | "routineName">) => {
    const run = { ...result, routineId: routine.id, routineName: routine.name };
    deps.recordRun(fish.id, run);
    deps.announce();
    return run;
  };
  try {
    const model = providerFor(fish, await deps.getPrefs());
    if (!model)
      return finish({
        chatId: null,
        at,
        status: "failed",
        error:
          "Choose a model for this fish, or connect a provider in Settings.",
        changes: 0,
        seen: false,
      });
    const chat = await deps.thread(fish.id);
    const result = await deps.send({
      chatId: chat.id,
      requestId: randomUUID(),
      content: routineMessage(routine, trigger),
      attachmentIds: [],
      fileAttachmentIds: [],
      scope: { kind: "library" },
      provider: model.provider,
      modelId: model.modelId,
      routine: {
        trigger: trigger.kind,
        saves:
          trigger.kind === "schedule" || trigger.kind === "manual"
            ? undefined
            : trigger.saveIds.length,
        routineId: routine.id,
        name: routine.name,
      },
    });
    if (!result.accepted) {
      if (chat.created) await deps.deleteChat(chat.id);
      return finish({
        chatId: null,
        at,
        status: "failed",
        error: result.error ?? "The routine couldn't start.",
        changes: 0,
        seen: false,
      });
    }
    const reply = (await deps.listMessages(chat.id)).findLast(
      (message) => message.role === "assistant",
    );
    return finish({
      chatId: chat.id,
      at,
      status: result.error ? "failed" : "done",
      error: result.error,
      changes:
        reply?.metadata?.changes?.filter(
          (change) => change.status === "pending",
        ).length ?? 0,
      seen: false,
    });
  } catch (error) {
    log.warn("[pond fish] routine failed", fish.id, error);
    return finish({
      chatId: null,
      at,
      status: "failed",
      error: error instanceof Error ? error.message : "The routine failed.",
      changes: 0,
      seen: false,
    });
  } finally {
    running.delete(fish.id);
  }
}

export async function runDueRoutines(
  deps: RoutineDependencies = defaultDependencies,
): Promise<void> {
  const now = deps.now();
  for (const fish of deps.listFish()) {
    for (const routine of fish.routines) {
      if (isRoutineDue(routine, now))
        await runFishRoutine(fish, routine, { kind: "schedule" }, deps);
    }
  }
}

async function runArrivalRoutines(
  kind: "newSaves" | "inbox",
  saveIds: readonly string[],
  deps: RoutineDependencies,
): Promise<void> {
  for (const fish of deps.listFish()) {
    const routines = fish.routines.filter(
      (routine) => routine.when.kind === kind && !routine.paused,
    );
    if (!routines.length) continue;
    const inScope = await deps.savesInScope(saveIds, fish, kind === "inbox");
    if (!inScope.length) continue;
    for (const routine of routines)
      await runFishRoutine(
        fish,
        routine,
        { kind, saveIds: inScope.slice(0, MAX_NEW_SAVES) },
        deps,
      );
  }
}

export function runNewSaveRoutines(
  saveIds: readonly string[],
  deps: RoutineDependencies = defaultDependencies,
): Promise<void> {
  return runArrivalRoutines("newSaves", saveIds, deps);
}

/** Inbox routines only see Saves still waiting for review when the batch settles. */
export function runInboxRoutines(
  saveIds: readonly string[],
  deps: RoutineDependencies = defaultDependencies,
): Promise<void> {
  return runArrivalRoutines("inbox", saveIds, deps);
}
