import { Button } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type HealthAction as Action,
  type HealthCategory,
  healthActions,
  useCategoryRunning,
  useHealthCategories,
} from "@/features/settings/library-health";
import { openSettings } from "@/shared/lib/open-settings";

/** The spinner follows the shared background run, so it survives leaving the notification. */
function Fix({ category, action }: { category: HealthCategory; action: Action }) {
  const running = useCategoryRunning(category.id);
  const [busy, setBusy] = useState(false);
  const pending = running || busy;

  async function run(): Promise<void> {
    setBusy(true);
    try {
      await action.run();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="primary"
      loading={pending}
      disabled={pending}
      onClick={() => void run()}
    >
      {action.label}
    </Button>
  );
}

export function HealthAction({ categoryId }: { categoryId: string }) {
  const qc = useQueryClient();
  const { categories, downloads } = useHealthCategories();
  const category = categories.find((item) => item.id === categoryId);
  const action =
    category && category.attention > 0
      ? healthActions(category.id, category.entries, { qc, downloads }).find(
          (item) => item.primary && !item.navigates,
        )
      : undefined;

  return category && action ? (
    <Fix category={category} action={action} />
  ) : (
    <Button size="sm" variant="primary" onClick={() => openSettings("health")}>
      Open Library Health
    </Button>
  );
}
