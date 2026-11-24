import {
  type AgentChat,
  agentChatFish,
  agentChats,
  agentMessages,
} from "@pond/schema/db";
import { asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import {
  type AssistantMetadata,
  assistantMetadata,
} from "../../../shared/assistant";
import { DEFAULT_FISH_ID } from "../../../shared/fish-contracts";
import type {
  OkResult,
  OkSuccess,
} from "../../../shared/query-contracts-shared";
import { getDb } from "../../db";
import { latestFromMessage } from "../fish/latest";
import { chatTitle } from "./chat-title";

export type ChatListing = Omit<AgentChat, "canonicalTranscript"> & {
  fishId: string;
};

const listing = {
  id: agentChats.id,
  title: agentChats.title,
  createdAt: agentChats.createdAt,
  updatedAt: agentChats.updatedAt,
  fishId: sql<string>`coalesce(${agentChatFish.fishId}, ${DEFAULT_FISH_ID})`,
};

/** Chats from before Fish have no binding and belong to the default fish. */
function fishFilter(fishId: string) {
  return fishId === DEFAULT_FISH_ID
    ? or(
        isNull(agentChatFish.fishId),
        eq(agentChatFish.fishId, DEFAULT_FISH_ID),
      )
    : eq(agentChatFish.fishId, fishId);
}

export async function listChats(fishId?: string): Promise<ChatListing[]> {
  const db = await getDb();
  return db
    .select(listing)
    .from(agentChats)
    .leftJoin(agentChatFish, eq(agentChatFish.chatId, agentChats.id))
    .where(fishId ? fishFilter(fishId) : undefined)
    .orderBy(desc(agentChats.updatedAt));
}

async function createChat(
  fishId: string = DEFAULT_FISH_ID,
  title: string | null = null,
): Promise<ChatListing> {
  const db = await getDb();
  const id = ulid();
  await db.insert(agentChats).values({ id, title });
  await db.insert(agentChatFish).values({ chatId: id, fishId });
  const rows = await db
    .select(listing)
    .from(agentChats)
    .leftJoin(agentChatFish, eq(agentChatFish.chatId, agentChats.id))
    .where(eq(agentChats.id, id));
  const created = rows[0];
  if (!created) throw new Error("agent chat create failed");
  return created;
}

/** Each fish keeps one running conversation: its newest chat, created on first use. */
export async function fishThread(
  fishId: string = DEFAULT_FISH_ID,
): Promise<ChatListing & { created: boolean }> {
  const [latest] = await listChats(fishId);
  if (latest) return { ...latest, created: false };
  return { ...(await createChat(fishId)), created: true };
}

export async function fishIdForChat(chatId: string): Promise<string> {
  const db = await getDb();
  const row = await db
    .select({ fishId: agentChatFish.fishId })
    .from(agentChatFish)
    .where(eq(agentChatFish.chatId, chatId))
    .get();
  return row?.fishId ?? DEFAULT_FISH_ID;
}

export async function deleteFishChats(fishId: string): Promise<void> {
  for (const chat of await listChats(fishId)) await deleteChat(chat.id);
}

export async function renameChat(id: string, title: string): Promise<OkResult> {
  const db = await getDb();
  const rows = await db
    .update(agentChats)
    .set({ title, updatedAt: new Date() })
    .where(eq(agentChats.id, id))
    .returning({ id: agentChats.id });
  return rows.length > 0
    ? { ok: true }
    : { ok: false, error: "This chat no longer exists." };
}

export async function deleteChat(id: string): Promise<OkSuccess> {
  const db = await getDb();
  await db.delete(agentMessages).where(eq(agentMessages.chatId, id));
  await db.delete(agentChatFish).where(eq(agentChatFish.chatId, id));
  await db.delete(agentChats).where(eq(agentChats.id, id));
  return { ok: true };
}

/** The newest message in each fish's chats, keyed by fish id. */
export async function latestFishMessages() {
  const db = await getDb();
  const rows = z
    .array(
      z.object({
        fishId: z.string(),
        role: z.string(),
        content: z.string(),
        metadata: z.string().nullable(),
        createdAt: z.number(),
      }),
    )
    .parse(
      db.all(
        sql`select fish_id as fishId, role, content, metadata, created_at as createdAt from (
          select coalesce(${agentChatFish.fishId}, ${DEFAULT_FISH_ID}) as fish_id,
            ${agentMessages.role} as role,
            ${agentMessages.content} as content,
            ${agentMessages.metadata} as metadata,
            ${agentMessages.createdAt} as created_at,
            row_number() over (
              partition by coalesce(${agentChatFish.fishId}, ${DEFAULT_FISH_ID})
              order by ${agentMessages.createdAt} desc, ${agentMessages.id} desc
            ) as rank
          from ${agentMessages}
          left join ${agentChatFish} on ${agentChatFish.chatId} = ${agentMessages.chatId}
        ) where rank = 1`,
      ),
    );
  return new Map(
    rows.map((row) => [
      row.fishId,
      latestFromMessage({
        role: row.role,
        content: row.content,
        metadata: row.metadata
          ? (assistantMetadata.safeParse(JSON.parse(row.metadata)).data ?? null)
          : null,
        createdAt: new Date(row.createdAt),
      }),
    ]),
  );
}

export async function listMessages(chatId: string) {
  const db = await getDb();
  return db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.chatId, chatId))
    .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id));
}

export type RewoundTurn =
  | { ok: true; content: string; metadata: AssistantMetadata }
  | { ok: false; error: string };

/** Drops the latest exchange so its request can run again; the transcript follows the stored rows. */
export async function rewindLastTurn(chatId: string): Promise<RewoundTurn> {
  const rows = await listMessages(chatId);
  const start = rows.findLastIndex((row) => row.role === "user");
  const request = rows[start];
  if (!request || start === rows.length - 1)
    return { ok: false, error: "There's no reply to run again." };
  const metadata = assistantMetadata.parse(request.metadata ?? {});
  if (metadata.routine)
    return { ok: false, error: "Run the routine again from its page." };
  const replies = rows.slice(start + 1);
  const applied = replies.some((row) =>
    assistantMetadata
      .parse(row.metadata ?? {})
      .changes?.some((change) => change.status === "applied"),
  );
  if (applied)
    return {
      ok: false,
      error:
        "This reply has applied changes. Undo them before running it again.",
    };
  const db = await getDb();
  await db.delete(agentMessages).where(
    inArray(
      agentMessages.id,
      rows.slice(start).map((row) => row.id),
    ),
  );
  return { ok: true, content: request.content, metadata };
}

export async function appendMessage(input: {
  chatId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: AssistantMetadata;
}): Promise<string> {
  const db = await getDb();
  const id = ulid();
  await db.insert(agentMessages).values({
    id,
    chatId: input.chatId,
    role: input.role,
    content: input.content,
    metadata: input.metadata ? { ...input.metadata } : null,
  });
  const current = await db
    .select({ title: agentChats.title })
    .from(agentChats)
    .where(eq(agentChats.id, input.chatId));
  const title =
    current[0]?.title ||
    (input.role === "user" ? chatTitle(input.content) : null);
  const patch: Partial<AgentChat> = { updatedAt: new Date() };
  if (title) patch.title = title;
  await db.update(agentChats).set(patch).where(eq(agentChats.id, input.chatId));
  return id;
}
