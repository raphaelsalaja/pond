import type { UndoStepOutcome, WireUndoStepState } from "@shared/wire";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastHost } from "@/shared/components/toast-host";
import { toastManager } from "@/shared/lib/toast";
import { notifyUndoable, type UndoStepHistory } from "@/shared/lib/undo-toast";

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ToastHost />));
});

afterEach(async () => {
  toastManager.close();
  await act(async () => root.unmount());
  host.remove();
});

function toasts(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>(
      "[data-slot='toasts'] [role='dialog']",
    ),
  ];
}

function action(label: string): HTMLButtonElement {
  const button = [
    ...document.body.querySelectorAll<HTMLButtonElement>(
      "[data-slot='toasts'] button",
    ),
  ].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  return button;
}

function state(outcome: UndoStepOutcome): WireUndoStepState {
  return { outcome, canUndo: true, canRedo: true };
}

/** Records calls and lets each test settle them, so in-flight states are observable. */
function controlledHistory() {
  const calls: string[] = [];
  let settle: (outcome: UndoStepOutcome) => void = () => {};
  const pending = () =>
    new Promise<WireUndoStepState>((resolve) => {
      settle = (outcome) => resolve(state(outcome));
    });
  const history: UndoStepHistory = {
    undoStep: (step) => {
      calls.push(`undo:${step}`);
      return pending();
    },
    redoStep: (step) => {
      calls.push(`redo:${step}`);
      return pending();
    },
  };
  return {
    history,
    calls,
    settle: (outcome: UndoStepOutcome) => settle(outcome),
  };
}

const options = {
  id: "folder-membership",
  title: 'Added to "Inspiration"',
  undoneTitle: "Assignment undone",
  subject: "folder change",
  step: "step-1",
};

it("undoes its own step, then offers Redo for the same step", async () => {
  const { history, calls, settle } = controlledHistory();
  const onChange = vi.fn();
  await act(async () => {
    notifyUndoable({ ...options, onChange }, history);
  });
  expect(toasts()[0]?.textContent).toContain('Added to "Inspiration"');

  await act(async () => action("Undo").click());
  expect(calls).toEqual(["undo:step-1"]);
  expect(action("Undo").disabled).toBe(true);
  await act(async () => action("Undo").click());
  expect(calls).toEqual(["undo:step-1"]);

  await act(async () => settle("done"));
  expect(toasts()[0]?.textContent).toContain("Assignment undone");
  expect(onChange).toHaveBeenCalledTimes(1);

  await act(async () => action("Redo").click());
  expect(action("Redo").disabled).toBe(true);
  await act(async () => settle("done"));
  expect(calls).toEqual(["undo:step-1", "redo:step-1"]);
  expect(toasts()[0]?.textContent).toContain('Added to "Inspiration"');
  expect(action("Undo").disabled).toBe(false);
  expect(onChange).toHaveBeenCalledTimes(2);
});

it("refuses to undo once newer changes sit above the step", async () => {
  const { history, settle } = controlledHistory();
  await act(async () => {
    notifyUndoable(options, history);
  });
  await act(async () => action("Undo").click());
  await act(async () => settle("stale"));
  const text = toasts()[0]?.textContent ?? "";
  expect(text).toContain("Can't undo folder change");
  expect(text).toContain("Other changes came after it.");
  expect(() => action("Undo")).toThrow();
});

it("keeps Undo available to retry after a failed undo", async () => {
  const { history, calls, settle } = controlledHistory();
  await act(async () => {
    notifyUndoable(options, history);
  });
  await act(async () => action("Undo").click());
  await act(async () => settle("failed"));
  expect(toasts()[0]?.textContent).toContain("Couldn't undo folder change");
  expect(action("Undo").disabled).toBe(false);
  await act(async () => action("Undo").click());
  expect(calls).toEqual(["undo:step-1", "undo:step-1"]);
});

it("confirms a change without Undo when it recorded no step", async () => {
  await act(async () => {
    notifyUndoable({ ...options, step: null }, controlledHistory().history);
  });
  expect(toasts()[0]?.textContent).toContain('Added to "Inspiration"');
  expect(() => action("Undo")).toThrow();
});

it("keeps only the latest undoable change on screen", async () => {
  const { history } = controlledHistory();
  await act(async () => {
    notifyUndoable(options, history);
    notifyUndoable(
      { ...options, title: 'Added to "Travel"', step: "step-2" },
      history,
    );
  });
  await vi.waitFor(() => {
    const open = toasts().filter(
      (toast) => !toast.hasAttribute("data-ending-style"),
    );
    expect(open.map((toast) => toast.textContent)).toEqual([
      expect.stringContaining('Added to "Travel"'),
    ]);
  });
});
