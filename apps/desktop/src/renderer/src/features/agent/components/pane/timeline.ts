import { plainPreview } from "@shared/assistant-text";
import {
  fromUIMessage,
  messageText,
  type PondUIMessage,
} from "@/features/agent/state/pond-messages";
import { systemLocale } from "@/shared/lib/system-locale";
import type { ThreadMark } from "../thread";
import { routineEventText } from "./chat-event/events";

/** A quiet stretch this long starts a new block of the conversation. */
const SESSION_GAP = 30 * 60_000;

function startOfDay(date: Date): number {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function timeLabel(at: Date, now: Date): string {
  const time = at.toLocaleTimeString(systemLocale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7)
    return `${at.toLocaleDateString(systemLocale, { weekday: "long" })} ${time}`;
  const date = at.toLocaleDateString(systemLocale, {
    month: "short",
    day: "numeric",
    year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${date}, ${time}`;
}

/** Which messages open a new block and get a timestamp above them. */
export function timeBreaks(times: readonly (Date | undefined)[]): boolean[] {
  let previous: Date | undefined;
  return times.map((at) => {
    const opens =
      at !== undefined &&
      (previous === undefined ||
        at.getTime() - previous.getTime() >= SESSION_GAP);
    if (at) previous = at;
    return opens;
  });
}

/** One mark per turn you started, previewed with the reply that followed. */
export function turnMarks(
  messages: readonly PondUIMessage[],
  chatId: string,
  name: string,
): ThreadMark[] {
  return messages.flatMap((message, index) => {
    if (message.role !== "user") return [];
    const routine = fromUIMessage(message, chatId).metadata?.routine;
    const reply = messages[index + 1];
    const description =
      reply?.role === "assistant" ? plainPreview(messageText(reply)) : "";
    return [
      {
        id: message.id,
        title: routine
          ? routineEventText(name, routine)
          : plainPreview(messageText(message)) || "Your message",
        description: description || undefined,
      },
    ];
  });
}
