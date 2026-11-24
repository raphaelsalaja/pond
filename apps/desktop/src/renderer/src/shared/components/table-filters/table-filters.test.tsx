import { Tooltip } from "@pond/ui";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TableFilterBar, TableFilterChip, TableFilterToggle } from "./index";

function Harness() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  return (
    <Tooltip.Provider>
      <TableFilterToggle
        open={open}
        active={selected.size > 0}
        controlsId="table-filters"
        onToggle={() => setOpen((current) => !current)}
      />
      <TableFilterBar open={open} id="table-filters" label="Table Filters">
        <TableFilterChip
          name="Status"
          icon={null}
          options={[
            { id: "failed", label: "Failed" },
            { id: "complete", label: "Completed" },
          ]}
          selected={selected}
          onChange={setSelected}
        />
      </TableFilterBar>
    </Tooltip.Provider>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const match = [...document.querySelectorAll("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  );
  if (!match) {
    throw new Error(`Missing button ${label}`);
  }
  return match;
}

it("reveals chips and keeps a chosen filter after the menu closes", async () => {
  await act(async () => root.render(<Harness />));
  expect(document.getElementById("table-filters")).toBeNull();
  await act(async () => button("Filter").click());
  expect(document.getElementById("table-filters")).not.toBeNull();
  expect(button("Status").getAttribute("data-variant")).toBe("ghost");
  await act(async () => button("Status").click());
  const failed = [
    ...document.querySelectorAll('[role="menuitemcheckbox"]'),
  ].find((node) => node.textContent === "Failed");
  if (!failed) {
    throw new Error("Missing Failed option");
  }
  await act(async () =>
    failed.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(button("Status: Failed").textContent).toBe("Failed");
  await act(async () => button("Filter").click());
  expect(button("Filter").getAttribute("aria-expanded")).toBe("false");
  expect(button("Filter").hasAttribute("data-pressed")).toBe(true);
});
