import { normalizeSidebarDestinationOrder } from "@pond/schema";
import { expect, it } from "vitest";
import { moveVisibleSidebarDestination } from "./sidebar-customization";

const LIBRARY_DESTINATIONS = [
  "all",
  "uncategorized",
  "untagged",
  "recentlyAdded",
  "recentlyUsed",
  "tags",
  "random",
  "splitPosts",
  "trash",
] as const;

it("places a newly added destination in its default relative position", () => {
  expect(
    normalizeSidebarDestinationOrder([
      "all",
      "uncategorized",
      "untagged",
      "recentlyUsed",
      "tags",
      "random",
      "trash",
      "downloads",
      "sources",
    ]),
  ).toEqual([...LIBRARY_DESTINATIONS, "downloads", "sources"]);
});

it("reorders visible sidebar destinations while preserving hidden slots", () => {
  expect(
    moveVisibleSidebarDestination(
      [...LIBRARY_DESTINATIONS, "downloads", "sources"],
      LIBRARY_DESTINATIONS,
      [
        "all",
        "untagged",
        "recentlyAdded",
        "recentlyUsed",
        "tags",
        "random",
        "trash",
      ],
      "all",
      "tags",
    ),
  ).toEqual([
    "untagged",
    "uncategorized",
    "recentlyAdded",
    "recentlyUsed",
    "tags",
    "all",
    "random",
    "splitPosts",
    "trash",
    "downloads",
    "sources",
  ]);
});

it("leaves an unknown visible sidebar move unchanged", () => {
  expect(
    moveVisibleSidebarDestination(
      [...LIBRARY_DESTINATIONS, "downloads", "sources"],
      LIBRARY_DESTINATIONS,
      LIBRARY_DESTINATIONS,
      "downloads",
      "tags",
    ),
  ).toEqual([...LIBRARY_DESTINATIONS, "downloads", "sources"]);
});
