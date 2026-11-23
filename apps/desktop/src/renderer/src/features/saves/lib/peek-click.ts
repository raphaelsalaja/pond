import type { Prefs } from "@pond/schema/db";

type PeekClick = Prefs["viewer"]["peekClick"];

/** Whether a click's modifiers are exactly the peek click, so Shift- and Command-click keep selecting. */
export function isPeekClick(
  event: Pick<MouseEvent, "altKey" | "shiftKey" | "metaKey" | "ctrlKey">,
  setting: PeekClick,
): boolean {
  if (setting === "off" || !event.altKey) return false;
  const command = event.metaKey || event.ctrlKey;
  if (setting === "option") return !event.shiftKey && !command;
  if (setting === "option-shift") return event.shiftKey && !command;
  return command && !event.shiftKey;
}
