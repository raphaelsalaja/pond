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

/** Long enough to recognise a Save, short enough that an inline reference wraps with the sentence. */
const SHORT_TITLE = 40;

/** A Save's title cut at a word near the limit, for naming it inside a sentence. */
export function shortTitle(title: string, limit = SHORT_TITLE): string {
  const clean = reviewTitle(title);
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
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
    if (change.status !== "pending") tally[change.status] += 1;
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

export interface ChangeGroup {
  key: string;
  /** What every change in the group does, such as `+Clock` or `Move to Trash`. */
  parts: Array<SummaryPart>;
  changes: Array<AssistantChange>;
}

/** Renames and notes differ per Save, so they group by kind; other changes group by their exact effect. */
function groupKey(
  change: AssistantChange,
  folderName: (id: string) => string,
): Pick<ChangeGroup, "key" | "parts"> {
  switch (change.field) {
    case "title":
      return { key: "title", parts: [{ text: "Rename", tone: "neutral" }] };
    case "note": {
      const text = change.after ? "Edit note" : "Clear note";
      return { key: `note:${text}`, parts: [{ text, tone: "neutral" }] };
    }
    default: {
      const parts = summaryParts(change, folderName);
      const text = parts.map((part) => part.text).join(" ");
      return { key: `${change.field}:${text}`, parts };
    }
  }
}

/** One group per distinct change, in the order the fish proposed them. */
export function groupChanges(
  changes: ReadonlyArray<AssistantChange>,
  folderName: (id: string) => string = String,
): Array<ChangeGroup> {
  const groups = new Map<string, ChangeGroup>();
  for (const change of changes) {
    const { key, parts } = groupKey(change, folderName);
    const group = groups.get(key);
    if (group) group.changes.push(change);
    else groups.set(key, { key, parts, changes: [change] });
  }
  return [...groups.values()];
}

/** A piece of the proposal sentence: plain words, a name to emphasise, or the Saves a change touches. */
export interface ProposalPlace {
  /** A tag's name, or a folder's id. */
  id: string;
  name: string;
}

export type ProposalSegment =
  | { kind: "text"; text: string }
  | { kind: "value"; text: string }
  | { kind: "places"; place: "tag" | "folder"; items: Array<ProposalPlace> }
  | { kind: "saves"; changes: Array<AssistantChange> };

export type ProposalClause = Array<ProposalSegment>;

const text = (value: string): ProposalSegment => ({
  kind: "text",
  text: value,
});
const value = (names: ReadonlyArray<string>): ProposalSegment => ({
  kind: "value",
  text: names.join(" and "),
});

function lowerFirst(phrase: string): string {
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

function chipClause(
  group: ChangeGroup,
  folderName: (id: string) => string,
): ProposalClause {
  const [first] = group.changes;
  if (first?.field !== "tags" && first?.field !== "folders") return [];
  const place = first.field === "folders" ? "folder" : "tag";
  const name = place === "folder" ? folderName : String;
  const chips = chipDiff(first.before, first.after);
  const places = (tone: "added" | "removed"): ProposalSegment => ({
    kind: "places",
    place,
    items: chips
      .filter((chip) => chip.tone === tone)
      .map((chip) => ({ id: chip.value, name: name(chip.value) })),
  });
  const added = places("added");
  const removed = places("removed");
  const has = (segment: ProposalSegment) =>
    segment.kind === "places" && segment.items.length > 0;
  const saves: ProposalSegment = { kind: "saves", changes: group.changes };
  if (place === "tag") {
    if (!has(removed)) return [text("tag "), saves, text(" with "), added];
    if (!has(added)) return [text("remove "), removed, text(" from "), saves];
    return [
      text("tag "),
      saves,
      text(" with "),
      added,
      text(" instead of "),
      removed,
    ];
  }
  if (!has(removed)) return [text("add "), saves, text(" to "), added];
  if (!has(added)) return [text("take "), saves, text(" out of "), removed];
  return [text("move "), saves, text(" from "), removed, text(" to "), added];
}

function groupClauses(
  group: ChangeGroup,
  folderName: (id: string) => string,
): Array<ProposalClause> {
  const [first] = group.changes;
  if (!first) return [];
  const saves: ProposalSegment = { kind: "saves", changes: group.changes };
  switch (first.field) {
    case "tags":
    case "folders":
      return [chipClause(group, folderName)];
    case "title":
      return group.changes.flatMap((change) =>
        change.field === "title"
          ? [
              [
                text("rename "),
                { kind: "saves", changes: [change] },
                text(" to "),
                value([change.after]),
              ],
            ]
          : [],
      );
    case "note":
      return [
        [text(first.after ? "edit the note on " : "clear the note on "), saves],
      ];
    case "rating":
      return [
        first.after
          ? [
              text("rate "),
              saves,
              text(" "),
              value([
                formatPlural(first.after, { one: "star", other: "stars" }),
              ]),
            ]
          : [text("clear the rating on "), saves],
      ];
    case "trash":
      return [
        first.after === "trashed"
          ? [text("move "), saves, text(" to Trash")]
          : [text("restore "), saves, text(" from Trash")],
      ];
    case "action":
      return group.changes.flatMap((change) =>
        change.field === "action" ? [[text(lowerFirst(change.after))]] : [],
      );
  }
}

/** Leads that let a list of same-verb clauses drop the verb from every item. */
const SHARED_LEADS = new Map([
  ["tag ", "Here's how I'll tag them:"],
  ["add ", "Here's where I'll add them:"],
  ["move ", "Here's where I'll move them:"],
  ["rename ", "Here's how I'll rename them:"],
]);

/** When every clause opens with the same verb, say it once in the lead and keep the rest as items. */
export function proposalList(clauses: ReadonlyArray<ProposalClause>): {
  lead: string;
  items: Array<ProposalClause>;
} {
  const [first] = clauses.map((clause) => clause[0]);
  const verb = first?.kind === "text" ? first.text : undefined;
  const lead = verb ? SHARED_LEADS.get(verb) : undefined;
  const shared =
    lead &&
    clauses.every(
      (clause) => clause[0]?.kind === "text" && clause[0].text === verb,
    );
  return shared
    ? { lead, items: clauses.map((clause) => clause.slice(1)) }
    : { lead: "Here's what I'll change:", items: [...clauses] };
}

/** The proposal as clauses a fish can say in one sentence, one per distinct change. */
export function proposalClauses(
  changes: ReadonlyArray<AssistantChange>,
  folderName: (id: string) => string = String,
): Array<ProposalClause> {
  return groupChanges(changes, folderName).flatMap((group) =>
    groupClauses(group, folderName),
  );
}
