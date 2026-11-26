import { describe, expect, it } from "vitest";
import { buildModel, rankEntries } from "./rank";
import { specEntries } from "./spec-entries";
import type { MenuEntry } from "./types";

const noop = () => {};

const saveEntries = specEntries(
  [
    { label: "Copy Name", onClick: noop },
    {
      type: "submenu",
      label: "Copy Options",
      items: [{ label: "Copy Pond Link", onClick: noop }],
    },
    {
      type: "submenu",
      label: "Add to Folders",
      items: [{ label: "Design", onClick: noop }],
    },
  ],
  "1 Selected",
  "focus",
);

const folder: MenuEntry = {
  id: "folder:design",
  group: "Folders",
  label: "Design",
  icon: null,
  run: noop,
};

function labels(query: string): Array<string> {
  const model = buildModel({
    ranked: rankEntries([...saveEntries, folder], query),
    byScore: true,
  });
  return model.entries.map(
    ({ entry }) => `${entry.group}: ${entry.label} (${entry.detail ?? ""})`,
  );
}

describe("rankEntries", () => {
  it("finds an action nested in a submenu, in its parent's group", () => {
    expect(labels("copy pond link")[0]).toBe(
      "1 Selected: Copy Pond Link (Copy Options)",
    );
  });

  it("ranks an entry at the current level above a nested one with the same name", () => {
    expect(labels("design")).toEqual([
      "Folders: Design ()",
      "1 Selected: Design (Add to Folders)",
    ]);
  });

  it("leaves nested actions out until you type", () => {
    expect(labels("")).not.toContain(
      "1 Selected: Copy Pond Link (Copy Options)",
    );
  });
});
