import {
  IconClockFill18 as Clock,
  IconClockRotateClockwiseFill18 as History,
  IconKeyFill18 as Key,
} from "@pond/icons/fill/18";
import { IconChevronRightOutline18 as ChevronRight } from "@pond/icons/outline/18";
import { TrayCard } from "@pond/ui";
import { openFrequencyPage } from "@/components/library/dock/detail/frequency";
import { useDock } from "@/components/library/dock/lib/context";
import {
  cardModel,
  describeRun,
  formatClock,
} from "@/components/library/sources/sync-monitor/lib/helpers";
import { type AccountRow, useAccounts } from "@/hooks/use-accounts";
import { useSyncHistory } from "@/hooks/use-sync-history";
import { useDetailAccountId } from "@/stores/source-detail";
import { useSyncByAccount } from "@/stores/sync-monitor";
import styles from "./account-detail.module.css";
import { useFrequencyRow } from "./frequency-row";

export function AccountSyncSection() {
  const { accounts } = useAccounts();
  const accountId = useDetailAccountId();
  const account = accounts.find((row) => row.id === accountId) ?? accounts[0];

  if (!account) return <TrayCard.Close />;
  return <AccountSync account={account} />;
}

function AccountSync({ account }: { account: AccountRow }) {
  const dock = useDock();
  const byAccount = useSyncByAccount();
  const frequency = useFrequencyRow();
  const { runs } = useSyncHistory(account.source, 1, account.id);

  const model = cardModel(byAccount[account.id]);
  const last = runs[0];

  return (
    <>
      <TrayCard.Header>
        <TrayCard.Back onClick={() => dock.openViewMenu("account-detail")} />
        <TrayCard.Title position="center">Sync Details</TrayCard.Title>
        <TrayCard.Separator />
        <TrayCard.Description>
          Review this account’s connection and sync schedule.
        </TrayCard.Description>
      </TrayCard.Header>
      <div className={styles.rows}>
        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          title="Applies to all accounts"
          onClick={() => openFrequencyPage("account-sync")}
        >
          <span className={styles["row-icon"]}>
            <Clock size={18} />
          </span>
          <span className={styles["row-label"]}>Sync Frequency</span>
          <span className={styles["row-value"]}>
            {frequency.label}
            <ChevronRight width={13} height={13} />
          </span>
        </button>
        <div className={styles.row}>
          <span className={styles["row-icon"]}>
            <Key size={18} />
          </span>
          <span className={styles["row-label"]}>Session</span>
          <span className={styles["row-value"]} data-tone={model.tone}>
            {model.connected
              ? model.tone === "paused"
                ? "Sign-in required"
                : "Healthy"
              : "Not connected"}
          </span>
        </div>
        {last ? (
          <div className={styles.row} title={describeRun(last)}>
            <span className={styles["row-icon"]}>
              <History size={18} />
            </span>
            <span className={styles["row-label"]}>Last Run</span>
            <span className={styles["row-value"]}>{formatClock(last.ts)}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
