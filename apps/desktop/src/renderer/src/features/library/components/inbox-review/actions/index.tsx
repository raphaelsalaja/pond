import { Button, Keyboard } from "@pond/ui";
import { ReviewFolderPicker } from "@/features/library/components/inbox-review/collections";
import type { Review } from "@/features/library/components/inbox-review/use-review";
import styles from "./styles.module.css";

/** One button per swipe direction, so every gesture also works with a click. */
export function ReviewActions({ review }: { review: Review }) {
  const disabled = !review.id;
  const action = (key: string, label: string, onClick?: () => void) => (
    <Button size="xs" variant="ghost" disabled={disabled} onClick={onClick}>
      <Keyboard.Key>{key}</Keyboard.Key>
      {label}
    </Button>
  );
  return (
    <div className={styles.actions}>
      {action("←", "Trash", () => review.actions.trash())}
      <ReviewFolderPicker
        saveId={review.id}
        open={review.choosing}
        onOpenChange={review.setChoosing}
        onFile={review.actions.file}
        trigger={action("↑", "Folder")}
      />
      {action("↓", "Skip", () => review.actions.skip())}
      {action("→", "Keep", () => review.actions.keep())}
      {action("Space", "Preview", () => review.actions.preview())}
    </div>
  );
}
