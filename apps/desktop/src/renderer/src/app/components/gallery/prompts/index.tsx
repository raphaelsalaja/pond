import { Button, Toast } from "@pond/ui";
import { useEffect, useState } from "react";
import { ToastItem } from "@/shared/components/toast-host";
import { askToast, type ToastData } from "@/shared/lib/toast";
import { PROMPT_IDS } from "@/shared/state/prompts";
import { promptAsk, promptSpec } from "../../prompts/catalog";
import styles from "./styles.module.css";

type Theme = "light" | "dark";

const manager = Toast.createToastManager<ToastData>();

const noop = () => {};

const THEMES = ["light", "dark"] as const satisfies readonly Theme[];

function fill() {
  for (const theme of THEMES) {
    for (const id of PROMPT_IDS) {
      manager.add(
        askToast(
          `${id}:${theme}`,
          promptAsk(promptSpec(id), { onConfirm: noop, onClose: noop }),
        ),
      );
    }
  }
}

function Grid({ theme }: { theme: Theme }) {
  const { toasts } = Toast.useToastManager<ToastData>();
  return (
    <div className={styles.grid}>
      {PROMPT_IDS.map((id) => {
        const toast = toasts.find((item) => item.id === `${id}:${theme}`);
        return (
          <div key={id} className={styles.cell}>
            <span className={styles.label}>{id}</span>
            {toast ? (
              <ToastItem toast={toast} />
            ) : (
              <span className={styles.dismissed}>Dismissed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PromptGallery({ themes }: { themes: readonly Theme[] }) {
  const [round, setRound] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset bumps round to refill dismissed toasts.
  useEffect(() => {
    fill();
    return () => manager.close();
  }, [round]);

  return (
    <Toast.Provider toastManager={manager} limit={Number.POSITIVE_INFINITY}>
      <section className={styles.section}>
        <header className={styles.header}>
          <h2 className={styles.heading}>Prompts</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRound((value) => value + 1)}
          >
            Reset
          </Button>
        </header>
        <div className={styles.frames}>
          {themes.map((theme) => (
            <div key={theme} className={styles.frame} data-theme={theme}>
              <Grid theme={theme} />
            </div>
          ))}
        </div>
      </section>
    </Toast.Provider>
  );
}
