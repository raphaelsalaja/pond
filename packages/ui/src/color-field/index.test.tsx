/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ColorField } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function hexInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Background hex"]',
  );
  if (!input) throw new Error("Missing background hex input");
  return input;
}

function swatchStyle(): string {
  const swatch = host.querySelector<HTMLElement>(
    '[aria-label="Background picker"]',
  );
  if (!swatch) throw new Error("Missing background swatch");
  return swatch.getAttribute("style") ?? "";
}

function appliedColor(): string {
  const node = host.querySelector("[data-applied]");
  if (!node) throw new Error("Missing applied color");
  return node.getAttribute("data-applied") ?? "";
}

async function typeHex(value: string) {
  const input = hexInput();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function renderField(value: string, onChange: (hex: string) => void) {
  await act(async () => {
    root.render(
      <ColorField.Root
        aria-label="Background"
        onChange={onChange}
        value={value}
      />,
    );
  });
}

function LiveBackground({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div data-applied={value}>
      <ColorField.Root
        aria-label="Background"
        onChange={setValue}
        value={value}
      />
    </div>
  );
}

it("does not paint a theme from a partial background hex", async () => {
  await act(async () => {
    root.render(<LiveBackground initial="#FCFBF8" />);
  });

  // #FCF is the first three digits of a light background. Expanding it yields #ffccff.
  for (const partial of [
    "#FCFBF",
    "#FCFB",
    "#FCF",
    "#FC",
    "#F",
    "#",
    "",
    "FCF",
    "FC",
    "F",
  ]) {
    await typeHex(partial);
    expect(hexInput().value).toBe(partial);
    expect(appliedColor()).toBe("#FCFBF8");
    expect(swatchStyle()).toContain("rgb(252, 251, 248)");
    expect(swatchStyle()).not.toContain("rgb(255, 204, 255)");
  }

  await act(async () => {
    root.render(<LiveBackground key="dark" initial="#0A0A0A" />);
  });
  // #0A0 is the first three digits of a dark background. Expanding it yields #00aa00.
  await typeHex("#0A0");
  expect(hexInput().value).toBe("#0A0");
  expect(appliedColor()).toBe("#0A0A0A");
  expect(swatchStyle()).toContain("rgb(10, 10, 10)");
  expect(swatchStyle()).not.toContain("rgb(0, 170, 0)");

  await typeHex("#112233");
  expect(hexInput().value).toBe("#112233");
  expect(appliedColor()).toBe("#112233");
});

it("lets a background hex be selected and replaced before the applied color echoes", async () => {
  const commits: string[] = [];
  let value = "#FCFBF8";
  await renderField(value, (hex) => {
    commits.push(hex);
  });

  await typeHex("1");
  expect(hexInput().value).toBe("1");
  expect(commits).toEqual([]);

  await typeHex("112233");
  expect(hexInput().value).toBe("112233");
  expect(commits).toEqual(["#112233"]);

  value = "#112233";
  await renderField(value, (hex) => {
    commits.push(hex);
  });
  expect(hexInput().value).toBe("112233");

  await typeHex("#00aa00");
  expect(hexInput().value).toBe("#00aa00");
  expect(commits).toEqual(["#112233", "#00aa00"]);
});

it("shows an externally applied background instead of an in-progress draft", async () => {
  const commits: string[] = [];
  await renderField("#FCFBF8", (hex) => commits.push(hex));
  await typeHex("#FC");
  expect(hexInput().value).toBe("#FC");

  await renderField("#00aa00", (hex) => commits.push(hex));
  expect(hexInput().value).toBe("#00aa00");
  expect(commits).toEqual([]);
});

it("restores the applied background when an unfinished edit is left", async () => {
  const commits: string[] = [];
  await renderField("#FCFBF8", (hex) => commits.push(hex));

  await typeHex("#FCF");
  await act(async () => {
    hexInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(hexInput().value).toBe("#FCFBF8");
  expect(commits).toEqual([]);

  await typeHex("#112233");
  await act(async () => {
    hexInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(hexInput().value).toBe("#112233");
  expect(commits).toEqual(["#112233"]);
});
