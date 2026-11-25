import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useRetainedDialogPayload } from "./use-retained-dialog-payload";

function Harness({ active }: { active: { label: string } | null }) {
  const presentation = useRetainedDialogPayload(active);
  return (
    <output data-open={presentation.open}>
      {presentation.payload?.label ?? "empty"}
    </output>
  );
}

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

it("retains the last payload while reporting the dialog closed", async () => {
  await act(async () => root.render(<Harness active={{ label: "First" }} />));
  await act(async () => root.render(<Harness active={null} />));
  expect(host.textContent).toBe("First");
  expect(host.querySelector("output")?.getAttribute("data-open")).toBe("false");
  await act(async () => root.render(<Harness active={{ label: "Second" }} />));
  expect(host.textContent).toBe("Second");
  expect(host.querySelector("output")?.getAttribute("data-open")).toBe("true");
});
