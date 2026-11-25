import { expect, it } from "vitest";
import { groupInboxEntries } from "./use-inbox-items";

type Entries = Parameters<typeof groupInboxEntries>[0];

const NOW = new Date(2026, 10, 25, 12).getTime();

function save(id: string, kind: string, source: string): Entries[number] {
  return {
    type: "save",
    key: `save:${id}`,
    id,
    index: 0,
    unread: true,
    at: NOW,
    kind,
    source,
  };
}

const notification = {
  type: "notification",
  key: "n1",
  notification: {
    id: "n1",
    kind: "activity",
    priority: false,
    title: "Sync finished",
    createdAt: NOW,
    updatedAt: NOW,
  },
  unread: true,
  at: NOW,
} satisfies Entries[number];

function sections(entries: Entries) {
  return entries.map((entry) => [entry.key, entry.section]);
}

it("groups Saves by the Library's Type labels in filter order", () => {
  const grouped = groupInboxEntries(
    [
      save("a", "link", "web"),
      notification,
      save("b", "video", "twitter"),
      save("c", "", "local"),
      save("d", "image", "threads"),
    ],
    "type",
    NOW,
  );
  expect(sections(grouped)).toEqual([
    ["save:d", "Image"],
    ["save:b", "Video"],
    ["save:a", "Website"],
    ["save:c", "Other"],
    ["n1", "Notifications"],
  ]);
});

it("groups Saves by Source alphabetically and keeps rank order inside a section", () => {
  const grouped = groupInboxEntries(
    [
      save("a", "image", "threads"),
      save("b", "image", "instagram"),
      notification,
      save("c", "video", "threads"),
    ],
    "source",
    NOW,
  );
  expect(sections(grouped)).toEqual([
    ["save:b", "Instagram"],
    ["save:a", "Threads"],
    ["save:c", "Threads"],
    ["n1", "Notifications"],
  ]);
});

it("leaves the list unsectioned with no grouping", () => {
  const entries = [save("a", "image", "threads"), notification];
  expect(sections(groupInboxEntries(entries, "none", NOW))).toEqual([
    ["save:a", undefined],
    ["n1", undefined],
  ]);
});
