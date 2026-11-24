import { Tooltip } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { FieldItem } from "@/features/settings/lib/engine-types";
import { ItemView } from "./";

it("associates setting titles and descriptions with controls rather than their values", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const fields: Array<FieldItem> = [
    {
      key: "startup",
      title: "Startup behavior",
      description: "Choose the initial screen",
      control: "select",
      options: [{ value: "last", label: "Last screen" }],
    },
    {
      key: "parallel",
      title: "Parallel downloads",
      description: "Maximum active downloads",
      control: "number",
      min: 1,
      max: 10,
    },
    {
      key: "enabled",
      title: "Show navigator",
      description: "Show image overview",
      control: "switch",
    },
    {
      key: "size",
      title: "Thumbnail size",
      description: "Size in pixels",
      control: "range",
      min: 1,
      max: 10,
    },
  ];
  try {
    await act(async () =>
      root.render(
        fields.map((item) => (
          <div key={item.key} data-setting={item.key}>
            <ItemView
              item={item}
              binding={{
                loaded: true,
                values: {
                  startup: "last",
                  parallel: 3,
                  enabled: true,
                  size: 4,
                },
                patch() {},
              }}
            />
          </div>
        )),
      ),
    );
    for (const field of fields) {
      const container = host.querySelector(`[data-setting="${field.key}"]`);
      const controls = container?.querySelectorAll("[aria-labelledby]");
      expect(controls?.length).toBeGreaterThan(0);
      for (const control of controls ?? []) {
        expect(
          document.getElementById(control.getAttribute("aria-labelledby") ?? "")
            ?.textContent,
        ).toBe(field.title);
        expect(
          document.getElementById(
            control.getAttribute("aria-describedby") ?? "",
          )?.textContent,
        ).toBe(field.description);
      }
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("shows an info button when a setting keeps a second fact in a tooltip", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const item: FieldItem = {
    key: "retina",
    title: "Full Resolution",
    description: "Saves every pixel on a high-density display.",
    tooltip: "The page can look smaller than the saved image.",
    control: "switch",
  };
  try {
    await act(async () =>
      root.render(
        <Tooltip.Provider>
          <ItemView
            item={item}
            binding={{ loaded: true, values: { retina: true }, patch() {} }}
          />
        </Tooltip.Provider>,
      ),
    );
    expect(
      host.querySelector('[aria-label="About Full Resolution"]'),
    ).toBeTruthy();
    expect(host.textContent).toContain(item.description);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
