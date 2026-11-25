import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KoiQuestion } from ".";

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
        onAnswer={vi.fn(async () => {})}
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

it("lists each option with its number key and no free-text field", async () => {
  await renderQuestion();
  expect(choices().map((choice) => choice.textContent)).toEqual([
    "Grid1",
    "List2",
  ]);
  expect(host.querySelector("input")).toBeNull();
  expect(buttonNamed("Continue")?.disabled).toBe(true);
});

it("sends the picked option", async () => {
  const onAnswer = vi.fn(async () => {});
  await renderQuestion({ onAnswer });
  const list = choices()[1];
  await act(async () => list?.click());
  expect(list?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => buttonNamed("Continue")?.click());
  expect(onAnswer).toHaveBeenCalledWith("List");
});

it("sends an option on Enter", async () => {
  const onAnswer = vi.fn(async () => {});
  await renderQuestion({ onAnswer });
  await press(choices()[0], "Enter");
  expect(onAnswer).toHaveBeenCalledWith("Grid");
});

it("sends the option a number key names", async () => {
  const onAnswer = vi.fn(async () => {});
  await renderQuestion({ onAnswer });
  await press(choices()[0], "2");
  expect(onAnswer).toHaveBeenCalledWith("List");
});

it("ignores a number key past the last option", async () => {
  const onAnswer = vi.fn(async () => {});
  await renderQuestion({ onAnswer });
  await press(choices()[0], "3");
  expect(onAnswer).not.toHaveBeenCalled();
});

it("marks the recommended option", async () => {
  await renderQuestion({ recommended: 1 });
  expect(choices().map((choice) => choice.textContent)).toEqual([
    "Grid1",
    "ListRecommended2",
  ]);
});

it("folds into a waiting receipt on Esc and reopens on Answer", async () => {
  await renderQuestion();
  await press(choices()[0], "Escape");
  expect(host.textContent).toContain("Question waiting");
  await act(async () => buttonNamed("Answer")?.click());
  expect(choices()).toHaveLength(2);
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
