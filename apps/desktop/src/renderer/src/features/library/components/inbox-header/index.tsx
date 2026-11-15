import { Tabs } from "@pond/ui";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { formatNumber } from "@/shared/lib/format";
import styles from "./styles.module.css";

type InboxView = "review" | "snoozed";

export function InboxHeader({ snoozed }: { snoozed: boolean }) {
  const counts = useSidebarCounts();
  return (
    <Tabs.Root
      className={styles.header}
      value={snoozed ? "snoozed" : "review"}
      onValueChange={(view: InboxView) =>
        libraryChrome.setNav(
          view === "snoozed"
            ? { kind: "inbox", snoozed: true }
            : { kind: "inbox" },
        )
      }
    >
      <Tabs.List aria-label="Inbox Views">
        <Tabs.Tab value="review">
          Needs Review
          <span className={styles.count}>{formatNumber(counts.inbox)}</span>
        </Tabs.Tab>
        <Tabs.Tab value="snoozed">
          Snoozed
          <span className={styles.count}>
            {formatNumber(counts.inboxSnoozed)}
          </span>
        </Tabs.Tab>
      </Tabs.List>
    </Tabs.Root>
  );
}
