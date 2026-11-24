import { IconArrowDown } from "@pond/icons";
import { Button, Empty, EmptyPreview } from "@pond/ui";

export function DownloadsCompletedHidden({
  onShowCompleted,
}: {
  onShowCompleted: () => void;
}) {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <EmptyPreview.Root layout="list">
          <EmptyPreview.Row>
            <EmptyPreview.Icon>
              <IconArrowDown size={12} />
            </EmptyPreview.Icon>
            <EmptyPreview.Line width={44} />
            <EmptyPreview.Space />
            <EmptyPreview.Line width={22} tone="mid" />
          </EmptyPreview.Row>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>No Unfinished Downloads</Empty.Title>
      <Empty.Description>
        Completed downloads are hidden by the Status filter.
      </Empty.Description>
      <Empty.Action>
        <Button variant="secondary" size="sm" onClick={onShowCompleted}>
          Show Completed
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}
