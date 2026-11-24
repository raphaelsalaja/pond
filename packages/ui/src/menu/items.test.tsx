import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MenuItemSpec, renderMenuSpec } from "./items";

function Part({ children }: { children?: ReactNode }) {
  return <span>{children}</span>;
}

function ItemIcon({ children }: { children?: ReactNode }) {
  return <span data-slot="icon">{children}</span>;
}

function ItemLabel({ children }: { children?: ReactNode }) {
  return <span data-slot="label">{children}</span>;
}

function CheckboxItemIndicator({
  variant,
}: {
  children?: ReactNode;
  variant?: "checkbox" | "check";
}) {
  return <span data-indicator={variant ?? "checkbox"} />;
}

const parts = {
  Item: Part,
  ItemIcon,
  ItemLabel,
  ItemKeyboard: Part,
  CheckboxItem: Part,
  CheckboxItemIndicator,
  RadioGroup: Part,
  RadioItem: Part,
  RadioItemIndicator: () => <span data-indicator="radio" />,
  LinkItem: Part,
  Separator: () => <hr />,
  Group: Part,
  GroupLabel: Part,
  SubmenuRoot: Part,
  SubmenuTrigger: Part,
  Portal: Part,
  Positioner: Part,
  Popup: Part,
};

function renderCheckbox(indicator?: "checkbox" | "check") {
  const item: MenuItemSpec = {
    type: "checkbox",
    label: "Grayscale",
    icon: "contrast",
    checked: true,
    indicator,
  };
  return renderToStaticMarkup(renderMenuSpec([item], parts));
}

describe("menu item specs", () => {
  it("renders submenu ancestry inline with a search result", () => {
    const item: MenuItemSpec = {
      label: "Export Converted Files",
      breadcrumb: ["Export"],
    };
    const markup = renderToStaticMarkup(renderMenuSpec([item], parts));

    expect(markup).toContain('data-menu-breadcrumb=""');
    expect(markup).toContain("Export");
    expect(markup).toContain('data-menu-breadcrumb-current=""');
    expect(markup).toContain("Export Converted Files");
  });

  it("uses a trailing checkmark for selected menu items by default", () => {
    const markup = renderCheckbox();

    expect(markup).toContain('data-indicator="check"');
    expect(markup.indexOf('data-slot="icon"')).toBeLessThan(
      markup.indexOf('data-slot="label"'),
    );
    expect(markup.indexOf('data-slot="label"')).toBeLessThan(
      markup.indexOf('data-indicator="check"'),
    );
  });

  it("supports an explicit leading checkbox", () => {
    const markup = renderCheckbox("checkbox");

    expect(markup).toContain('data-indicator="checkbox"');
    expect(markup.indexOf('data-indicator="checkbox"')).toBeLessThan(
      markup.indexOf('data-slot="icon"'),
    );
  });
});
