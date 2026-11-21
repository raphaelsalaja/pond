import { expect, it } from "vitest";
import { urlForHarvest } from "./item";

it("navigates to the watch UI for a shorts save", () => {
  expect(urlForHarvest("https://www.youtube.com/shorts/PZk6_7_ktoo")).toBe(
    "https://www.youtube.com/watch?v=PZk6_7_ktoo",
  );
});

it("navigates to the watch UI for a youtu.be save", () => {
  expect(urlForHarvest("https://youtu.be/PZk6_7_ktoo")).toBe(
    "https://www.youtube.com/watch?v=PZk6_7_ktoo",
  );
});

it("keeps a watch URL canonical", () => {
  expect(
    urlForHarvest("https://www.youtube.com/watch?v=PZk6_7_ktoo&t=42"),
  ).toBe("https://www.youtube.com/watch?v=PZk6_7_ktoo");
});

it("leaves a URL with no video id alone", () => {
  const url = "https://www.youtube.com/@aiDotEngineer";
  expect(urlForHarvest(url)).toBe(url);
});
