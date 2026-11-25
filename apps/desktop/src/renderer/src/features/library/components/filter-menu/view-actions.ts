import { savedViews } from "@/features/library/state/saved-views";
import {
  setSemanticQuery,
  setVisualProbe,
  updateLocalFilters,
} from "@/features/library/state/view-store";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";

export function saveViewLabel(activeViewId: string | null): string {
  return activeViewId ? "Update View" : "Save View";
}

function fail(title: string) {
  return (cause: unknown) =>
    notify({
      id: "save-filter-view",
      title,
      description: errorCopy(cause, "Try again."),
    });
}

export function saveFilterView(activeViewId: string | null): void {
  if (activeViewId) {
    void savedViews
      .updateCurrent(activeViewId)
      .catch(fail("Couldn't update the saved view"));
    return;
  }
  void savedViews
    .create({ kind: "saved_view", name: "Untitled" })
    .then((view) => savedViews.startEditing(view.id))
    .catch(fail("Couldn't save the view"));
}

export function clearFilters(): void {
  updateLocalFilters([]);
  setSemanticQuery(null);
  setVisualProbe(null);
}
