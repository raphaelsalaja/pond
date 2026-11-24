import { FIELD_META } from "@pond/schema/filters/meta";
import type { Predicate } from "@pond/schema/filters/types";
import { isHTMLTag } from "@pond/ui/dom";
import { RouterContextProvider } from "@tanstack/react-router";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { normalise } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import { FilterCategory } from "./category";
import { choiceOptions, presetOptions } from "./options";
import type { FilterOption } from "./options";

function Harness({
  field,
  initial,
  options,
  onRows,
}: {
  field: Predicate["field"];
  initial: Array<Predicate>;
  options: Array<FilterOption>;
  onRows: (rows: Array<Predicate>) => void;
}) {
  const [value, setValue] = useState(initial);
  onRows(value);
  return (
    <FilterCategory
      field={field}
      options={options}
      rows={value}
      onChange={setValue}
    />
  );
}

function element(role: string, text: string): HTMLElement {
  const elements = [
    ...document.querySelectorAll<HTMLElement>(
      role === "button" ? "button" : `[role="${role}"]`,
    ),
  ];
  const match = elements.find(
    (node) =>
      node.getAttribute("aria-label") === text || node.textContent === text,
  );
  if (!match) {
    throw new Error(`Missing ${role}: ${text}`);
  }
  return match;
}

async function click(role: string, text: string) {
  await act(async () => element(role, text).click());
}

async function fill(label: string, value: string) {
  const labels = [...document.querySelectorAll<HTMLLabelElement>("label")];
  const input =
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `input[aria-label="${label}"]`,
    ) ??
    document.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${label}"]`,
    ) ??
    document.getElementById(
      labels.find((node) => node.textContent === label)?.htmlFor ?? "",
    );
  if (!isHTMLTag(input, "input") && !isHTMLTag(input, "textarea")) {
    throw new Error(`Missing input ${label}`);
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      isHTMLTag(input, "textarea")
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function apply() {
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 300);
      }),
  );
}

async function context(text: string) {
  await act(async () => {
    element("menuitemcheckbox", text).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  });
}

function checkboxLabels() {
  return [...document.querySelectorAll('[role="menuitemcheckbox"]')].map(
    (node) => node.textContent,
  );
}

