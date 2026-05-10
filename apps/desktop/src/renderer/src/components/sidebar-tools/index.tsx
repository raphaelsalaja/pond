import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
  IconClockRotateAnticlockwiseOutline18,
} from "@pond/icons/outline";
import { Menu, Tooltip } from "@pond/ui";
import { useNavigate } from "react-router-dom";
import { useRecents } from "@/components/recents";
import { Sidebar } from "@/components/sidebar";
import { pool } from "@/pool/pool";
import styles from "./styles.module.css";

/**
 * Single-component toolbar that owns every navigation control we
 * surface in the sidebar header: browser back / forward, plus the
 * Linear-style recents popover. Mounted inside `<Sidebar.Toolbar>` —
 * one import per consumer (library sidebar, settings rail).
 *
 * Back / forward share their target with `effects/history-hotkey.tsx`
 * (`Cmd+[` / `Cmd+]`); both call into the same `navigate(±1)` so the
 * keyboard and click paths can't diverge.
 */
export function SidebarTools() {
  const navigate = useNavigate();
  const recents = useRecents();

  const rows = recents.flatMap((entry) => {
    const save = pool.get(entry.saveId);
    return save ? [{ entry, save }] : [];
  });

  return (
    <>
      <Tooltip.Root content="Back" side="bottom">
        <Sidebar.ToolbarButton aria-label="Back" onClick={() => navigate(-1)}>
          <IconChevronLeftOutline18 />
        </Sidebar.ToolbarButton>
      </Tooltip.Root>
      <Tooltip.Root content="Forward" side="bottom">
        <Sidebar.ToolbarButton aria-label="Forward" onClick={() => navigate(1)}>
          <IconChevronRightOutline18 />
        </Sidebar.ToolbarButton>
      </Tooltip.Root>
      <Menu.Root>
        <Tooltip.Root content="Recently viewed" side="bottom">
          <Menu.Trigger
            render={
              <Sidebar.ToolbarButton aria-label="Recently viewed">
                <IconClockRotateAnticlockwiseOutline18 />
              </Sidebar.ToolbarButton>
            }
          />
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
    </>
  );
}
