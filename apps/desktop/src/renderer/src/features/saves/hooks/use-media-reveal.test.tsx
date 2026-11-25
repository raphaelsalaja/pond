import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useMediaReveal } from "./use-media-reveal";

let host: HTMLDivElement;
let root: Root;
const seen: Array<boolean> = [];

function Probe({ ready, source }: { ready: boolean; source: string }) {
  seen.push(useMediaReveal(ready, source));
  return null;
}

beforeEach(() => {
  seen.length = 0;
  host = document.createElement("div");
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

it("holds media until it is ready", async () => {
  await act(async () => root.render(<Probe ready={false} source="a.mp4" />));
  expect(seen.at(-1)).toBe(false);

  await act(async () => root.render(<Probe ready source="a.mp4" />));
  expect(seen.at(-1)).toBe(true);
});

it("keeps shown media visible for its source, and hides a new source until ready", async () => {
  await act(async () => root.render(<Probe ready source="a.mp4" />));
  await act(async () => root.render(<Probe ready={false} source="a.mp4" />));
  expect(seen.at(-1)).toBe(true);

  await act(async () => root.render(<Probe ready={false} source="b.mp4" />));
  expect(seen.at(-1)).toBe(false);
});
