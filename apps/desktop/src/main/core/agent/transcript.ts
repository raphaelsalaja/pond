import { agentChats, agentMessages } from "@pond/schema/db";
import type { ModelMessage } from "ai";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assistantMetadata } from "../../../shared/assistant";
import { joinMessages } from "../../../shared/assistant-text";
import { getDb } from "../../db";
import type { Db } from "../../db";
import { answerProblem } from "./output";

export async function loadModelTranscript(
  chatId: string,
  database?: Pick<Db, "select">,
): Promise<Array<ModelMessage>> {
  const db = database ?? (await getDb());
  const canonical = loadCanonical(db, chatId);
  const projected = projectMessages(db, chatId);
  let request = "";
  return reconcileTranscript(canonical, projected).flatMap((message) => {
    const text = textOf(message);
    if (message.role === "user") {
      request = text;
    }
    if (message.role !== "assistant" || !answerProblem(text, request)) {
      return [message];
    }
    return [];
  });
}

function loadCanonical(
  db: Pick<Db, "select">,
  chatId: string,
): Array<ModelMessage> {
  const thread = db
    .select({ transcript: agentChats.canonicalTranscript })
    .from(agentChats)
    .where(eq(agentChats.id, chatId))
    .get();
  if (!thread?.transcript) return [];
  const parsed = z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.union([z.string(), z.array(z.json())]).optional(),
      }),
    )
    .safeParse(JSON.parse(thread.transcript));
  if (!parsed.success) return [];
  return parsed.data.flatMap((row) => {
    if (row.role !== "user" && row.role !== "assistant") return [];
    const content =
      z.string().safeParse(row.content).data ??
      (Array.isArray(row.content)
        ? row.content
            .flatMap((part) => {
              const text = z
                .object({ type: z.literal("text"), text: z.string() })
                .safeParse(part);
              return text.success ? [text.data.text] : [];
            })
            .join("\n")
        : "");
    return [{ role: row.role, content }];
  });
}

function projectMessages(
  db: Pick<Db, "select">,
  chatId: string,
): Array<ModelMessage> {
  return db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.chatId, chatId))
    .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id))
    .all()
    .map((message) => {
      const details = assistantMetadata.parse(message.metadata ?? {});
      const role = z.enum(["user", "assistant"]).parse(message.role);
      const text = details.messages?.length
        ? joinMessages(details.messages)
        : message.content;
      return {
        role,
        content: details.question
          ? `${text}\n${details.question.question}\n${details.question.options.join("; ")}`
          : text,
      };
    });
}

function textOf(message: ModelMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (z.string().safeParse(message.content).success) {
    return z.string().parse(message.content);
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .flatMap((part) => {
      const text = z
        .object({ type: z.literal("text"), text: z.string() })
        .safeParse(part);
      return text.success ? [text.data.text] : [];
    })
    .join("\n");
}

function reconcileTranscript(
  canonical: Array<ModelMessage>,
  projected: Array<ModelMessage>,
): Array<ModelMessage> {
  if (!canonical.length) {
    return projected;
  }
  const result: Array<ModelMessage> = [];
  let cursor = 0;
  for (const message of projected) {
    if (message.role !== "user") {
      result.push(message);
      continue;
    }
    const start = canonical.findIndex(
      (row, index) =>
        index >= cursor &&
        row.role === "user" &&
        textOf(row) === textOf(message),
    );
    if (start < 0) {
      result.push(message);
      continue;
    }
    const next = canonical.findIndex(
      (row, index) => index > start && row.role === "user",
    );
    const turn = canonical.slice(start, next < 0 ? undefined : next);
    result.push(...turn);
    cursor = next < 0 ? canonical.length : next;
  }
  return result.length ? result : projected;
}
