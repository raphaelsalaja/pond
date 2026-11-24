import { IconCopy } from "@pond/icons";
import { Button } from "@pond/ui";
import { notify } from "@/shared/lib/toast";
import { DetailSection } from "../detail-section";
import styles from "./styles.module.css";

export function EnrichedText({ title, text }: { title: string; text: string }) {
  async function copy() {
    await window.pond.query("clipboard.writeText", { text });
    notify({ id: "copy-enriched-text", title: `Copied ${title}` });
  }

  return (
    <DetailSection
      title={title}
      action={
        <Button
          type="button"
          icon
          size="xs"
          variant="ghost"
          aria-label={`Copy ${title}`}
          onClick={() => void copy()}
        >
          <IconCopy size={12} />
        </Button>
      }
    >
      <div className={styles.card}>
        <p className={styles.text} data-scroll-fade="vertical">
          {text}
        </p>
      </div>
    </DetailSection>
  );
}
