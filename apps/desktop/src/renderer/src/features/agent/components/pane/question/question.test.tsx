import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KoiQuestion } from ".";

type Answer = ComponentProps<typeof KoiQuestion>["onAnswer"];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const options = ["Grid", "List"];
const buttonNamed = (name: string) =>
  [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith(name),
  );
const choices = () => [
  ...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
];

async function renderQuestion(
  props: Partial<ComponentProps<typeof KoiQuestion>> = {},
) {
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        onAnswer={vi.fn<Answer>()}
        {...props}
      />,
    ),
  );
}

async function press(target: Element | null | undefined, key: string) {
  await act(async () =>
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}

it("numbers each option, then a freeform row", async () => {
  await renderQuestion();
  expect(choices().map((choice) => choice.textContent)).toEqual([
    "1Grid",
    "2List",
  ]);
  expect(host.querySelector('input[aria-label="Your answer"]')).not.toBeNull();
  expect(buttonNamed("Continue")?.disabled).toBe(true);
});

it("sends the picked option", async () => {
  const onAnswer = vi.fn<Answer>();
  await renderQuestion({ onAnswer });
  const list = choices()[1];
  await act(async () => list?.click());
  expect(list?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => buttonNamed("Continue")?.click());
  expect(onAnswer).toHaveBeenCalledWith("List");
});

it("sends an option on Enter", async () => {
  const onAnswer = vi.fn<Answer>();
  await renderQuestion({ onAnswer });
  await press(choices()[0], "Enter");
  expect(onAnswer).toHaveBeenCalledWith("Grid");
});

it("sends the option a number key names", async () => {
  const onAnswer = vi.fn<Answer>();
  await renderQuestion({ onAnswer });
  await press(choices()[0], "2");
  expect(onAnswer).toHaveBeenCalledWith("List");
});

it("focuses the freeform row on the number after the last option", async () => {
  const onAnswer = vi.fn<Answer>();
  await renderQuestion({ onAnswer });
  await press(choices()[0], "3");
  expect(document.activeElement).toBe(
    host.querySelector('input[aria-label="Your answer"]'),
  );
  expect(onAnswer).not.toHaveBeenCalled();
});

it("ignores number keys while typing an answer", async () => {
  const onAnswer = vi.fn<Answer>();
  await renderQuestion({ onAnswer });
  await press(host.querySelector("input"), "1");
  expect(onAnswer).not.toHaveBeenCalled();
});

it("marks the recommended option", async () => {
  await renderQuestion({ recommended: 1 });
  expect(choices().map((choice) => choice.textContent)).toEqual([
    "1Grid",
    "2ListRecommended",
  ]);
});

it("folds into a waiting receipt on Esc and reopens on Answer", async () => {
  await renderQuestion();
  await press(choices()[0], "Escape");
  expect(host.textContent).toContain("Question waiting");
  await act(async () => buttonNamed("Answer")?.click());
  expect(choices()).toHaveLength(2);
});

it("hides freeform on older questions", async () => {
  await renderQuestion({ disabled: true });
  expect(host.querySelector("input")).toBeNull();
});

it("shows an answered question as a receipt that unfolds to the answer", async () => {
  await renderQuestion({ answered: "List" });
  expect(host.textContent).toBe("ListWhich layout?");
  expect(buttonNamed("Continue")).toBeUndefined();
  const toggle = host.querySelector<HTMLButtonElement>("button[aria-expanded]");
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle?.click());
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toBe("ListWhich layout?Which layout?List");
});
