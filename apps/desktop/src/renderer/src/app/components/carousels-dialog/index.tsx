import { Checkbox, Dialog } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { splitAllSaves } from "@/features/saves/split-all";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import {
  carouselsIntroDialog,
  useCarouselsIntroDialog,
} from "@/shared/state/carousels-intro";
import {
  anotherDialogOpen,
  claimNoticeSlot,
  markNoticeSeen,
} from "@/shared/state/notices";
import { loadPrefs } from "@/shared/state/prefs";
import {
  SPLIT_CAROUSELS_NOTICE,
  splitCarouselsNoticeStep,
} from "./eligibility";
import styles from "./styles.module.css";

const CHECK_INTERVAL_MS = 3000;
/** Matches the Settings downloads query so its Split Into Saves switch reloads. */
const DOWNLOADS_KEY = ["settings", "downloads"];

/** Marks the notice seen before it opens, so closing it any way never brings it back. */
function useAnnounceOnce(): void {
  useEffect(() => {
    let checking = false;
    const timer = setInterval(async () => {
      if (checking || anotherDialogOpen()) return;
      checking = true;
      try {
        const [prefs, { count }] = await Promise.all([
          loadPrefs(),
          window.pond.query("saves.splittableCount", {}),
        ]);
        const step = splitCarouselsNoticeStep({
          seen: prefs.notices.seen,
          setupVersion: prefs.setup.version,
          splittable: count,
        });
        if (step === "wait" || (step === "show" && anotherDialogOpen())) return;
        clearInterval(timer);
        if (step === "skip") return;
        if (step === "show" && !claimNoticeSlot(SPLIT_CAROUSELS_NOTICE)) return;
        await markNoticeSeen(SPLIT_CAROUSELS_NOTICE);
        if (step === "show") carouselsIntroDialog.open(count);
      } catch {
        clearInterval(timer);
      } finally {
        checking = false;
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}

function useSplitNewImports(): [boolean, (next: boolean) => void] {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    window.pond
      .query("settings.get", {})
      .then((settings) => {
        if (active) setChecked(settings.imageDownload.splitPosts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const change = (next: boolean) => {
    setChecked(next);
    window.pond
      .query("settings.setImageDownload", { splitPosts: next })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        return queryClient.invalidateQueries({ queryKey: DOWNLOADS_KEY });
      })
      .catch(() => {
        setChecked(!next);
        notify({
          id: "download-prefs-error",
          title: "Couldn't save download settings",
          description: "Your previous setting is unchanged. Try again.",
          timeout: 8000,
        });
      });
  };

  return [checked, change];
}

function Intro({ count }: { count: number }) {
  const id = useId();
  const [splitNew, setSplitNew] = useSplitNewImports();

  const splitExisting = () => {
    carouselsIntroDialog.close();
    void splitAllSaves();
  };

  return (
    <Dialog.Popup>
      <Dialog.Header>
        <Dialog.Title>Split Carousels Into Saves</Dialog.Title>
        <Dialog.Close />
      </Dialog.Header>
      <Dialog.Content className={styles.content}>
        <Dialog.Description>
          A post with several images or videos can stay one save, or become one
          save per slide. Each slide then gets its own tags, title, and
          description, and shows on its own in your library grid.
        </Dialog.Description>
        <p className={styles.count}>
          {formatPlural(count, { one: "save", other: "saves" })} in your library{" "}
          {count === 1 ? "has" : "have"} several images or videos.
        </p>
        <label className={styles.option} htmlFor={`${id}-split-new`}>
          <Checkbox.Root
            id={`${id}-split-new`}
            checked={splitNew}
            onCheckedChange={(checked) => setSplitNew(checked === true)}
          >
            <Checkbox.Indicator />
          </Checkbox.Root>
          <span className={styles.text}>
            <span className={styles.label}>Split New Imports</span>
            <span className={styles.hint}>
              New carousels arrive as one save per slide.
            </span>
          </span>
        </label>
        <p className={styles.note}>
          Splitting can't be undone. You can change these choices later in
          Settings &gt; Images &gt; Carousels.
        </p>
      </Dialog.Content>
      <Dialog.Footer layout="fill">
        <Dialog.Cancel>Keep Saves as Is</Dialog.Cancel>
        <Dialog.Confirm onClick={splitExisting}>
          Split {formatPlural(count, { one: "Save", other: "Saves" })}
        </Dialog.Confirm>
      </Dialog.Footer>
    </Dialog.Popup>
  );
}

export function CarouselsDialog() {
  const { open, count } = useCarouselsIntroDialog();
  useAnnounceOnce();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) carouselsIntroDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Intro count={count} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
