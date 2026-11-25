import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
} from "ai";
import { z } from "zod";
import {
  type AgentStreamRequest,
  type AssistantEvent,
  type AssistantSendResult,
  assistantMetadata,
  assistantQuestion,
} from "../../../shared/assistant";
import {
  type ChatDependencies,
  defaultChatDependencies,
  sendMessage,
} from "./chat";
import { listMessages } from "./persist";

const userText = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export function latestUserText(messages: AgentStreamRequest["messages"]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = message.parts
      .flatMap((part) => {
        const parsed = userText.safeParse(part);
        return parsed.success ? [parsed.data.text] : [];
      })
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

export interface StreamTurnDependencies {
  sendMessage: (
    input: Parameters<typeof sendMessage>[0],
    deps?: ChatDependencies,
    onEvent?: (event: AssistantEvent) => void,
  ) => Promise<AssistantSendResult>;
  listMessages: typeof listMessages;
  chat?: ChatDependencies;
}

const defaultStreamDependencies: StreamTurnDependencies = {
  sendMessage,
  listMessages,
  chat: defaultChatDependencies,
};

export async function streamAgentTurn(
  input: AgentStreamRequest,
  deps: StreamTurnDependencies = defaultStreamDependencies,
) {
  const validated = await safeValidateUIMessages({
    messages: input.messages,
  });
  if (!validated.success)
    throw new Error("This conversation could not be sent. Try again.");
  await convertToModelMessages(validated.data);
  const content = latestUserText(input.messages);
  if (!content) throw new Error("Write a message before sending.");
  const stream = createUIMessageStream({
    originalMessages: validated.data,
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      let textOpen = false;
      const onEvent = (event: AssistantEvent) => {
        if (event.type === "activity") {
          writer.write({
            type: "data-pond-activity",
            id: "current-activity",
            data: { activity: event.activity },
          });
          return;
        }
        if (event.type === "sources") {
          writer.write({ type: "data-pond-sources", data: event.sources });
          return;
        }
        if (event.type === "results") {
          writer.write({ type: "data-pond-results", data: event.results });
          return;
        }
        if (event.type === "steps") {
          writer.write({ type: "data-pond-steps", data: event.steps });
          return;
        }
        if (!textOpen) {
          writer.write({ type: "text-start", id: "text-1" });
          textOpen = true;
        }
        writer.write({ type: "text-delta", id: "text-1", delta: event.text });
      };
      const result = await deps.sendMessage(
        { ...input, content },
        deps.chat,
        onEvent,
      );
      if (textOpen) writer.write({ type: "text-end", id: "text-1" });
      const rows =
        result.accepted === false ? [] : await deps.listMessages(result.chatId);
      const last = rows.at(-1);
      const saved =
        last?.role === "assistant"
          ? assistantMetadata.safeParse(last.metadata)
          : undefined;
      if (saved?.success) {
        writer.write({
          type: "message-metadata",
          messageMetadata: {
            elapsedMs: saved.data.elapsedMs,
            messages: saved.data.messages,
            stopped: saved.data.stopped,
            error: saved.data.error,
            routineEvents: saved.data.routineEvents,
          },
        });
        if (saved.data.steps?.length)
          writer.write({ type: "data-pond-steps", data: saved.data.steps });
      }
      if (result.error) {
        writer.write({ type: "error", errorText: result.error });
        return;
      }
      const metadata = z
        .object({
          question: assistantQuestion.optional(),
          changes: z.array(z.unknown()).optional(),
        })
        .safeParse(last?.metadata);
      if (metadata.success && metadata.data.question)
        writer.write({
          type: "data-pond-question",
          data: metadata.data.question,
        });
      if (metadata.success && metadata.data.changes?.length)
        writer.write({
          type: "data-pond-review",
          data: { changes: metadata.data.changes },
        });
      writer.write({
        type: "finish",
        finishReason: result.stopped ? "other" : "stop",
      });
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Could not reply. Try again.",
  });
  return createUIMessageStreamResponse({ stream });
}

export function uiMessageErrorResponse(message: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "error", errorText: message });
      },
    }),
  });
}
