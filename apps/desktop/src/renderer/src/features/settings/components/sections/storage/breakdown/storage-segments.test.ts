import { expect, it } from "vitest";
import { storageSegments } from "./storage-segments";

const empty = { items: 0, videoCache: 0, thumbs: 0, meta: 0, db: 0, other: 0 };

it("lists every category with its share of the Library", () => {
  const segments = storageSegments({ ...empty, items: 300, thumbs: 100 });
  expect(segments).toEqual([
    { key: "items", label: "Saves", bytes: 300, percent: 75 },
    { key: "videoCache", label: "Video Cache", bytes: 0, percent: 0 },
    { key: "thumbs", label: "Thumbnails", bytes: 100, percent: 25 },
    { key: "meta", label: "Metadata", bytes: 0, percent: 0 },
    { key: "db", label: "Database", bytes: 0, percent: 0 },
    { key: "other", label: "Other", bytes: 0, percent: 0 },
  ]);
});

it("shows nothing for an empty Library", () => {
  expect(storageSegments(empty)).toEqual([]);
});
