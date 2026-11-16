import { IconCircleCheck } from "@pond/icons";
import { Button, Dialog } from "@pond/ui";
import { supportDialog, useSupportDialogOpen } from "@/shared/state/support";
import styles from "./styles.module.css";
import { SupportVisual } from "./visual";

const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";
const GITHUB = "https://github.com/raphaelsalaja/pond";
const X = "https://x.com/raphaelsalaja";

const PROMISES = [
  "Free and open source",
  "On this computer, with no account",
  "Free of ads and tracking",
] as const;

export function SupportDialog() {
  const open = useSupportDialogOpen();

  function visit(url: string) {
    void window.pond.openExternal(url);
    supportDialog.close();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) supportDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header data-empty />
          <Dialog.Content>
            <div className={styles.body}>
              <SupportVisual />
              <div className={styles.copy}>
                <Dialog.Title className={styles.title}>
                  Help Pond Keep Growing
                </Dialog.Title>
                <Dialog.Description className={styles.description}>
                  Pond is made by one person.
                  <br />
                  If it helps you, a coffee funds its development.
                </Dialog.Description>
              </div>
              <div className={styles.details}>
                <p className={styles.heading}>Pond Stays</p>
                <ul className={styles.checklist}>
                  {PROMISES.map((promise) => (
                    <li key={promise}>
                      <IconCircleCheck size={12} className={styles.check} />
                      <span>{promise}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.spread}>
                <p className={styles.heading}>Other Ways to Help</p>
                <p className={styles.text}>
                  Money is never expected. A star on GitHub or a follow on X
                  helps more people find Pond.
                </p>
                <div className={styles.links}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => visit(GITHUB)}
                  >
                    Star on GitHub
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => visit(X)}
                  >
                    Follow on X
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
          <Dialog.Footer layout="fill">
            <Dialog.Cancel>Not Now</Dialog.Cancel>
            <Dialog.Confirm onClick={() => visit(BUY_ME_A_COFFEE)}>
              Buy Me a Coffee
            </Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
