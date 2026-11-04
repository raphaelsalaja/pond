import { Dialog } from "@pond/ui";
import { useEffect, useState } from "react";
import { convertArenaLinks } from "@/shared/lib/arena-links";
import { formatPlural } from "@/shared/lib/format";
import {
  anotherDialogOpen,
  claimNoticeSlot,
  markNoticeSeen,
} from "@/shared/state/notices";
import { loadPrefs } from "@/shared/state/prefs";
import { ARENA_LINKS_NOTICE, arenaLinksNoticeStep } from "./eligibility";
import styles from "./styles.module.css";

const CHECK_INTERVAL_MS = 3000;
const LINK_SAVES = { one: "Link save", other: "Link saves" };

/** Checks only once setup and other dialogs close, so a first run counts the library you actually open. */
function useAnnounceOnce(show: (pending: number) => void): void {
  useEffect(() => {
    let checking = false;
    let pending: number | null = null;
    const timer = setInterval(async () => {
      if (checking || anotherDialogOpen()) return;
      if (pending === null) {
        checking = true;
        try {
          const [prefs, status] = await Promise.all([
            loadPrefs(),
            window.pond.query("arenaLinks.status", {}),
          ]);
          const step = arenaLinksNoticeStep({
            seen: prefs.notices.seen,
            pending: status.pending,
          });
          if (step !== "show") {
            clearInterval(timer);
            if (step === "mark-seen") await markNoticeSeen(ARENA_LINKS_NOTICE);
            return;
          }
          pending = status.pending;
        } catch {
          clearInterval(timer);
          return;
        } finally {
          checking = false;
        }
        if (anotherDialogOpen()) return;
      }
      clearInterval(timer);
      if (claimNoticeSlot(ARENA_LINKS_NOTICE)) show(pending);
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [show]);
}

export function ArenaLinksDialog() {
  const [pending, setPending] = useState<number | null>(null);
  useAnnounceOnce(setPending);

  function dismiss() {
    setPending(null);
    void markNoticeSeen(ARENA_LINKS_NOTICE);
  }

  function convert() {
    dismiss();
    void convertArenaLinks();
  }

  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Are.na Links Now Save as Web Pages</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              A Link block now opens the site it points to and uses the page's
              cover image. If the page has none, it keeps Are.na's screenshot.
              With Archive Web Pages Automatically on, Pond archives the page
              too.
            </Dialog.Description>
            <p className={styles.text}>
              You have {formatPlural(pending ?? 0, LINK_SAVES)} from before this
              change. Convert {pending === 1 ? "it" : "them"} now, or later from
              Storage in Settings. Saves you leave convert when you refresh
              them.
            </p>
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel>Not Now</Dialog.Cancel>
            <Dialog.Confirm onClick={convert}>Convert Now</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
