import { TrayCard } from "@pond/ui";
import { useDock } from "@/components/library/dock/lib/context";
import { FREQUENCY_OPTIONS } from "@/components/library/sources/page/lib/helpers";
import { dockMode } from "@/stores/dock-mode";
import { usePrefs } from "@/stores/prefs";
import styles from "./frequency.module.css";

type DetailView = "account-detail" | "account-sync" | "watch-detail";

/** The page is reached from either detail card; module state survives the card swap so Back returns to the right one. */
let returnTo: DetailView = "account-detail";

export function openFrequencyPage(from: DetailView): void {
  returnTo = from;
  dockMode.open("sync-frequency");
}

export function FrequencySection() {
  const dock = useDock();
  const [sync, patchSync] = usePrefs("sync");
  const cron = sync.cron ?? { enabled: true, intervalHours: 6 };

  const pick = (next: { enabled: boolean; intervalHours: number }) => {
    patchSync({ cron: next });
    dock.openViewMenu(returnTo);
  };

  return (
    <>
      <TrayCard.Header>
        <TrayCard.Back onClick={() => dock.openViewMenu(returnTo)} />
        <TrayCard.Title position="center">
          {returnTo === "watch-detail" ? "Check Frequency" : "Sync Frequency"}
        </TrayCard.Title>
        <TrayCard.Separator />
        <TrayCard.Description>
          How often Pond checks for new items in the background.
        </TrayCard.Description>
      </TrayCard.Header>
      <div className={styles.rows}>
        {FREQUENCY_OPTIONS.map((option) => {
          const active = cron.enabled && cron.intervalHours === option.hours;
          return (
            <button
              key={option.hours}
              type="button"
              aria-pressed={active}
              className={`${styles.row} ${styles["row-button"]}`}
              onClick={() =>
                pick({ enabled: true, intervalHours: option.hours })
              }
            >
              {active ? <span aria-hidden className={styles.ring} /> : null}
              <span className={styles["row-label"]}>{option.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={!cron.enabled}
          className={`${styles.row} ${styles["row-button"]}`}
          onClick={() => pick({ ...cron, enabled: false })}
        >
          {!cron.enabled ? <span aria-hidden className={styles.ring} /> : null}
          <span className={styles["row-label"]}>Manual Only</span>
        </button>
      </div>
    </>
  );
}
