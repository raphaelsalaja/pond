import { expect, it } from "vitest";
import { keepsCurrentTitle } from "./harvest-title";

it("keeps a browser tab title when the page's own title is only part of it", () => {
  expect(keepsCurrentTitle("malaga - Google Search", "Google Search")).toBe(
    true,
  );
  expect(keepsCurrentTitle("Inbox (3) | Example Mail", "example mail")).toBe(
    true,
  );
});

it("takes the harvested title when it adds or changes anything", () => {
  expect(keepsCurrentTitle("Google Search", "malaga")).toBe(false);
  expect(keepsCurrentTitle("Example", "Example Domain")).toBe(false);
  expect(keepsCurrentTitle("Old headline", "New headline")).toBe(false);
  expect(keepsCurrentTitle("Same title", "Same title")).toBe(false);
});

it("takes the harvested title when the Save has none", () => {
  expect(keepsCurrentTitle(null, "Google Search")).toBe(false);
  expect(keepsCurrentTitle("  ", "Google Search")).toBe(false);
});

it("leaves a harvest without a title to the regular patch", () => {
  expect(keepsCurrentTitle("malaga - Google Search", null)).toBe(false);
});
