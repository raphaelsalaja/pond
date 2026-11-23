import { expect, it } from "vitest";
import { keepsCurrentTitle } from "./harvest-title";

it("keeps a browser tab title when the page's own title is only part of it", () => {
  expect(
    keepsCurrentTitle("malaga - Google Search", { title: "Google Search" }),
  ).toBe(true);
  expect(
    keepsCurrentTitle("Inbox (3) | Example Mail", { title: "example mail" }),
  ).toBe(true);
});

it("takes the harvested title when it adds or changes anything", () => {
  expect(keepsCurrentTitle("Google Search", { title: "malaga" })).toBe(false);
  expect(keepsCurrentTitle("Example", { title: "Example Domain" })).toBe(false);
  expect(keepsCurrentTitle("Old headline", { title: "New headline" })).toBe(
    false,
  );
  expect(keepsCurrentTitle("Same title", { title: "Same title" })).toBe(false);
});

it("takes the query as the title of a search results page", () => {
  expect(
    keepsCurrentTitle("malaga - Google Search", {
      title: "malaga",
      extras: { search: { engine: "Google Search", query: "malaga" } },
    }),
  ).toBe(false);
});

it("takes the harvested title when the Save has none", () => {
  expect(keepsCurrentTitle(null, { title: "Google Search" })).toBe(false);
  expect(keepsCurrentTitle("  ", { title: "Google Search" })).toBe(false);
});

it("leaves a harvest without a title to the regular patch", () => {
  expect(keepsCurrentTitle("malaga - Google Search", {})).toBe(false);
});
