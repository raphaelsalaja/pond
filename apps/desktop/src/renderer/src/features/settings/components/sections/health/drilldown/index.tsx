import { Dialog } from "@pond/ui";
import type { DownloadHealthRow } from "@/features/downloads/health";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { categoryFact } from "../categories";
import type { HealthCategory } from "../categories";
import { HealthReview } from "../review";
import styles from "./styles.module.css";

export function HealthDrilldown({
  category,
  open,
  onOpenChange,
  downloads,
}: {
  category: HealthCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloads: ReadonlyArray<DownloadHealthRow>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          {category ? (
            <HealthReview.Root
              category={category}
              downloads={downloads}
              onNavigate={() => onOpenChange(false)}
            >
              <Dialog.Header>
                <Dialog.Title>{category.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Description>
                {categoryFact(category.id, THIS_DEVICE)}
              </Dialog.Description>
              <Dialog.Content className={styles.content}>
                <HealthReview.Filters className={styles.filters} />
                <HealthReview.List className={styles.list} />
                <HealthReview.Note />
              </Dialog.Content>
              <Dialog.Footer>
                <Dialog.Cancel>Close</Dialog.Cancel>
                <HealthReview.Actions />
              </Dialog.Footer>
            </HealthReview.Root>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
