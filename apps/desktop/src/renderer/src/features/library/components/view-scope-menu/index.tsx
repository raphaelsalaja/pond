import { IconChevronDown } from "@pond/icons";
import { Menu, Tooltip } from "@pond/ui";
import type {
  SearchScope,
  SearchView,
} from "@/features/library/lib/search-view";
import {
  searchAllSaves,
  searchCurrentView,
} from "@/features/library/state/view-store";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import styles from "./styles.module.css";

interface ViewScopeMenuProps {
  view: SearchView;
  name: string;
  scope: SearchScope;
}

export function ViewScopeMenu({ view, name, scope }: ViewScopeMenuProps) {
  const label = scope === "all" ? "All Saves" : name;
  return (
    <SpecMenu
      align="end"
      buildItems={() => [
        {
          type: "checkbox",
          indicator: "check",
          label: name,
          checked: scope === "current",
          onCheckedChange: () => searchCurrentView(),
        },
        {
          type: "checkbox",
          indicator: "check",
          label: "All Saves",
          checked: scope === "all",
          onCheckedChange: () => searchAllSaves(view),
        },
      ]}
    >
      <Tooltip label="Search Scope" side="bottom">
        <Menu.Trigger
          variant="ghost"
          size="sm"
          className={styles.trigger}
          aria-label={`Search Scope: ${label}`}
        >
          <span className={styles.label}>{label}</span>
          <IconChevronDown size={12} />
        </Menu.Trigger>
      </Tooltip>
    </SpecMenu>
  );
}
