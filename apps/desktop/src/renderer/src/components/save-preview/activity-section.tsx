import { Button } from "@pond/ui";
import { useState } from "react";
import { ActivityList } from "@/components/activity-list";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function ActivitySection({ save }: { save: Save }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.actions}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Hide activity" : "Show activity"}
      </Button>
      {open ? <ActivityList.Root saveId={save.id} limit={50} /> : null}
    </div>
  );
}
