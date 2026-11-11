import { Select } from "@pond/ui";
import type { RuleChoice } from "../types";
import styles from "./styles.module.css";

function choiceText(choice: RuleChoice): string {
  return choice.crumb ? `${choice.crumb} › ${choice.label}` : choice.label;
}

interface SingleProps<T extends string> {
  value: T;
  items: readonly { value: T; label: string }[];
  label: string;
  width?: "content";
  onChange: (value: T) => void;
}

function Single<T extends string>({
  value,
  items,
  label,
  width,
  onChange,
}: SingleProps<T>) {
  return (
    <Select.Root
      value={value}
      items={items}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <Select.Trigger
        className={styles.trigger}
        width={width === "content" ? "auto" : "full"}
        size="sm"
        aria-label={label}
      >
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={[...items]} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

interface MultipleProps {
  value: string[];
  items: readonly RuleChoice[];
  label: string;
  placeholder: string;
  onChange: (value: string[]) => void;
}

function Multiple({
  value,
  items,
  label,
  placeholder,
  onChange,
}: MultipleProps) {
  return (
    <Select.Root
      multiple
      value={value}
      items={items.map((item) => ({
        value: item.value,
        label: choiceText(item),
      }))}
      onValueChange={onChange}
    >
      <Select.Trigger size="sm" className={styles.trigger} aria-label={label}>
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.List>
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  label={choiceText(item)}
                >
                  <Select.ItemText title={choiceText(item)}>
                    {item.crumb ? (
                      <>
                        <span data-menu-breadcrumb="">{item.crumb}</span>
                        <span aria-hidden data-menu-breadcrumb-separator="">
                          ›
                        </span>
                        <span data-menu-breadcrumb-current="">
                          {item.label}
                        </span>
                      </>
                    ) : (
                      item.label
                    )}
                  </Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export const RuleSelect = { Multiple, Single };
