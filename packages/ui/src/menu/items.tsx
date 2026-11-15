import { Children, Fragment, isValidElement, type ReactNode } from "react";

type MenuShortcut = string | string[];

interface MenuActionItem {
  type?: "item";
  id?: string;
  label: ReactNode;
  breadcrumb?: ReactNode[];
  icon?: ReactNode;
  variant?: "default" | "destructive";
  shortcut?: MenuShortcut;
  keywords?: string;
  disabled?: boolean;
  hidden?: boolean;
  stale?: boolean;
  closeOnClick?: boolean;
  onClick?: () => void;
}

interface MenuSeparatorItem {
  type: "separator";
}

interface MenuGroupItem {
  type: "group";
  label?: ReactNode;
  hidden?: boolean;
  keywords?: string;
  items: MenuItemSpec[];
}

interface MenuSubmenuItem {
  type: "submenu";
  id?: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  keywords?: string;
  items: MenuItemSpec[];
}

interface MenuCheckboxItem {
  type: "checkbox";
  label: ReactNode;
  breadcrumb?: ReactNode[];
  icon?: ReactNode;
  indicator?: "checkbox" | "check";
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  shortcut?: MenuShortcut;
  keywords?: string;
  disabled?: boolean;
  hidden?: boolean;
  closeOnClick?: boolean;
}

interface MenuLinkItem {
  type: "link";
  label: ReactNode;
  breadcrumb?: ReactNode[];
  href: string;
  icon?: ReactNode;
  shortcut?: MenuShortcut;
  keywords?: string;
  disabled?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}

interface MenuCustomItem {
  type: "custom";
  render: () => ReactNode;
}

export type MenuItemSpec =
  | MenuActionItem
  | MenuSeparatorItem
  | MenuGroupItem
  | MenuSubmenuItem
  | MenuCheckboxItem
  | MenuLinkItem
  | MenuCustomItem;

interface MenuParts {
  Item: React.ComponentType<{
    label?: string;
    disabled?: boolean;
    stale?: boolean;
    variant?: "default" | "destructive";
    closeOnClick?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }>;
  ItemIcon: React.ComponentType<{ children?: ReactNode }>;
  ItemLabel: React.ComponentType<{ children?: ReactNode }>;
  ItemKeyboard: React.ComponentType<{ children?: MenuShortcut }>;
  CheckboxItem: React.ComponentType<{
    label?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    closeOnClick?: boolean;
    children?: ReactNode;
  }>;
  CheckboxItemIndicator: React.ComponentType<{
    children?: ReactNode;
    variant?: "checkbox" | "check";
  }>;
  LinkItem: React.ComponentType<{
    label?: string;
    href?: string;
    disabled?: boolean;
    onClick?: (event: React.MouseEvent) => void;
    children?: ReactNode;
  }>;
  Separator: React.ComponentType;
  Group: React.ComponentType<{ children?: ReactNode }>;
  GroupLabel: React.ComponentType<{ children?: ReactNode }>;
  SubmenuRoot: React.ComponentType<{ children?: ReactNode }>;
  SubmenuTrigger: React.ComponentType<{
    label?: string;
    disabled?: boolean;
    children?: ReactNode;
  }>;
  Portal: React.ComponentType<{ children?: ReactNode }>;
  Positioner: React.ComponentType<{
    children?: ReactNode;
    side?: "top" | "bottom" | "left" | "right" | "inline-start" | "inline-end";
    align?: "start" | "center" | "end";
    sideOffset?: number;
    alignOffset?: number;
  }>;
  Popup: React.ComponentType<{ children?: ReactNode }>;
}

function pruneSpecs(items: MenuItemSpec[]): MenuItemSpec[] {
  const visible = items.filter(
    (spec) =>
      spec.type === "separator" || spec.type === "custom" || !spec.hidden,
  );
  const out: MenuItemSpec[] = [];
  for (const spec of visible) {
    if (spec.type === "separator") {
      if (out.length === 0 || out[out.length - 1]?.type === "separator") {
        continue;
      }
    }
    out.push(spec);
  }
  while (out[out.length - 1]?.type === "separator") out.pop();
  return out;
}

export function menuLabelText(value: ReactNode): string | null {
  const values = Children.toArray(value);
  const text = values.length === 1 ? values[0] : null;
  return text != null && !isValidElement(text) ? String(text) : null;
}

function specKey(spec: MenuItemSpec, index: number): string | number {
  if ("id" in spec && spec.id) return spec.id;
  if (spec.type === "separator") return `sep-${index}`;
  if (!("label" in spec)) return index;

  const label = menuLabelText(spec.label);
  if (label == null) return index;
  if (!("breadcrumb" in spec) || !spec.breadcrumb?.length) return label;

  const breadcrumb = spec.breadcrumb.map(menuLabelText);
  if (breadcrumb.some((segment) => segment == null)) return index;
  return [...breadcrumb, label].join(" › ");
}

/** Base UI filters on the item's `label`, so keywords join the visible text there. */
function filterLabel(
  spec: MenuActionItem | MenuCheckboxItem | MenuLinkItem | MenuSubmenuItem,
): string | undefined {
  if (!spec.keywords) return undefined;
  const label = menuLabelText(spec.label);
  return label == null ? undefined : `${label} ${spec.keywords}`;
}

