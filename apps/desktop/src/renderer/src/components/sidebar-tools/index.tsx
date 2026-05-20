import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
  IconClockRotateAnticlockwiseOutline18,
} from "@pond/icons/outline/18";
import { Button, Menu, Tooltip } from "@pond/ui";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useRecents } from "@/components/recents";
import { pool } from "@/pool/pool";
import styles from "./styles.module.css";

export function SidebarTools() {
  const navigate = useNavigate();
  const recents = useRecents();

  const rows = recents.flatMap((entry) => {
    const save = pool.get(entry.saveId);
    return save ? [{ entry, save }] : [];
  });

  return (
    <React.Fragment>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              icon
              aria-label="Back"
              onClick={() => navigate(-1)}
            >
              <IconChevronLeftOutline18 />
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner side="bottom">
            <Tooltip.Popup>Back</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              icon
              aria-label="Forward"
              onClick={() => navigate(1)}
            >
              <IconChevronRightOutline18 />
            </Button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner side="bottom">
            <Tooltip.Popup>Forward</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Menu.Root>
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Menu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    aria-label="Recently Viewed"
                  >
                    <IconClockRotateAnticlockwiseOutline18 />
                  </Button>
                }
              />
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom">
              <Tooltip.Popup>Recently viewed</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="start" sideOffset={6}>
            <Menu.Popup className={styles.popup}>
              <Menu.Group>
                <Menu.GroupLabel>Recently viewed</Menu.GroupLabel>
                {rows.length === 0 ? (
                  <div className={styles.empty}>Nothing yet</div>
                ) : (
                  rows.map(({ entry, save }) => (
                    <Menu.Item
                      key={entry.saveId}
                      className={styles.row}
                      onClick={() => navigate(`/save/${entry.saveId}`)}
                    >
                      <Menu.ItemLabel>
                        {save.title?.trim() || save.url || "Untitled save"}
                      </Menu.ItemLabel>
                      {save.source ? (
                        <span className={styles["row-source"]}>
                          {save.source}
                        </span>
                      ) : null}
                    </Menu.Item>
                  ))
                )}
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </React.Fragment>
  );
}
