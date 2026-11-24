import { Fragment, type ReactNode } from "react";

interface SelectOptionItem<Value> {
  type?: "option";
  value: Value;
  label: ReactNode;
  shortcut?: ReactNode;
  disabled?: boolean;
}

interface SelectSeparatorItem {
  type: "separator";
}

interface SelectGroupItem<Value> {
  type: "group";
  label?: ReactNode;
  items: SelectItemSpec<Value>[];
}

interface SelectCustomItem {
  type: "custom";
  render: () => ReactNode;
}

export type SelectItemSpec<Value = unknown> =
  | SelectOptionItem<Value>
  | SelectSeparatorItem
  | SelectGroupItem<Value>
  | SelectCustomItem;

interface SelectParts<Value> {
  Item: React.ComponentType<{
    value: Value;
    disabled?: boolean;
    children?: ReactNode;
  }>;
  ItemText: React.ComponentType<{ children?: ReactNode }>;
  ItemIndicator: React.ComponentType;
  ItemShortcut: React.ComponentType<{ children?: ReactNode }>;
  Group: React.ComponentType<{ children?: ReactNode }>;
  GroupLabel: React.ComponentType<{ children?: ReactNode }>;
  Separator: React.ComponentType;
}

function renderSpec<Value>(
  spec: SelectItemSpec<Value>,
  key: number,
  parts: SelectParts<Value>,
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
        {spec.items.map((child, i) => renderSpec(child, i, parts))}
      </parts.Group>
    );
  }

  return (
    <parts.Item key={key} value={spec.value} disabled={spec.disabled}>
      <parts.ItemText>{spec.label}</parts.ItemText>
      <parts.ItemIndicator />
      {spec.shortcut != null ? (
        <parts.ItemShortcut>{spec.shortcut}</parts.ItemShortcut>
      ) : null}
    </parts.Item>
  );
}

export function renderSelectSpec<Value>(
  items: SelectItemSpec<Value>[],
  parts: SelectParts<Value>,
): ReactNode {
  return items.map((spec, i) => renderSpec(spec, i, parts));
}
