import type { AssistantChange } from "@shared/assistant";
import { formatPlural } from "@/shared/lib/format";

const CHANGES = { one: "change", other: "changes" };

export interface ChipChange {
  value: string;
  tone: "tag" | "added" | "removed";
}

export function chipDiff(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): Array<ChipChange> {
  return [
    ...after.map((value): ChipChange => ({
      value,
      tone: before.includes(value) ? "tag" : "added",
    })),
    ...before.flatMap((value): Array<ChipChange> =>
      after.includes(value) ? [] : [{ value, tone: "removed" }],
    ),
  ];
}

export function reviewTitle(title: string): string {
  return (
    title
      .replaceAll(/https?:\/\/\S+/gi, "")
      .replaceAll(/\s+/g, " ")
      .trim() || "Untitled"
  );
}

export interface SummaryPart {
  text: string;
  tone: "added" | "removed" | "neutral";
}

function neutral(text: string): Array<SummaryPart> {
  return [{ text, tone: "neutral" }];
}

export function summaryParts(
  change: AssistantChange,
  folderName: (id: string) => string = String,
): Array<SummaryPart> {
  switch (change.field) {
    case "tags":
    case "folders": {
      const name = change.field === "folders" ? folderName : String;
      return chipDiff(change.before, change.after).flatMap(
        (chip): Array<SummaryPart> =>
          chip.tone === "tag"
            ? []
            : [
                {
                  text: `${chip.tone === "added" ? "+" : "−"}${name(chip.value)}`,
                  tone: chip.tone,
                },
              ],
      );
    }
    case "title":
      return neutral(`Rename to ${change.after}`);
    case "note":
      return neutral(change.after ? "Edit note" : "Clear note");
    case "rating":
      return neutral(
        change.after
          ? `Rate ${formatPlural(change.after, { one: "star", other: "stars" })}`
          : "Clear rating",
      );
    case "trash":
      return change.after === "trashed"
        ? [{ text: "Move to Trash", tone: "removed" }]
        : neutral("Restore");
    case "action":
      return neutral(change.after);
  }
}

export function changeSummary(
  change: AssistantChange,
  folderName: (id: string) => string = String,
): string {
  return summaryParts(change, folderName)
    .map((part) => part.text)
    .join(" ");
}

export function isPurgeTrash(change: AssistantChange): boolean {
  return change.field === "action" && change.action === "purgeTrash";
}

export function reviewQuestion(pending: number): string {
  return `Apply ${formatPlural(pending, CHANGES)} to your library?`;
}

function summaryVerb(change: AssistantChange): string {
  switch (change.field) {
    case "title":
      return "renames";
    case "note":
      return "edits notes on";
    case "tags":
      return "retags";
    case "folders":
      return "refiles";
    case "rating":
      return "rates";
    case "trash":
      return change.after === "trashed" ? "trashes" : "restores";
    case "action":
      return "action";
  }
}

export function reviewSummary(changes: ReadonlyArray<AssistantChange>): string {
  const groups = new Map<string, number>();
  for (const change of changes) {
    const verb = summaryVerb(change);
    groups.set(verb, (groups.get(verb) ?? 0) + 1);
  }
  const parts = [...groups].map(([verb, n]) =>
    verb === "action"
      ? n === 1
        ? (changes.find((change) => change.field === "action")?.after ?? "")
        : `runs ${formatPlural(n, { one: "library action", other: "library actions" })}`
      : `${verb} ${formatPlural(n, { one: "Save", other: "Saves" })}`,
  );
  const text = parts.filter(Boolean).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface ReviewOutcome {
  text: string;
  tone: "default" | "muted";
}

export function reviewOutcome(
  changes: ReadonlyArray<AssistantChange>,
): ReviewOutcome {
  const tally = { applied: 0, dismissed: 0, undone: 0 };
  for (const change of changes) {
    if (change.status !== "pending") {
      tally[change.status] += 1;
    }
  }
  const parts = (
    [
      ["Applied", tally.applied],
      ["Dismissed", tally.dismissed],
      ["Undid", tally.undone],
    ] as const
  ).filter(([, n]) => n > 0);
  const [only] = parts;
  const text =
    only && parts.length === 1
      ? `${only[0]} ${formatPlural(only[1], CHANGES)}`
      : parts
          .map(
            ([verb, n], index) => `${index ? verb.toLowerCase() : verb} ${n}`,
          )
          .join(", ");
  return { text, tone: tally.applied ? "default" : "muted" };
}
