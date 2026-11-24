import { Select } from "@pond/ui";
import { FISH_SCOPE_CAP } from "@shared/fish-contracts";
import styles from "./styles.module.css";

interface MultiProps {
  label: string;
  empty: string;
  value: string[];
  items: { value: string; label: string }[];
  onChange: (value: string[]) => void;
}

function Multi({ label, empty, value, items, onChange }: MultiProps) {
  const labels = new Map(items.map((item) => [item.value, item.label]));
  return (
    <Select.Root
      multiple
      value={value}
      items={items}
      disabled={!items.length}
      onValueChange={(next) => onChange(next.slice(0, FISH_SCOPE_CAP))}
    >
      <div className={styles.field}>
        <Select.Label>{label}</Select.Label>
        <Select.Trigger width="full">
          <Select.Value>
            {(selected: string[]) =>
              selected.length === 0
                ? empty
                : selected.length === 1
                  ? (labels.get(selected[0] ?? "") ?? selected[0])
                  : `${selected.length} ${label}`
            }
          </Select.Value>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export const FishSelect = { Multi };
