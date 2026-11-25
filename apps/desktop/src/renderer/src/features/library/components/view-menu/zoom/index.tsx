import { Select } from "@pond/ui";
import { useView } from "@/features/library/hooks/use-view";
import { nearestZoomIndex, ZOOM_STEPS } from "@/features/library/lib/zoom";
import { ViewMenuRow } from "../row";

const options = [...ZOOM_STEPS];

export function ZoomSection() {
  const { state, actions } = useView();
  const selected = ZOOM_STEPS[nearestZoomIndex(state.zoom)];

  return (
    <Select.Root
      items={options}
      value={selected?.value}
      onValueChange={(value) => {
        if (value !== null) actions.setZoom(value);
      }}
    >
      <ViewMenuRow.Root>
        <Select.Label className={ViewMenuRow.Label}>
          Thumbnail Size
        </Select.Label>
        <Select.Trigger size="sm" className={ViewMenuRow.Select}>
          <Select.Value />
        </Select.Trigger>
      </ViewMenuRow.Root>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={6}>
          <Select.Popup>
            <Select.Items items={options} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
