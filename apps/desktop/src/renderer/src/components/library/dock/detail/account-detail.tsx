import {
  IconClockFill18 as Clock,
  IconGear3Fill18 as Gear,
  IconGridFill18 as Grid,
  IconUserFill18 as User,
} from "@pond/icons/fill/18";
import { IconChevronRightOutline18 as ChevronRight } from "@pond/icons/outline/18";
import { Button, TrayCard } from "@pond/ui";
import { useNavigate } from "@tanstack/react-router";
import { openTrayConfirm } from "@/components/library/dock/confirm";
import { HeroAvatar } from "@/components/library/dock/detail/hero-avatar";
import { useDock } from "@/components/library/dock/lib/context";
import { accountName } from "@/components/library/sources/page/lib/helpers";
import { cardModel } from "@/components/library/sources/sync-monitor/lib/helpers";
import { type AccountRow, useAccounts } from "@/hooks/use-accounts";
import { getSourceDef } from "@/lib/save/sources-registry";
import { formatNumber } from "@/lib/util/format";
import { clearAsk } from "@/stores/ask-store";
import { sourceDetail, useDetailAccountId } from "@/stores/source-detail";
import { useSyncByAccount } from "@/stores/sync-monitor";
import { setSearchInput } from "@/stores/view-store";
import styles from "./account-detail.module.css";

/** Account settings card in the dock tray; the id arrives through the source-detail store. */
export function AccountDetailSection() {
  const { accounts, refetch } = useAccounts();
  const accountId = useDetailAccountId();
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  /** Nothing to show while the list loads. */
  if (!account) return <TrayCard.Close />;
  return (
    <AccountDetail
      key={account.id}
      account={account}
      onChanged={() => {
        void refetch();
        sourceDetail.changed();
      }}
    />
  );
}

function AccountDetail({
  account,
  onChanged,
}: {
  account: AccountRow;
  onChanged: () => void;
}) {
  const dock = useDock();
  const navigate = useNavigate();
  const byAccount = useSyncByAccount();
  const status = byAccount[account.id];
  const model = cardModel(status);
  const { source } = account;

  const count = account.sync?.knownCount ?? 0;
  const def = getSourceDef(source);

  const viewItems = () => {
    clearAsk();
    setSearchInput(
      [{ field: "account", operator: "eq", value: account.id }],
      "",
    );
    dock.closeViewMenu();
    void navigate({ to: "/" });
  };

  const confirmDisconnect = () => {
    openTrayConfirm({
      title: "Disconnect",
      description: `Pond signs ${accountName(account)} out and stops its syncing. The ${formatNumber(count)} item${count === 1 ? "" : "s"} already saved stay in your library.`,
      confirmLabel: "Disconnect",
      returnTo: "account-detail",
      onConfirm: async () => {
        await window.pond.query("accounts.disconnect", {
          accountId: account.id,
        });
        onChanged();
      },
    });
  };

  const primary = (() => {
    switch (model.tone) {
      case "run":
        return {
          label: "Cancel Sync",
          run: () => window.pond.syncCancel(account.id),
        };
      case "paused":
        return {
          label: "Reconnect",
          run: () => window.pond.connectSource(source),
        };
      case "err":
        return {
          label: "Retry Now",
          run: () => window.pond.syncRunNow(account.id),
        };
      default:
        return model.connected
          ? {
              label: "Sync Now",
              run: () => window.pond.syncRunNow(account.id),
            }
          : { label: "Connect", run: () => window.pond.connectSource(source) };
    }
  })();

  return (
    <>
      <TrayCard.Close />
      <div className={styles.hero}>
        <HeroAvatar source={source} avatarUrl={account.avatarUrl} />
        <div className={styles["hero-copy"]}>
          <TrayCard.Title>{account.label ?? def.label}</TrayCard.Title>
          {account.handle ? (
            <span className={styles["hero-handle"]}>@{account.handle}</span>
          ) : null}
        </div>
      </div>

      <div className={styles.rows}>
        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          onClick={() => dock.openViewMenu("account-profile")}
        >
          <span className={styles["row-icon"]}>
            <User size={18} />
          </span>
          <span className={styles["row-label"]}>Profile</span>
          <span className={styles["row-value"]}>
            <ChevronRight width={13} height={13} />
          </span>
        </button>

        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          onClick={() => dock.openViewMenu("account-sync")}
        >
          <span className={styles["row-icon"]}>
            <Clock size={18} />
          </span>
          <span className={styles["row-label"]}>Sync Details</span>
          <span className={styles["row-value"]}>
            <ChevronRight width={13} height={13} />
          </span>
        </button>

        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          onClick={() => dock.openViewMenu("account-maintenance")}
        >
          <span className={styles["row-icon"]}>
            <Gear size={18} />
          </span>
          <span className={styles["row-label"]}>Maintenance</span>
          <span className={styles["row-value"]}>
            <ChevronRight width={13} height={13} />
          </span>
        </button>

        <button
          type="button"
          className={`${styles.row} ${styles["row-button"]}`}
          onClick={viewItems}
        >
          <span className={styles["row-icon"]}>
            <Grid size={18} />
          </span>
          <span className={styles["row-label"]}>View Items in Library</span>
          <span className={styles["row-value"]}>
            <ChevronRight width={13} height={13} />
          </span>
        </button>
      </div>

      <TrayCard.Footer>
        <Button
          variant="tertiary"
          size="lg"
          style={{ width: "100%" }}
          onClick={confirmDisconnect}
        >
          Disconnect
        </Button>
        <TrayCard.Confirm
          onClick={(e) => {
            void primary.run();
            /** A running sync stays visible so it can be cancelled. */
            if (model.tone === "run") e.preventDefault();
          }}
        >
          {primary.label}
        </TrayCard.Confirm>
      </TrayCard.Footer>

      {model.tone === "err" && status?.lastError ? (
        <p className={styles["error-line"]}>{status.lastError}</p>
      ) : null}
    </>
  );
}
