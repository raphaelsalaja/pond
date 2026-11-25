import type { AssistantToolStep } from "@shared/assistant";
import { expect, it } from "vitest";
import { currentActivityLabel } from "./activity-label";

it("follows tool starts, results, and the next action", () => {
  const steps: Array<AssistantToolStep> = [];
  expect(currentActivityLabel("thinking", steps)).toBe("Thinking");
  const searchStep: AssistantToolStep = {
    id: "search",
    label: "Search library",
    detail: "typography",
    status: "running",
  };
  steps.push(searchStep);
  expect(currentActivityLabel("thinking", steps)).toBe(
    "Searching your library: typography",
  );
  searchStep.status = "complete";
  expect(currentActivityLabel("thinking", steps)).toBe(
    "Looking through the results",
  );
  steps.push({ id: "read", label: "Read Save", status: "running" });
  expect(currentActivityLabel("searching", steps)).toBe("Reading a Save");
  steps[1] = { id: "read", label: "Read Save", status: "complete" };
  expect(currentActivityLabel("thinking", steps)).toBe(
    "Thinking about what it read",
  );
  expect(currentActivityLabel("writing", steps)).toBe("Writing a response");
});

it("keeps reporting a running tool when a concurrent tool finishes", () => {
  expect(
    currentActivityLabel("thinking", [
      { id: "1", label: "Find duplicates", status: "running" },
      { id: "2", label: "Read folders", status: "complete" },
    ]),
  ).toBe("Finding duplicates");
});

it("does not describe failed or cancelled actions as running", () => {
  expect(
    currentActivityLabel("reading", [
      { id: "1", label: "Read Save", status: "error" },
      { id: "2", label: "Search library", status: "stopped" },
    ]),
  ).toBe("Reading Saves");
  expect(currentActivityLabel("thinking", [])).toBe("Thinking");
});

it("reports routine edits while they run and after", () => {
  expect(
    currentActivityLabel("thinking", [
      { id: "1", label: "Set up routine", status: "running" },
    ]),
  ).toBe("Setting up a routine");
  expect(
    currentActivityLabel("thinking", [
      { id: "1", label: "Delete routine", status: "complete" },
    ]),
  ).toBe("Checking your routines");
});
