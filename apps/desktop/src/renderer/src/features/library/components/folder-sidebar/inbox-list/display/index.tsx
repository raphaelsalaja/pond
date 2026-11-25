import { IconSliders } from "@pond/icons";
import { INBOX_GROUPINGS, INBOX_ORDERINGS } from "@pond/schema";
import { Button, Popover, Select, Switch, Tooltip } from "@pond/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { inboxPicker } from "@/features/library/state/inbox-review";
import type { InboxScope } from "@/features/library/state/inbox-review";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const LABEL = "Display Options";

type Ordering = (typeof INBOX_ORDERINGS)[number];

const ORDERING_LABELS = {
  newest: "Newest",
  priority: "Priority",
} satisfies Record<Ordering, string>;

const ORDERINGS = INBOX_ORDERINGS.map((value) => ({
  value,
  label: ORDERING_LABELS[value],
}));

const GROUPING_LABELS = {
  none: "None",
  type: "Type",
  source: "Source",
  date: "Date",
} satisfies Record<(typeof INBOX_GROUPINGS)[number], string>;

const GROUPINGS = INBOX_GROUPINGS.map((value) => ({
  value,
  label: GROUPING_LABELS[value],
}));

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className={styles.row} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}

function SelectRow<T extends string>({
  label,
  items,
  value,
  onValueChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onValueChange: (value: T) => void;
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next);
        if (match) onValueChange(match.value);
      }}
    >
      <div className={styles.row}>
        <Select.Label className={styles.label}>{label}</Select.Label>
        <Select.Trigger size="sm" className={styles.select}>
          <Select.Value />
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={6}>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}

function showSnoozed(on: boolean): void {
  inboxPicker.select(null);
  selectLibraryNav(on ? { kind: "inbox", snoozed: true } : { kind: "inbox" });
}

export function InboxDisplayMenu({ scope }: { scope: InboxScope }) {
  const [display, patch] = usePrefs("inboxDisplay");

  return (
    <Popover.Root>
      <Tooltip label={LABEL} side="bottom">
        <Button
          render={<Popover.Trigger />}
          icon
          size="sm"
          variant="ghost"
          aria-label={LABEL}
        >
          <IconSliders size={12} />
        </Button>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className={styles.popup} aria-label={LABEL}>
            <Section>
              <SelectRow
                label="Ordering"
                items={ORDERINGS}
                value={display.ordering}
                onValueChange={(ordering) => void patch({ ordering })}
              />
              <SelectRow
                label="Group By"
                items={GROUPINGS}
                value={display.groupBy}
                onValueChange={(groupBy) => void patch({ groupBy })}
              />
            </Section>
            <Section>
              <SwitchRow
                label="Show Snoozed"
                checked={scope === "snoozed"}
                onCheckedChange={showSnoozed}
              />
              <SwitchRow
                label="Show Unread First"
                checked={display.unreadFirst}
                onCheckedChange={(unreadFirst) => void patch({ unreadFirst })}
              />
            </Section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
