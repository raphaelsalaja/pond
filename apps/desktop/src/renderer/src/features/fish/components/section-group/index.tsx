import { IconDots } from "@pond/icons";
import { Menu, Sidebar } from "@pond/ui";
import type { FishSection } from "@shared/fish-contracts";
import type { ReactNode } from "react";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { fishSectionItems } from "../../lib/menu";
import { Shelf } from "../sortable";
import styles from "./styles.module.css";

export function SectionGroup({
  section,
  empty,
  children,
}: {
  section: FishSection;
  empty: boolean;
  children: ReactNode;
}) {
  const items = () => fishSectionItems(section);

  return (
    <Shelf id={section.id} className={styles.group} aria-label={section.name}>
      <SpecContextMenu buildItems={items}>
        <Sidebar.GroupHeader className={styles.header}>
          <Sidebar.GroupLabel>{section.name}</Sidebar.GroupLabel>
          <SpecMenu align="end" buildItems={items}>
            <Menu.Trigger
              icon
              size="xs"
              variant="ghost"
              className={styles.more}
              aria-label={`More Actions for ${section.name}`}
            >
              <IconDots size={12} />
            </Menu.Trigger>
          </SpecMenu>
        </Sidebar.GroupHeader>
      </SpecContextMenu>
      {children}
      {empty ? <Sidebar.Empty>Drag a fish here</Sidebar.Empty> : null}
    </Shelf>
  );
}
