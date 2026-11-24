import { Chat } from "@ai-sdk/react";
import type { AssistantMessage } from "@shared/assistant";
import { pondChatTransport } from "./chat-transport";
import { toUIMessage } from "./pond-messages";
import type { PondUIMessage } from "./pond-messages";

const sessions = new Map<string, Chat<PondUIMessage>>();

export function pondChatSession(
  chatId: string,
  messages: Array<PondUIMessage> = [],
) {
  const existing = sessions.get(chatId);
  if (existing) {
    return existing;
  }
  const chat = new Chat<PondUIMessage>({
    id: chatId,
    transport: pondChatTransport(),
    messages,
  });
  sessions.set(chatId, chat);
  return chat;
}

export function hydratePondChat(
  chatId: string,
  messages: Array<AssistantMessage>,
) {
  const next = messages.map(toUIMessage);
  const existing = sessions.get(chatId);
  if (
    existing &&
    (existing.status === "submitted" || existing.status === "streaming")
  ) {
    return existing;
  }
  if (existing) {
    existing.messages = next;
    return existing;
  }
  return pondChatSession(chatId, next);
}