describe("filter editors", () => {
  let root: Root;
  let host: HTMLDivElement;
  let rows: Array<Predicate>;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    pool.clear();
    for (const [id, tags] of [
      ["one", ["design", "motion"]],
      ["two", ["design"]],
      ["three", []],
    ] satisfies Array<[string, Array<string>]>) {
      const save = normalise({
        id,
        tags,
        source: "local",
        url: "",
        files: tags.length
          ? [{ kind: "file", path: "asset.design", sha256: "", size: 1 }]
          : [],
      });
      if (!save) {
        throw new Error("Invalid count fixture");
      }
      pool.upsert(save);
    }
    rows = [];
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    pool.clear();
    vi.unstubAllGlobals();
  });
  async function render(
    field: Predicate["field"],
    initial: Array<Predicate> = [],
    options: Array<FilterOption> = field === "tags"
      ? choiceOptions(field, [
          { label: "Design", value: "design" },
          { label: "Motion", value: "motion" },
        ])
      : presetOptions(field),
  ) {
    const router = await openLibraryAt("/");
    await act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <Harness
            field={field}
            initial={initial}
            options={options}
            onRows={(value) => {
              rows = value;
            }}
          />
        </RouterContextProvider>,
      ),
    );
    const label = FIELD_META[field].label;
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((node) =>
          (node.getAttribute("aria-label") ?? "").startsWith(label),
        )
        ?.click(),
    );
  }
  it("opens text fields such as font family with a search input", async () => {
    await render("fontFamily");
    const label = FIELD_META.fontFamily.label;
    expect(
      document.querySelector(`input[aria-label="Search ${label}"]`),
    ).not.toBeNull();
  });

  it("selects tags without a matching selector", async () => {
    await render("tags");
    await click("menuitemcheckbox", "Design2");
    await click("menuitemcheckbox", "Motion1");
    expect(rows).toEqual([
      { field: "tags", operator: "some", value: ["design", "motion"] },
    ]);
    expect(document.querySelector('[aria-label="Tags Matching"]')).toBeNull();
  });

  it("excludes a tag independently while retaining included tags", async () => {
    await render("tags", [
      { field: "tags", operator: "some", value: ["design"] },
    ]);
    await context("Motion1");
    expect(rows).toEqual([
      { field: "tags", operator: "some", value: ["design"] },
      { field: "tags", operator: "none", value: ["motion"] },
    ]);
    expect(
      element("menuitemcheckbox", "Motion1").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      element("menuitemcheckbox", "Motion1").getAttribute("aria-description"),
    ).toBe("Excluded");
    expect(document.body.textContent).not.toContain("(excluded)");
    expect(document.body.textContent).not.toContain("Click to select");
  });

  it("preserves an existing all-tags rule when adding a tag", async () => {
    await render("tags", [
      { field: "tags", operator: "every", value: ["motion"] },
    ]);
    await click("menuitemcheckbox", "Design2");
    expect(rows).toEqual([
      { field: "tags", operator: "every", value: ["motion", "design"] },
    ]);
  });

  it("lists tags in one column with their group as a breadcrumb", async () => {
    await render(
      "tags",
      [],
      choiceOptions("tags", [
        { label: "Design", value: "design" },
        { label: "Motion", value: "motion" },
      ]).map((option) =>
        option.label === "Motion" ? { ...option, crumb: "Craft" } : option,
      ),
    );
    expect(
      [...document.querySelectorAll('[role="menuitemcheckbox"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Untagged1", "Craft›Motion1", "Design2"]);
    expect(document.querySelector('[aria-label="Tag Group"]')).toBeNull();
  });

  it("folds tags with no matching saves behind one row until opened", async () => {
    const unused = Array.from({ length: 9 }, (_, index) => ({
      label: `Unused ${index}`,
      value: `unused-${index}`,
    }));
    await render(
      "tags",
      [{ field: "tags", operator: "some", value: ["unused-0"] }],
      choiceOptions("tags", [{ label: "Design", value: "design" }, ...unused]),
    );
    expect(checkboxLabels()).toEqual(["Untagged1", "Design2", "Unused 0"]);
    await click("menuitem", "8 tags with no matching Saves");
    expect(checkboxLabels()).toHaveLength(11);
  });

  it("has no generic matching control or range presets for duration", async () => {
    await render("duration");
    expect(
      document.querySelector('[aria-label="Duration Matching"]'),
    ).toBeNull();
    expect(document.querySelector('[aria-label="Duration Preset"]')).toBeNull();
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it("automatically applies ranges without remounting the focused input, and clears empty bounds", async () => {
    await render("duration");
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Minimum"]',
    );
    input?.focus();
    await fill("Minimum", "30");
    await apply();
    expect(rows).toEqual([{ field: "duration", operator: "gte", value: 30 }]);
    expect(document.activeElement).toBe(input);
    await fill("Maximum", "10");
    await apply();
    expect(rows).toEqual([{ field: "duration", operator: "gte", value: 30 }]);
    await fill("Maximum", "");
    await fill("Minimum", "");
    await apply();
    expect(rows).toEqual([]);
  });

  it("clears both the applied range and draft from the filter chip", async () => {
    await render("duration");
    await fill("Minimum", "30");
    await apply();
    expect(document.body.textContent).not.toContain("Clear Filter");
    await click("button", "Clear Duration Filter");
    expect(rows).toEqual([]);
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Minimum"]')
        ?.value,
    ).toBe("");
  });

  it("right-click clears an included choice before excluding it, and supports keyboard exclusion", async () => {
    await render("tags");
    await click("menuitemcheckbox", "Design2");
    await context("Design2");
    expect(rows).toEqual([]);
    await act(async () => {
      element("menuitemcheckbox", "Design2").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(rows).toEqual([
      { field: "tags", operator: "none", value: ["design"] },
    ]);
  });

  it("keeps minutes and the entered bounds after applying a duration range", async () => {
    await render("duration");
    await click("combobox", "Duration Unit");
    await click("option", "Minutes");
    await fill("Minimum", "1");
    await fill("Maximum", "3");
    await apply();
    expect(rows).toEqual([
      { field: "duration", operator: "between", value: [60, 180] },
    ]);
    expect(element("combobox", "Duration Unit").textContent).toBe("Minutes");
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>('input[type="number"]'),
      ].map((input) => input.value),
    ).toEqual(["1", "3"]);
  });

  it("applies width and height bounds from one dimensions editor", async () => {
    await render("width");
    await fill("Width Minimum", "800");
    await fill("Height Maximum", "1200");
    await apply();
    expect(rows).toEqual([
      { field: "width", operator: "gte", value: 800 },
      { field: "height", operator: "lte", value: 1200 },
    ]);
  });

  it("filters by exact file formats alongside media type", async () => {
    await render("format");
    await click("menuitemcheckbox", "DESIGN2");
    expect(rows).toEqual([
      { field: "format", operator: "some", value: ["design"] },
    ]);
  });

  it("sorts values from saves by name", async () => {
    await render(
      "creator",
      [],
      choiceOptions("creator", [
        { label: "Zed", value: "zed" },
        { label: "Amy", value: "amy" },
      ]),
    );
    expect(
      [...document.querySelectorAll('[role="menuitemcheckbox"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Amy", "Zed"]);
  });

  it("keeps preset values in their own order", async () => {
    await render("type");
    expect(
      [...document.querySelectorAll('[role="menuitemcheckbox"]')].map((node) =>
        node.textContent?.replace(/\d+$/, ""),
      ),
    ).toEqual(presetOptions("type").map((option) => option.label));
  });

  it("opens rating with a custom range and no star presets", async () => {
    await render("rating");
    expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(2);
  });

  it("finds untagged saves through search and lets includes none omit them", async () => {
    await render("tags");
    await fill("Filter Tags", "untagged");
    await click("menuitemcheckbox", "Untagged1");
    expect(rows).toEqual([{ field: "tags", operator: "empty", value: true }]);
    await context("Untagged1");
    await context("Untagged1");
    expect(rows).toEqual([
      { field: "tags", operator: "empty", value: true, negate: true },
    ]);
  });

  it("opens custom dates without applying an empty range, and restores the applied dates", async () => {
    await render("savedAt");
    expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(rows).toEqual([]);
    await fill("From", "2026-08-01");
    await fill("To", "2026-08-31");
    await apply();
    expect(rows[0]?.operator).toBe("between");
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>('input[type="date"]'),
      ].map((input) => input.value),
    ).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("opens color with presets and enables color range after selection", async () => {
    await render("color");
    expect(rows).toEqual([]);
    expect(
      document.querySelector(
        '[aria-label="Preset Colors"] [data-color][aria-pressed="true"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="Color Accuracy"]',
      )?.disabled,
    ).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Color Hex"]')
        ?.value,
    ).toBe("");
    await click("button", "Red");
    expect(rows).toEqual([
      {
        field: "color",
        operator: "near",
        value: { hex: "#ff2727", tolerance: 60 },
      },
    ]);
    expect(
      document
        .querySelector('[aria-label="Preset Colors"] button[aria-label="Red"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="Color Accuracy"]',
      )?.disabled,
    ).toBe(false);
  });

  it("retains the chosen tolerance across swatches and rejects incomplete hex edits", async () => {
    await render("color", [
      {
        field: "color",
        operator: "near",
        value: { hex: "#0091ff", tolerance: 25 },
      },
    ]);
    await click("button", "White");
    expect(rows[0]?.value).toEqual({ hex: "#ffffff", tolerance: 25 });
    await fill("Color Hex", "#12");
    expect(rows[0]?.value).toEqual({ hex: "#ffffff", tolerance: 25 });
    expect(
      document
        .querySelector('[aria-label="Color Hex"]')
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
    await fill("Color Hex", "123456");
    expect(rows[0]?.value).toEqual({ hex: "#123456", tolerance: 25 });
  });

  it("shows a hex field that applies a typed color", async () => {
    await render("color", [
      {
        field: "color",
        operator: "near",
        value: { hex: "#0091ff", tolerance: 60 },
      },
    ]);
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Color Hex"]',
    );
    expect(input?.value.toLowerCase()).toBe("#0091ff");
    await fill("Color Hex", "#e5484d");
    expect(rows).toEqual([
      {
        field: "color",
        operator: "near",
        value: { hex: "#e5484d", tolerance: 60 },
      },
    ]);
  });

  it("replaces missing-content filtering with phrase matching, and presence replaces the phrase", async () => {
    await render("note", [{ field: "note", operator: "exists", value: false }]);
    await fill("Search Note", "Design details");
    expect(rows).toEqual([{ field: "note", operator: "exists", value: false }]);
    await click("menuitem", "Contains “Design details”");
    expect(rows).toEqual([
      { field: "note", operator: "contains", value: "Design details" },
    ]);
    expect(
      element("menuitemcheckbox", "Contains “Design details”").getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    await click("menuitemcheckbox", "With Note");
    expect(rows).toEqual([{ field: "note", operator: "exists", value: true }]);
  });
});
