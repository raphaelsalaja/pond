import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Section } from "./index";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Section", () => {
  it("keeps the action mounted when the first item appears", async () => {
    await act(async () => {
      root.render(
        <Section
          title="Tags"
          empty
          action={<button type="button">Add Tag</button>}
        >
          <span>chip</span>
        </Section>,
      );
    });
    const add = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Add Tag",
    );
    expect(add).toBeTruthy();

    await act(async () => {
      root.render(
        <Section
          title="Tags"
          empty={false}
          action={<button type="button">Add Tag</button>}
        >
          <span>chip</span>
        </Section>,
      );
    });

    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "Add Tag",
      ),
    ).toBe(add);
    expect(host.textContent).toContain("chip");
  });
});
