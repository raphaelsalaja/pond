import {
  IconDownloadOutline18 as Download,
  IconFileRefreshOutline18 as FileRefresh,
  IconRefreshOutline18 as Refresh,
} from "@pond/icons/outline/18";
import { TrayCard } from "@pond/ui";
import { useDock } from "@/components/library/dock/lib/context";
import { cardModel } from "@/components/library/sources/sync-monitor/lib/helpers";
import { useAccounts } from "@/hooks/use-accounts";
import { useDetailAccountId } from "@/stores/source-detail";
import { useSyncByAccount } from "@/stores/sync-monitor";
import styles from "./account-detail.module.css";

/** Maintenance actions live one level below the account overview. */
export function AccountMaintenanceSection() {
  const dock = useDock();
  const { accounts } = useAccounts();
  const accountId = useDetailAccountId();
  const account = accounts.find((row) => row.id === accountId) ?? accounts[0];
  const byAccount = useSyncByAccount();

  if (!account) return <TrayCard.Close />;

  const model = cardModel(byAccount[account.id]);

  return (
    <>
      <TrayCard.Header>
        <TrayCard.Back onClick={() => dock.openViewMenu("account-detail")} />
        <TrayCard.Title position="center">Maintenance</TrayCard.Title>
        <TrayCard.Separator />
        <TrayCard.Description>
          Re-fetch older items, metadata, or original-quality media.
        </TrayCard.Description>
      </TrayCard.Header>
      <div className={styles.rows}>
        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          disabled={!(model.connected && model.tone !== "run")}
          onClick={() =>
            void window.pond.syncRunNow(account.id, { forceFull: true })
          }
        >
          <span className={styles["row-icon"]}>
            <Refresh size={18} />
          </span>
          <span className={styles["row-label"]}>Backfill</span>
        </button>
        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          disabled={!model.connected}
          onClick={() =>
            void window.pond.refreshBackfillStart({ source: account.source })
          }
        >
          <span className={styles["row-icon"]}>
            <FileRefresh size={18} />
          </span>
          <span className={styles["row-label"]}>Refresh Metadata</span>
        </button>
        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          disabled={!model.connected}
          onClick={() =>
            void window.pond.refreshBackfillStart({
              source: account.source,
              overwrite: true,
            })
          }
        >
          <span className={styles["row-icon"]}>
            <Download size={18} />
          </span>
          <span className={styles["row-label"]}>Download Full Quality</span>
        </button>
      </div>
    </>
  );
}
