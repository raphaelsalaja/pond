import type {
  AssistantChange,
  AssistantFileAttachment,
  AssistantMessage,
  AssistantSource,
  AssistantToolStep,
} from "@shared/assistant";
import { MESSAGE_BREAK } from "@shared/assistant-text";
import type {
  FishRoutine,
  FishRun,
  FishSummary,
} from "@shared/fish-contracts";
import type { AssistantState } from "@/features/agent/state/assistant";

const NOW = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SAMPLE_SOURCES: AssistantSource[] = [
  "Swiss poster grid",
  "Onboarding checklist pattern",
  "Brutalist type specimen",
  "Calm settings page",
  "Command menu with previews",
  "Pricing table, three tiers",
].map((title, index) => ({
  id: `lab-save-${index + 1}`,
  title,
  url: `https://example.com/${index + 1}`,
  source: index % 2 ? "twitter" : "arena",
}));

export const idle: AssistantState = {
  fishId: "default",
  chatId: "lab",
  chats: [],
  referenceMessageId: null,
  messages: [],
  draft: "",
  attachments: [],
  files: [],
  busy: false,
  loading: false,
  requestId: null,
  sources: [],
  activity: "thinking",
  results: [],
  steps: [],
  error: null,
  failed: null,
  queued: null,
  focusRequest: 0,
};

export function message(
  id: string,
  role: AssistantMessage["role"],
  content: string,
  metadata: AssistantMessage["metadata"] = null,
): AssistantMessage {
  return { id, chatId: "lab", role, content, metadata };
}

export const MULTI_REPLY = [
  "Found 6 Saves that fit.",
  "Most are poster grids from Are.na, two are type specimens.",
  "Want me to tag them `typography`?",
].join(MESSAGE_BREAK);

export const CARDS_REPLY = [
  "Found 6 Saves that fit the brief.",
  "**Poster grids.** Most are from Are.na, two are type specimens.",
].join(`\n${MESSAGE_BREAK}\n`);

export const SUGGESTIONS = [
  "Tag these as posters",
  "Find more like these",
  "Only show Are.na",
];

export const MARKDOWN_REPLY = [
  "Here's what I changed:",
  "",
  "- Tagged **4 Saves** `typography`",
  "- Moved 2 into *Inspiration*",
  "- Left the pricing table alone",
  "",
  "```ts",
  'const tags = ["typography", "grid"];',
  "```",
].join("\n");

export function citedReply(sources: AssistantSource[]): string {
  const [a, b, c] = sources;
  return [
    `The closest match is ${a?.title ?? "the poster grid"} [1], which uses a strict 12-column layout.`,
    `${b?.title ?? "The checklist"} [2] and ${c?.title ?? "the specimen"} [3] share the same spacing scale.`,
  ].join(" ");
}

export function lookupReply(sources: AssistantSource[]): string {
  return sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. [${index + 1}] ${source.title}`)
    .join("\n");
}

export const FILES: AssistantFileAttachment[] = [
  {
    id: "file-1",
    name: "moodboard.pdf",
    mediaType: "application/pdf",
    size: 2_400_000,
  },
  { id: "file-2", name: "notes.md", mediaType: "text/markdown", size: 3_200 },
];

export const STOPPED_STEPS: AssistantToolStep[] = [
  { id: "tag", label: "Tag Saves", status: "stopped", elapsedMs: 200 },
];

type Status = AssistantChange["status"];

function save(sources: AssistantSource[], index: number): AssistantSource {
  return (sources[index % sources.length] ??
    SAMPLE_SOURCES[index]) as AssistantSource;
}

export function changes(
  sources: AssistantSource[],
  statuses: Status[] = [],
): AssistantChange[] {
  const status = (index: number): Status => statuses[index] ?? "pending";
  const base = (index: number, reason: string) => {
    const target = save(sources, index);
    return {
      id: `change-${index}`,
      saveId: target.id,
      title: target.title ?? "Untitled",
      reason,
      status: status(index),
      undoable: true,
    };
  };
  return [
    {
      ...base(0, "Matches your other type references."),
      field: "tags",
      before: ["design"],
      after: ["design", "typography"],
    },
    {
      ...base(1, "Belongs with your onboarding references."),
      field: "folders",
      before: [],
      after: ["Inspiration"],
    },
    {
      ...base(2, "The saved title was the page URL."),
      field: "title",
      before: save(sources, 2).title,
      after: "Brutalist specimen, Grotesk",
    },
    {
      ...base(3, "Worth remembering why you saved it."),
      field: "note",
      before: null,
      after: "Good spacing for the settings rebuild.",
    },
    {
      ...base(4, "You open this one often."),
      field: "rating",
      before: null,
      after: 4,
    },
  ];
}

export function purge(status: Status): AssistantChange {
  return {
    id: "purge",
    saveId: "",
    title: "Trash",
    reason: "",
    status,
    field: "action",
    action: "purgeTrash",
    before: null,
    after: "Empty Trash",
    undoable: false,
  };
}

export const QUESTION = {
  question: "How should I group these Saves?",
  options: ["By source", "By color", "By project"],
};

function runs(): FishRun[] {
  return [
    {
      routineId: "tidy",
      routineName: "Morning Tidy",
      chatId: "lab-run-1",
      at: NOW - 40 * MINUTE,
      status: "done",
      changes: 4,
      seen: false,
    },
    {
      routineId: "inbox",
      routineName: "Inbox Sweep",
      chatId: "lab-run-2",
      at: NOW - 3 * HOUR,
      status: "failed",
      error: "The model provider rejected the request.",
      changes: 0,
      seen: false,
    },
    {
      routineId: "digest",
      routineName: "Weekly Digest",
      chatId: "lab-run-3",
      at: NOW - DAY - 2 * HOUR,
      status: "done",
      changes: 0,
      seen: false,
    },
  ];
}

export function routines(): FishRoutine[] {
  const [tidy, inbox] = runs();
  return [
    {
      id: "tidy",
      name: "Morning Tidy",
      instruction: "Tag yesterday's Saves and file them into folders.",
      when: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
      paused: false,
      lastRun: tidy ?? null,
      createdAt: NOW - 10 * DAY,
      updatedAt: NOW - DAY,
    },
    {
      id: "inbox",
      name: "Inbox Sweep",
      instruction: "Sort everything in the Inbox.",
      when: { kind: "inbox" },
      paused: false,
      lastRun: inbox ?? null,
      createdAt: NOW - 8 * DAY,
      updatedAt: NOW - 2 * DAY,
    },
    {
      id: "digest",
      name: "Weekly Digest With A Name Long Enough To Clip",
      instruction: "Summarize the week's Saves.",
      when: { kind: "every", hours: 168 },
      paused: true,
      lastRun: null,
      createdAt: NOW - 20 * DAY,
      updatedAt: NOW - 20 * DAY,
    },
  ];
}

export function sampleFish(fish: FishSummary): FishSummary {
  return { ...fish, routines: routines(), runs: runs(), lastRun: null };
}
