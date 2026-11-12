import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BlurHash } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("BlurHash", () => {
  it("renders an aria-hidden canvas for the stored hash", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<BlurHash hash="LEHV6nWB2yk8pyo0adR*.7kCMdnj" />);
    });

    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("width")).toBe("16");
    expect(canvas?.getAttribute("height")).toBe("16");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
  });
});
