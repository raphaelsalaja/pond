import type {
  AssistantChange,
  AssistantRoutine,
  AssistantRoutineEvent,
} from "@shared/assistant";
import { formatPlural } from "@/shared/lib/format";

export function routineEventText(
  name: string,
  routine: AssistantRoutine,
): string {
  const titled = routine.name ? JSON.stringify(routine.name) : null;
  if (routine.trigger === "manual")
    return titled ? `You ran ${titled}` : `You ran ${name}'s routine`;
  if (routine.trigger === "schedule")
    return titled
      ? `${name} ran ${titled}`
      : `${name} ran its scheduled routine`;
  const saves = routine.saves ?? 0;
  if (routine.trigger === "inbox")
    return `${name} looked at ${formatPlural(saves, { one: "Save", other: "Saves" })} in the Inbox`;
  return `${name} looked at ${formatPlural(saves, { one: "new Save", other: "new Saves" })}`;
}

export function routineChangeText(kind: AssistantRoutineEvent["kind"]): string {
  if (kind === "created") return "Created routine";
  if (kind === "updated") return "Updated routine";
  return "Deleted routine";
}

function counted(verb: string, count: number, unit = true): string {
  return unit
    ? `${verb} ${formatPlural(count, { one: "change", other: "changes" })}`
    : `${verb} ${count}`;
}

/** Summarizes a finished review; `null` while any change still waits on you. */
export function reviewOutcomeText(
  changes: readonly AssistantChange[],
): string | null {
  if (!changes.length || changes.some((change) => change.status === "pending"))
    return null;
  const parts = (["applied", "dismissed", "undone"] as const).flatMap(
    (status) => {
      const count = changes.filter((change) => change.status === status).length;
      return count ? [{ status, count }] : [];
    },
  );
  const verbs = { applied: "applied", dismissed: "dismissed", undone: "undid" };
  const [first, ...rest] = parts;
  if (!first) return null;
  const tail = rest.map(({ status, count }) =>
    counted(verbs[status], count, false),
  );
  return [`You ${counted(verbs[first.status], first.count)}`, ...tail]
    .join(tail.length > 1 ? ", " : " and ")
    .replace(/, ([^,]+)$/, ", and $1");
}
