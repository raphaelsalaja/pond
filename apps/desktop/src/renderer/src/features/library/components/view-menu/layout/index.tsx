import { Select } from "@pond/ui";
import { useView } from "@/features/library/hooks/use-view";
import type { LayoutValue } from "@/features/library/lib/view-prefs";
import { ViewMenuRow } from "../row";

const OPTIONS: Array<{ value: LayoutValue; label: string }> = [
  { value: "waterfall", label: "Waterfall" },
  { value: "grid", label: "Grid" },
  { value: "justified", label: "Justified" },
  { value: "list", label: "List" },
];

export function LayoutSection() {
  const { state, actions } = useView();

  return (
    <Select.Root
      items={OPTIONS}
      value={state.layout}
      onValueChange={(value) => {
        if (value !== null) actions.setLayout(value);
      }}
    >
      <ViewMenuRow.Root>
        <Select.Label className={ViewMenuRow.Label}>Layout</Select.Label>
        <Select.Trigger size="sm" className={ViewMenuRow.Select}>
          <Select.Value />
        </Select.Trigger>
      </ViewMenuRow.Root>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={6}>
          <Select.Popup>
            <Select.Items items={OPTIONS} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
