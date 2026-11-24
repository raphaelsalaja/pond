import { describe, expect, it } from "vitest";
import {
  findComposerTrigger,
  replaceComposerTrigger,
} from "./composer-trigger";

describe("composer triggers", () => {
  it.each([
    "@",
    "Compare @film",
    "Compare\n@Under the Skin",
    "/",
    "/connect",
    "Please /organize",
  ])("finds an active trigger in %s", (value) => {
    expect(findComposerTrigger(value, value.length)).not.toBeNull();
  });
  it.each([
    "hello@example.com",
    "https://example.com/film",
    "path/to/file",
    "No trigger",
    "@film\n",
    "one/two",
  ])("leaves ordinary text alone: %s", (value) => {
    expect(findComposerTrigger(value, value.length)).toBeNull();
  });
  it("does not trigger on selected text or inside a word", () => {
    expect(findComposerTrigger("@film", 0, 5)).toBeNull();
    expect(findComposerTrigger("@film", 3)).toBeNull();
  });
  it("uses the trigger at the cursor, preserving text on both sides", () => {
    const value = "Compare @film with my notes";
    const trigger = findComposerTrigger(value, 13);
    expect(trigger).toEqual({ kind: "@", query: "film", start: 8, end: 13 });
    if (!trigger) {
      throw new Error("Expected a mention");
    }
    expect(replaceComposerTrigger(value, trigger, "")).toEqual({
      value: "Compare  with my notes",
      cursor: 8,
    });
  });
  it("inserts an action without overwriting the rest of the draft", () => {
    const value = "/sum Focus on lighting.";
    const trigger = findComposerTrigger(value, 4);
    if (!trigger) {
      throw new Error("Expected an action");
    }
    expect(
      replaceComposerTrigger(value, trigger, "Summarize these Saves."),
    ).toEqual({
      value: "Summarize these Saves. Focus on lighting.",
      cursor: 22,
    });
  });
});
