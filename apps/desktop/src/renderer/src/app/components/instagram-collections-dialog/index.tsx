import { Dialog } from "@pond/ui";
import { useEffect } from "react";
import { sourceDetail } from "@/features/sources/state/source-detail";
import {
  instagramCollectionsDialog,
  useInstagramCollectionsDialog,
} from "@/shared/state/instagram-collections";
import {
  anotherDialogOpen,
  claimNoticeSlot,
  markNoticeSeen,
} from "@/shared/state/notices";
import { loadPrefs } from "@/shared/state/prefs";
import {
  INSTAGRAM_COLLECTIONS_NOTICE,
  instagramAccountsToNotify,
  instagramCollectionsNoticeStep,
} from "./eligibility";

const CHECK_INTERVAL_MS = 3000;

/** Checks only once setup and other dialogs close, so a first run counts the library you actually open. */
function useNotifyOnce(): void {
  useEffect(() => {
    let checking = false;
    let accountIds: string[] | null = null;
    const timer = setInterval(async () => {
      if (checking || anotherDialogOpen()) return;
      if (accountIds === null) {
        checking = true;
        try {
          const [prefs, counts, { accounts }] = await Promise.all([
            loadPrefs(),
            window.pond.query("saves.sidebarCounts", {}),
            window.pond.query("accounts.list", {}),
          ]);
          const ids = instagramAccountsToNotify(accounts, counts.library);
          const step = instagramCollectionsNoticeStep({
            seen: prefs.notices.seen,
            accountIds: ids,
          });
          if (step !== "show") {
            clearInterval(timer);
            if (step === "mark-seen") {
              await markNoticeSeen(INSTAGRAM_COLLECTIONS_NOTICE);
            }
            return;
          }
          accountIds = ids;
        } catch {
          clearInterval(timer);
          return;
        } finally {
          checking = false;
        }
        if (anotherDialogOpen()) return;
      }
      clearInterval(timer);
      if (!claimNoticeSlot(INSTAGRAM_COLLECTIONS_NOTICE)) return;
      void markNoticeSeen(INSTAGRAM_COLLECTIONS_NOTICE);
      instagramCollectionsDialog.open(accountIds);
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}

export function InstagramCollectionsDialog() {
  const { open, accountIds } = useInstagramCollectionsDialog();
  useNotifyOnce();

  function choose() {
    const [first] = accountIds;
    instagramCollectionsDialog.close();
    if (first) sourceDetail.openAccount(first, "filters");
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) instagramCollectionsDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Instagram Collections Now Load</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              Pick which collections to import, and Pond mirrors each one as a
              Folder. Instagram saves already in your library go into those
              Folders too.
              {accountIds.length > 1
                ? " Do the same for your other Instagram accounts in Sources."
                : null}
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel>Not Now</Dialog.Cancel>
            <Dialog.Confirm onClick={choose}>Choose Collections</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
