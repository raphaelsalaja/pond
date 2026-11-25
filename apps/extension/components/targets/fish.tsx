import { Select } from "@pond/ui/select";
import type { FishTarget } from "@/utils/messaging";

interface FishProps {
  fish: Array<FishTarget>;
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Popups render in the shadow root when the picker lives on a page. */
  container?: HTMLElement | null;
  className?: string;
}

export function Fish({
  fish,
  value,
  onValueChange,
  container,
  className,
}: FishProps) {
  const items = [
    { value: null, label: "Don't Send" },
    ...fish.map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  const name = (id: string | null) =>
    fish.find((entry) => entry.id === id)?.name;

  return (
    <Select.Root<string | null>
      value={value}
      items={items}
      onValueChange={onValueChange}
    >
      <Select.Trigger
        className={className}
        width="full"
        aria-label="Send to Fish"
      >
        <Select.Value>
          {(id: string | null) =>
            name(id) ? `Send to ${name(id)}` : "Send to Fish"
          }
        </Select.Value>
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
