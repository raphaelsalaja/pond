import { describe, expect, it } from "vitest";
import {
  fishLayout,
  LOOSE,
  layoutPlacements,
  moveFish,
  PINNED,
  sameLayout,
  shelfOf,
} from "./layout";

const sections = [
  { id: "app", name: "App" },
  { id: "staff", name: "Staff" },
];

const school = [
  { id: "koi", pinned: true },
  { id: "scout", section: "app" },
  { id: "lost", section: "gone" },
  { id: "clerk", section: "staff" },
  { id: "pilot", pinned: true, section: "app" },
];

describe("fishLayout", () => {
  it("shelves pinned fish first and sends unknown sections to the loose list", () => {
    expect(fishLayout(school, sections)).toEqual({
      [PINNED]: ["koi", "pilot"],
      [LOOSE]: ["lost"],
      app: ["scout"],
      staff: ["clerk"],
    });
  });
});

describe("moveFish", () => {
  it("moves a fish onto another shelf at an index", () => {
    const layout = fishLayout(school, sections);
    const next = moveFish(layout, "clerk", PINNED, 1);
    expect(next[PINNED]).toEqual(["koi", "clerk", "pilot"]);
    expect(next.staff).toEqual([]);
    expect(shelfOf(next, "clerk")).toBe(PINNED);
    expect(sameLayout(layout, next)).toBe(false);
  });
});

describe("layoutPlacements", () => {
  it("lists every fish in sidebar order with its shelf", () => {
    expect(
      layoutPlacements(
        moveFish(fishLayout(school, sections), "koi", "staff", 0),
        sections,
      ),
    ).toEqual([
      { id: "pilot", pinned: true, section: null },
      { id: "lost", pinned: false, section: null },
      { id: "scout", pinned: false, section: "app" },
      { id: "koi", pinned: false, section: "staff" },
      { id: "clerk", pinned: false, section: "staff" },
    ]);
  });
});
