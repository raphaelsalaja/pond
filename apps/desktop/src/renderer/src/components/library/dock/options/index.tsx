import { TrayCard } from "@pond/ui";
import { AskHistorySection } from "@/components/ask/bar/lib/history";
import { AnalyticsDuplicateSection } from "@/components/library/dock/analytics/duplicate";
import { AnalyticsRangeSection } from "@/components/library/dock/analytics/range";
import { AnalyticsRenameSection } from "@/components/library/dock/analytics/rename";
import { ConfirmSection } from "@/components/library/dock/confirm";
import { ConnectSourceSection } from "@/components/library/dock/connect";
import { ConnectHelpSection } from "@/components/library/dock/connect/help";
import { ConnectWaitSection } from "@/components/library/dock/connect/wait";
import { AccountDetailSection } from "@/components/library/dock/detail";
import { AccountMaintenanceSection } from "@/components/library/dock/detail/account-maintenance";
import { AccountProfileSection } from "@/components/library/dock/detail/account-profile";
import { AccountSyncSection } from "@/components/library/dock/detail/account-sync";
import { FrequencySection } from "@/components/library/dock/detail/frequency";
import { WatchDetailSection } from "@/components/library/dock/detail/watch";
import type { ViewMenuSection } from "@/components/library/dock/lib/types";
import { SelectionCopySection } from "@/components/library/dock/selection/copy";
import { SelectionExportSection } from "@/components/library/dock/selection/export";
import { SelectionRunSection } from "@/components/library/dock/selection/run";
import { SelectionTagSection } from "@/components/library/dock/selection/tag";
import { SourceNewSection } from "@/components/library/dock/source-new";
import { WatchSourceSection } from "@/components/library/dock/watch";
import { WatchHelpSection } from "@/components/library/dock/watch/help";
import { WatchKindSection } from "@/components/library/dock/watch/kind";
import { WatchTargetSection } from "@/components/library/dock/watch/target";
import { DisplaySection } from "@/components/library/view-menu/display";
import { LayoutSection } from "@/components/library/view-menu/layout";
import {
  SortGroupSection,
  SortSection,
} from "@/components/library/view-menu/sort";
import { ZoomSection } from "@/components/library/view-menu/zoom";
import { SearchHelpSection } from "@/components/search/bar/lib/help";
import styles from "./styles.module.css";

const SECTIONS: Record<ViewMenuSection, () => React.JSX.Element | null> = {
  "ask-history": AskHistorySection,
  layout: LayoutSection,
  zoom: ZoomSection,
  sort: SortSection,
  "sort-date": () => <SortGroupSection group="date" />,
  "sort-content": () => <SortGroupSection group="content" />,
  "sort-file": () => <SortGroupSection group="file" />,
  display: DisplaySection,
  "search-help": SearchHelpSection,
  "connect-source": ConnectSourceSection,
  "connect-help": ConnectHelpSection,
  "connect-wait": ConnectWaitSection,
  "watch-source": WatchSourceSection,
  "watch-help": WatchHelpSection,
  "watch-kind": WatchKindSection,
  "watch-target": WatchTargetSection,
  "account-detail": AccountDetailSection,
  "account-profile": AccountProfileSection,
  "account-sync": AccountSyncSection,
  "account-maintenance": AccountMaintenanceSection,
  "watch-detail": WatchDetailSection,
  "sync-frequency": FrequencySection,
  "source-new": SourceNewSection,
  "analytics-range": AnalyticsRangeSection,
  "analytics-rename": AnalyticsRenameSection,
  "analytics-duplicate": AnalyticsDuplicateSection,
  confirm: ConfirmSection,
  "selection-run": SelectionRunSection,
  "selection-tag": SelectionTagSection,
  "selection-copy": SelectionCopySection,
  "selection-export": SelectionExportSection,
};

export function OptionsContent({ section }: { section: ViewMenuSection }) {
  const Section = SECTIONS[section];
  return (
    /** The dock's AnimatePresence and the pill's `layout` own the morph, so this is just the card content. */
    <TrayCard.Root className={styles.card} data-section={section}>
      <Section />
    </TrayCard.Root>
  );
}
