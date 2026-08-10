import { IconXmarkOutline18 as Xmark } from "@pond/icons/outline/18";
import { Dialog } from "@pond/ui";
import { SettingsDetail } from "@/components/settings/detail";
import { SettingsSidebar } from "@/components/settings/sidebar";
import { useScrollFade } from "@/hooks/use-scroll-fade";
import { settingsModal, useSettingsModal } from "@/stores/settings-modal";
import styles from "./styles.module.css";

export function SettingsModal() {
  const { section, hash } = useSettingsModal();
  const scrollFade = useScrollFade<HTMLElement>();

  return (
    <Dialog.Root
      open={section != null}
      onOpenChange={(open) => {
        if (!open) settingsModal.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label="Settings">
          <Dialog.Close className={styles.close} aria-label="Close settings">
            <Xmark />
          </Dialog.Close>
          <SettingsSidebar />
          <main className={styles.content} {...scrollFade}>
            {section ? <SettingsDetail section={section} hash={hash} /> : null}
          </main>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
