import { Settings } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { SectionConfig } from "@/features/settings/lib/engine-types";
import { SettingsSectionView } from ".";

it("dims a row and disables its control while its disabled predicate holds", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const config: SectionConfig = {
    useBinding: () => ({
      values: { master: false, child: true },
      patch: () => {},
      loaded: true,
    }),
    groups: [
      {
        items: [
          { control: "switch", key: "master", title: "Master" },
          {
            control: "switch",
            key: "child",
            title: "Child",
            disabled: (values) => values.master !== true,
          },
          {
            control: "custom",
            key: "custom-child",
            title: "Custom Child",
            disabled: (values) => values.master !== true,
            render: () => <span>Custom</span>,
          },
        ],
      },
    ],
  };

  try {
    await act(async () => {
      root.render(<SettingsSectionView config={config} sectionId="test" />);
    });

    const master = host.querySelector("#setting-test-master");
    const child = host.querySelector("#setting-test-child");
    const customChild = host.querySelector("#setting-test-custom-child");

    expect(master?.hasAttribute("data-disabled")).toBe(false);
    expect(child?.getAttribute("data-disabled")).toBe("true");
    expect(customChild?.getAttribute("data-disabled")).toBe("true");
    expect(
      child?.querySelector("[role='switch']")?.hasAttribute("data-disabled"),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("renders standalone custom surfaces beside row lists instead of nesting them", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const config: SectionConfig = {
    groups: [
      {
        title: "Example",
        items: [
          {
            control: "switch",
            key: "before",
            title: "Before",
          },
          {
            control: "custom",
            key: "standalone",
            title: "Standalone",
            standalone: true,
            render: () => (
              <Settings.List data-testid="standalone-list">
                <Settings.Item>Nested setting</Settings.Item>
              </Settings.List>
            ),
          },
          {
            control: "switch",
            key: "after",
            title: "After",
          },
        ],
      },
    ],
  };

  try {
    await act(async () => {
      root.render(<SettingsSectionView config={config} sectionId="test" />);
    });

    const before = host.querySelector("#setting-test-before");
    const after = host.querySelector("#setting-test-after");
    const standalone = host.querySelector('[data-testid="standalone-list"]');
    const standaloneAnchor = host.querySelector("#setting-test-standalone");

    expect(before?.parentElement).not.toBe(after?.parentElement);
    expect(standalone?.parentElement).toBe(standaloneAnchor);
    expect(standaloneAnchor?.parentElement).toBe(
      before?.parentElement?.parentElement,
    );
    expect(standaloneAnchor?.parentElement).toBe(
      after?.parentElement?.parentElement,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
