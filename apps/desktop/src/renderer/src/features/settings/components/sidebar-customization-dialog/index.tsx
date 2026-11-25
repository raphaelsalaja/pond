import { isLockedSidebarDestination, SIDEBAR_SECTIONS } from "@pond/schema";
import type { SidebarDestination, SidebarSection } from "@pond/schema";
import { Button, Checkbox, Dialog, Switch } from "@pond/ui";
import { useId } from "react";
import {
  SIDEBAR_DESTINATION_GROUPS,
  SIDEBAR_DESTINATION_LABELS,
  SIDEBAR_SECTION_LABELS,
} from "@/features/settings/lib/sidebar-customization";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function SidebarCustomizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sidebar, patch, loaded] = usePrefs("sidebar");
  const id = useId();

  const setVisible = (destination: SidebarDestination, visible: boolean) =>
    void patch({
      destinations: { ...sidebar.destinations, [destination]: visible },
    });

  const setSectionVisible = (section: SidebarSection, visible: boolean) =>
    void patch({ sections: { ...sidebar.sections, [section]: visible } });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Customize Sidebar</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            <Dialog.Description>
              Drag items in the sidebar to change their order.
            </Dialog.Description>
            {SIDEBAR_DESTINATION_GROUPS.map((group) => (
              <fieldset className={styles.card} key={group.label}>
                <legend className={styles.heading}>{group.label}</legend>
                <div className={styles.grid}>
                  {sidebar.order
                    .filter(
                      (destination) =>
                        group.destinations.some(
                          (item) => item === destination,
                        ) && !isLockedSidebarDestination(destination),
                    )
                    .map((destination) => (
                      <label
                        className={styles.option}
                        htmlFor={`${id}-${destination}`}
                        key={destination}
                      >
                        <Checkbox.Root
                          id={`${id}-${destination}`}
                          size="sm"
                          checked={sidebar.destinations[destination]}
                          disabled={!loaded}
                          onCheckedChange={(visible) =>
                            setVisible(destination, visible)
                          }
                        >
                          <Checkbox.Indicator />
                        </Checkbox.Root>
                        <span>{SIDEBAR_DESTINATION_LABELS[destination]}</span>
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
            <fieldset className={styles.card}>
              <legend className={styles.heading}>Sections</legend>
              <div className={styles.grid}>
                {SIDEBAR_SECTIONS.map((section) => (
                  <label
                    className={styles.option}
                    htmlFor={`${id}-${section}`}
                    key={section}
                  >
                    <Checkbox.Root
                      id={`${id}-${section}`}
                      size="sm"
                      checked={sidebar.sections[section]}
                      disabled={!loaded}
                      onCheckedChange={(visible) =>
                        setSectionVisible(section, visible)
                      }
                    >
                      <Checkbox.Indicator />
                    </Checkbox.Root>
                    <span>{SIDEBAR_SECTION_LABELS[section]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={styles.card} data-row>
              <span className={styles.heading} id={`${id}-count`}>
                Show Count
              </span>
              <Switch.Root
                aria-labelledby={`${id}-count`}
                checked={sidebar.badgeStyle === "count"}
                disabled={!loaded}
                onCheckedChange={(showCount) =>
                  void patch({ badgeStyle: showCount ? "count" : "none" })
                }
              />
            </div>
          </Dialog.Content>
          <Dialog.Footer>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
