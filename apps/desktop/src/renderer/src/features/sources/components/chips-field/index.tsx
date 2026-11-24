import { Combobox } from "@pond/ui";
import styles from "./styles.module.css";

export function ChipsField<Value extends string>({
  label,
  placeholder,
  items,
  value,
  labelOf,
  detailOf,
  empty,
  disabled,
  onOpen,
  onValueChange,
}: {
  label: string;
  placeholder: string;
  items: Array<Value>;
  value: Array<Value>;
  labelOf: (value: Value) => string;
  detailOf?: (value: Value) => string | undefined;
  empty: string;
  disabled?: boolean;
  onOpen?: () => void;
  onValueChange: (value: Array<Value>) => void;
}) {
  return (
    <Combobox.Root
      multiple
      items={items}
      value={value}
      disabled={disabled}
      itemToStringLabel={labelOf}
      onOpenChange={(open) => {
        if (open) {
          onOpen?.();
        }
      }}
      onValueChange={onValueChange}
    >
      <Combobox.InputGroup className={styles.chips}>
        <Combobox.Value>
          {(selected: Array<Value>) => (
            <Combobox.Chips>
              {selected.map((item) => (
                <Combobox.Chip key={item} aria-label={labelOf(item)}>
                  {labelOf(item)}
                  <Combobox.ChipRemove aria-label={`Remove ${labelOf(item)}`} />
                </Combobox.Chip>
              ))}
              <Combobox.ChipsInput
                aria-label={label}
                placeholder={selected.length > 0 ? "" : placeholder}
              />
            </Combobox.Chips>
          )}
        </Combobox.Value>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.Empty>{empty}</Combobox.Empty>
            <Combobox.List>
              {(item: Value) => (
                <Combobox.Item key={item} value={item}>
                  <Combobox.ItemLabel>
                    {labelOf(item)}
                    {detailOf?.(item) ? (
                      <Combobox.ItemMeta className={styles.detail}>
                        {detailOf(item)}
                      </Combobox.ItemMeta>
                    ) : null}
                  </Combobox.ItemLabel>
                  <Combobox.ItemEnd>
                    <Combobox.ItemIndicator />
                  </Combobox.ItemEnd>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
