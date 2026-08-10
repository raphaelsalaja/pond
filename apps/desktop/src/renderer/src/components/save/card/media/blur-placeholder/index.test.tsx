// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BlurPlaceholder } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("BlurPlaceholder", () => {
  it("requests the indexed 32px derivative eagerly", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <BlurPlaceholder
          src="pond://save-1/cover.jpg?v=abcdef123456"
          loaded={false}
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "pond://save-1/cover.jpg?v=abcdef123456&w=32",
    );
    expect(image?.getAttribute("loading")).toBe("eager");
    expect(image?.getAttribute("aria-hidden")).toBeNull();
    expect(image?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });
});
