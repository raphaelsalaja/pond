// Checks how the macOS icon style settings map to the icon Pond shows.
import { describe, expect, it } from "vitest";
import {
  classifyIconStyle,
  macosMajor,
  parseIconStyleLine,
  supportsIconStyles,
} from "./icon-style";

describe("classifyIconStyle", () => {
  it.each([
    ["", "", "light"],
    ["", "Dark", "light"],
    ["RegularDark", "", "dark"],
    ["RegularAutomatic", "Dark", "dark"],
    ["RegularAutomatic", "", "light"],
    ["ClearDark", "Dark", "monochrome"],
    ["ClearLight", "", "monochrome"],
    ["TintedDark", "", "monochrome"],
  ] as const)("theme %j with interface %j is %s", (theme, ui, style) => {
    expect(classifyIconStyle({ theme, interface: ui })).toBe(style);
  });
});

describe("parseIconStyleLine", () => {
  it("reads the helper's JSON line", () => {
    expect(parseIconStyleLine('{"theme":"RegularDark","interface":""}')).toBe(
      "dark",
    );
  });

  it("ignores anything else", () => {
    expect(parseIconStyleLine("not json")).toBeNull();
    expect(parseIconStyleLine('{"theme":1}')).toBeNull();
  });
});

it("has icon styles only on macOS 26 and later", () => {
  expect(supportsIconStyles("darwin", "26.0.1")).toBe(true);
  expect(supportsIconStyles("darwin", "15.7")).toBe(false);
  expect(supportsIconStyles("win32", "10.0.26100")).toBe(false);
});

it("reads the macOS major version only on macOS", () => {
  expect(macosMajor("darwin", "27.2")).toBe(27);
  expect(macosMajor("darwin", "28.0")).toBe(28);
  expect(macosMajor("win32", "10.0.26100")).toBeNull();
});
