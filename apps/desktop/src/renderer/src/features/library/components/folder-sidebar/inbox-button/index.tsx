import { IconInbox } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import { selectLibraryNav } from "../navigation";
import styles from "./styles.module.css";

export function InboxButton({ active }: { active: boolean }) {
  const counts = useSidebarCounts();
  const count = counts.inbox;
  return (
    <Tooltip label="Inbox" side="bottom">
      <Button
        icon={!count}
        size="sm"
        variant="ghost"
        aria-label={count ? `Inbox, ${count}` : "Inbox"}
        aria-current={active ? "page" : undefined}
        data-pressed={active || undefined}
        onClick={() => selectLibraryNav({ kind: "inbox" })}
      >
        <IconInbox />
        {count ? <span className={styles.count}>{count}</span> : null}
      </Button>
    </Tooltip>
  );
}
