import { IconCheck } from "@pond/icons";
import { Button, Empty, EmptyPreview } from "@pond/ui";
import { countOutcomes } from "@/features/library/lib/review-queue";
import type { ReviewQueue } from "@/features/library/lib/review-queue";

const LIST = new Intl.ListFormat("en", { type: "conjunction" });

function reviewSummary(queue: ReviewQueue): string {
  const counts = countOutcomes(queue);
  const parts = [
    counts.keep ? `kept ${counts.keep}` : null,
    counts.collection ? `filed ${counts.collection}` : null,
    counts.trash ? `trashed ${counts.trash}` : null,
    counts.skip ? `skipped ${counts.skip}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0
    ? `You ${LIST.format(parts)}.`
    : "Nothing changed in this pass.";
}

interface ReviewFinishedProps {
  queue: ReviewQueue;
  remaining: number;
  onRestart: () => void;
  onExit: () => void;
}

export function ReviewFinished({
  queue,
  remaining,
  onRestart,
  onExit,
}: ReviewFinishedProps) {
  return (
    <Empty.Root role="status">
      <Empty.Media>
        <EmptyPreview.Root layout="single">
          <EmptyPreview.Row>
            <EmptyPreview.Icon>
              <IconCheck size={12} />
            </EmptyPreview.Icon>
            <EmptyPreview.Lines>
              <EmptyPreview.Line width={56} />
              <EmptyPreview.Line width={34} tone="thin" />
            </EmptyPreview.Lines>
          </EmptyPreview.Row>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>Review Complete</Empty.Title>
      <Empty.Description>
        {reviewSummary(queue)}
        {remaining > 0
          ? " Skipped and filed saves are still in the Inbox."
          : " Your Inbox is clear."}
      </Empty.Description>
      <Empty.Action>
        {remaining > 0 ? (
          <Button variant="text" size="sm" onClick={onRestart}>
            Review Again
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onExit}>
          Back to Library
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}
