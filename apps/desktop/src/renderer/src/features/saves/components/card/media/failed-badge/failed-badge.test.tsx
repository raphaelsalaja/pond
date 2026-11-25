import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { FailedBadge } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function save(status: Save["status"]): Save {
  return {
    id: "save",
    source: "web",
    sourceId: "save",
    url: "https://example.test/save",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    status,
    tasks: [
      {
        op: "fetch_blobs",
        status: "dead",
        attempts: 5,
        maxAttempts: 5,
        lastError: "The image could not be downloaded.",
        nextRunAt: 0,
        updatedAt: 0,
      },
    ],
  };
}

function render(saveValue: Save) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<FailedBadge save={saveValue} />));
}

describe("FailedBadge", () => {
  it("shows a compact icon while retaining the failure detail", () => {
    render(save("failed"));

    const indicator = container?.querySelector('[role="status"]');
    expect(indicator?.getAttribute("aria-label")).toBe("Ingest failed");
    expect(indicator?.getAttribute("title")).toBe(
      "The image could not be downloaded.",
    );
    expect(indicator?.textContent).toBe("");
    expect(indicator?.querySelector("svg")).not.toBeNull();
  });

  it("stays hidden for a completed save", () => {
    render(save("complete"));
    expect(container?.querySelector('[role="status"]')).toBeNull();
  });
});
