import { expect, it } from "vitest";
import { fromUIMessage, partData, toUIMessage } from "./pond-messages";
import type { PondUIMessage } from "./pond-messages";

it("preserves work timing for streamed and reopened replies without tools", () => {
  const live: PondUIMessage = {
    id: "reply",
    role: "assistant",
    parts: [{ type: "text", text: "Hello" }],
    metadata: { elapsedMs: 90_000 },
  };
  const saved = fromUIMessage(live, "chat");
  expect(saved.metadata?.elapsedMs).toBe(90_000);
  expect(fromUIMessage(toUIMessage(saved), "chat").metadata?.elapsedMs).toBe(
    90_000,
  );
});

it("uses the latest streamed tool snapshot instead of the first running state", () => {
  const message: PondUIMessage = {
    id: "reply",
    role: "assistant",
    parts: [
      {
        type: "data-pond-steps",
        data: [{ id: "1", label: "Search library", status: "running" }],
      },
      {
        type: "data-pond-steps",
        data: [
          { id: "1", label: "Search library", status: "complete" },
          { id: "2", label: "Read Save", status: "running" },
        ],
      },
      { type: "data-pond-activity", data: { activity: "searching" } },
      { type: "data-pond-activity", data: { activity: "reading" } },
    ],
  };
  expect(partData(message, "pond-activity")).toEqual({ activity: "reading" });
  expect(fromUIMessage(message, "chat").metadata?.steps).toEqual([
    { id: "1", label: "Search library", status: "complete" },
    { id: "2", label: "Read Save", status: "running" },
  ]);
});
