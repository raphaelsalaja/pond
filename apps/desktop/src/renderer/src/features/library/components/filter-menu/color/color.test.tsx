import type { Predicate } from "@pond/schema/filters/types";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ColorFilter } from "./";

const ColorOutput = z.object({
  negate: z.boolean().optional(),
  value: z.object({ hex: z.string(), tolerance: z.number() }),
});

function Harness({ initial }: { initial?: Predicate }) {
  const [current, setCurrent] = useState(initial);
  return (
    <>
      <ColorFilter
        current={current}
        onApply={setCurrent}
        onClear={() => setCurrent(undefined)}
      />
      <output>{JSON.stringify(current ?? null)}</output>
    </>
  );
}

describe("color filter", () => {
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

  function button(label: string) {
    const result = [...host.querySelectorAll("button")].find(
      (node) =>
        node.getAttribute("aria-label") === label || node.textContent === label,
    );
    if (!result) throw new Error(`Missing button: ${label}`);
    return result;
  }

  function input(label: string) {
    const result = [...host.querySelectorAll("input")].find((node) => {
      const labelledBy = node.getAttribute("aria-labelledby");
      return (
        node.getAttribute("aria-label") === label ||
        (labelledBy &&
          document.getElementById(labelledBy)?.textContent === label)
      );
    });
    if (!result) throw new Error(`Missing input: ${label}`);
    return result;
  }

  function slider(label: string) {
    const result = [
      ...host.querySelectorAll<HTMLElement>('[role="slider"]'),
    ].find((node) => node.getAttribute("aria-label") === label);
    if (!result) throw new Error(`Missing slider: ${label}`);
    return result;
  }

  function current() {
    const parsed: unknown = JSON.parse(
      host.querySelector("output")?.textContent ?? "null",
    );
    return z.json().parse(parsed);
  }

  function color() {
    return ColorOutput.parse(current());
  }

  it("shows custom controls immediately and keeps them in sync with presets", async () => {
    await act(async () => root.render(<Harness />));
    expect(input("Color Hex").value).toBe("");
    expect(slider("Filter Color hue")).toBeTruthy();
    expect(input("Color Accuracy").disabled).toBe(true);
    expect(current()).toBeNull();
    await act(async () => button("Blue").click());
    expect(button("Blue").getAttribute("aria-pressed")).toBe("true");
    expect(current()).toEqual({
      field: "color",
      operator: "near",
      value: { hex: "#2b76e7", tolerance: 60 },
    });
    expect(input("Color Accuracy").disabled).toBe(false);
    expect(input("Color Hex").value).toBe("#2b76e7");
  });

  it("opens an existing custom color and preserves range and negation when using the hue keyboard control", async () => {
    await act(async () =>
      root.render(
        <Harness
          initial={{
            field: "color",
            operator: "near",
            negate: true,
            value: { hex: "#a044cc", tolerance: 35 },
          }}
        />,
      ),
    );
    expect(input("Color Hex").value).toBe("#a044cc");
    const hue = slider("Filter Color hue");
    expect(hue.getAttribute("aria-orientation")).toBe("vertical");
    await act(async () => {
      hue.focus();
      hue.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(color().value.hex).not.toBe("#a044cc");
    expect(color().value.tolerance).toBe(35);
    expect(color().negate).toBe(true);
    expect(input("Color Hex").value).toBe(color().value.hex);
    await act(async () => {
      input("Color Accuracy").focus();
      input("Color Accuracy").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(color().value.tolerance).toBe(34);
  });

  it("opens without applying a filter and clears a selected color", async () => {
    await act(async () => root.render(<Harness />));
    expect(input("Color Hex").value).toBe("");
    expect(current()).toBeNull();
    await act(async () => button("Red").click());
    expect(color().value.hex).toBe("#ff2727");
    await act(async () => button("Clear Color Filter").click());
    expect(current()).toBeNull();
    expect(input("Color Hex").value).toBe("");
  });
});
