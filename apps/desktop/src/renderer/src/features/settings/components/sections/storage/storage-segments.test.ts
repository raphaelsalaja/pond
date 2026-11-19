import { expect, it } from "vitest";
import { storageSegments } from "./storage-segments";

const empty = { items: 0, videoCache: 0, thumbs: 0, meta: 0, db: 0, other: 0 };

it("splits the Library into the categories that hold data", () => {
  const segments = storageSegments({ ...empty, items: 300, thumbs: 100 });
  expect(segments).toEqual([
    { key: "items", label: "Items", bytes: 300, percent: 75 },
    { key: "thumbs", label: "Thumbnails", bytes: 100, percent: 25 },
  ]);
});

it("shows nothing for an empty Library", () => {
  expect(storageSegments(empty)).toEqual([]);
});
