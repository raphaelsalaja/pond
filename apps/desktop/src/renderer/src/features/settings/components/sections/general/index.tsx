import { Button, Settings } from "@pond/ui";
import { requestUpdateCheck } from "@/features/settings/components/update-dialog/session";
import { useUpdateDialog } from "@/features/settings/components/update-dialog/use-update-dialog";
import { whatsNewDialog } from "@/shared/state/whats-new";

export function CheckNowRow() {
  const dialog = useUpdateDialog();
  const checking = dialog.open && dialog.view?.kind === "checking";

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>Check for Updates</Settings.ItemTitle>
        <Settings.ItemDescription>
          Look for a newer build.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => requestUpdateCheck()}
          disabled={checking}
          loading={checking}
        >
          Check Now
        </Button>
      </Settings.ItemControl>
    </>
  );
}

export function WhatsNewRow() {
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>What's New</Settings.ItemTitle>
        <Settings.ItemDescription>
          Read the release notes for every version of Pond.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => whatsNewDialog.open()}
        >
          Open
        </Button>
      </Settings.ItemControl>
    </>
  );
}