function renderItemLabel(
  spec: MenuActionItem | MenuCheckboxItem | MenuLinkItem,
  parts: MenuParts,
) {
  if (!spec.breadcrumb?.length) {
    return <parts.ItemLabel>{spec.label}</parts.ItemLabel>;
  }

  const occurrences = new Map<string, number>();
  return (
    <parts.ItemLabel>
      {spec.breadcrumb.map((segment) => {
        const text = menuLabelText(segment) ?? "segment";
        const occurrence = occurrences.get(text) ?? 0;
        occurrences.set(text, occurrence + 1);
        return (
          <Fragment key={`${text}-${occurrence}`}>
            <span data-menu-breadcrumb="">{segment}</span>
            <span aria-hidden data-menu-breadcrumb-separator="">
              ›
            </span>
          </Fragment>
        );
      })}
      <span data-menu-breadcrumb-current="">{spec.label}</span>
    </parts.ItemLabel>
  );
}

function renderSpec(
  spec: MenuItemSpec,
  key: string | number,
  parts: MenuParts,
): ReactNode {
  if (spec.type === "separator") {
    return <parts.Separator key={key} />;
  }

  if (spec.type === "custom") {
    return <Fragment key={key}>{spec.render()}</Fragment>;
  }

  if (spec.type === "group") {
    return (
      <parts.Group key={key}>
        {spec.label != null ? (
          <parts.GroupLabel>{spec.label}</parts.GroupLabel>
        ) : null}
        {pruneSpecs(spec.items).map((child, i) =>
          renderSpec(child, specKey(child, i), parts),
        )}
      </parts.Group>
    );
  }

  if (spec.type === "checkbox") {
    const indicator = spec.indicator ?? "check";
    return (
      <parts.CheckboxItem
        key={key}
        label={filterLabel(spec)}
        checked={spec.checked}
        onCheckedChange={spec.onCheckedChange}
        disabled={spec.disabled}
        closeOnClick={spec.closeOnClick}
      >
        {indicator === "checkbox" ? <parts.CheckboxItemIndicator /> : null}
        {spec.icon != null ? (
          <parts.ItemIcon>{spec.icon}</parts.ItemIcon>
        ) : null}
        {renderItemLabel(spec, parts)}
        {spec.shortcut != null ? (
          <parts.ItemKeyboard>{spec.shortcut}</parts.ItemKeyboard>
        ) : null}
        {indicator === "check" ? (
          <parts.CheckboxItemIndicator variant="check" />
        ) : null}
      </parts.CheckboxItem>
    );
  }

  if (spec.type === "link") {
    const onClick = spec.onClick;
    return (
      <parts.LinkItem
        key={key}
        label={filterLabel(spec)}
        href={spec.href}
        disabled={spec.disabled}
        onClick={
          onClick
            ? (event) => {
                event.preventDefault();
                onClick();
              }
            : undefined
        }
      >
        {spec.icon != null ? (
          <parts.ItemIcon>{spec.icon}</parts.ItemIcon>
        ) : null}
        {renderItemLabel(spec, parts)}
        {spec.shortcut != null ? (
          <parts.ItemKeyboard>{spec.shortcut}</parts.ItemKeyboard>
        ) : null}
      </parts.LinkItem>
    );
  }

  if (spec.type === "submenu") {
    return (
      <parts.SubmenuRoot key={key}>
        <parts.SubmenuTrigger
          label={filterLabel(spec)}
          disabled={spec.disabled}
        >
          {spec.icon != null ? (
            <parts.ItemIcon>{spec.icon}</parts.ItemIcon>
          ) : null}
          <parts.ItemLabel>{spec.label}</parts.ItemLabel>
        </parts.SubmenuTrigger>
        <parts.Portal>
          <parts.Positioner
            side="inline-end"
            align="start"
            sideOffset={-2}
            alignOffset={-4}
          >
            <parts.Popup>
              {pruneSpecs(spec.items).map((child, i) =>
                renderSpec(child, specKey(child, i), parts),
              )}
            </parts.Popup>
          </parts.Positioner>
        </parts.Portal>
      </parts.SubmenuRoot>
    );
  }

  return (
    <parts.Item
      key={key}
      label={filterLabel(spec)}
      disabled={spec.disabled}
      stale={spec.stale}
      variant={spec.variant}
      closeOnClick={spec.closeOnClick}
      onClick={spec.onClick}
    >
      {spec.icon != null ? <parts.ItemIcon>{spec.icon}</parts.ItemIcon> : null}
      {renderItemLabel(spec, parts)}
      {spec.shortcut != null ? (
        <parts.ItemKeyboard>{spec.shortcut}</parts.ItemKeyboard>
      ) : null}
    </parts.Item>
  );
}

export function renderMenuSpec(
  items: MenuItemSpec[],
  parts: MenuParts,
): ReactNode {
  return pruneSpecs(items).map((spec, i) =>
    renderSpec(spec, specKey(spec, i), parts),
  );
}
