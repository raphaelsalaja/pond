import type {
  AssistantRoutine,
  AssistantRoutineEvent,
} from "@shared/assistant";
import { formatPlural } from "@/shared/lib/format";

export function routineEventText(
  name: string,
  routine: AssistantRoutine,
): string {
  const titled = routine.name ? JSON.stringify(routine.name) : null;
  if (routine.trigger === "manual") {
    return titled ? `You ran ${titled}` : `You ran ${name}'s routine`;
  }
  if (routine.trigger === "schedule") {
    return titled
      ? `${name} ran ${titled}`
      : `${name} ran its scheduled routine`;
  }
  const saves = routine.saves ?? 0;
  if (routine.trigger === "inbox") {
    return `${name} looked at ${formatPlural(saves, { one: "Save", other: "Saves" })} in the Inbox`;
  }
  return `${name} looked at ${formatPlural(saves, { one: "new Save", other: "new Saves" })}`;
}

export function routineChangeText(kind: AssistantRoutineEvent["kind"]): string {
  if (kind === "created") {
    return "Created routine";
  }
  if (kind === "updated") {
    return "Updated routine";
  }
  return "Deleted routine";
}
