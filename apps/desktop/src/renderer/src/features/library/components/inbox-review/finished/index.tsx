import { IconCircleCheckFill } from "@pond/icons";
import { Button, Empty } from "@pond/ui";
import {
  countOutcomes,
  type ReviewQueue,
} from "@/features/library/lib/review-queue";

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
        <IconCircleCheckFill size={32} />
      </Empty.Media>
      <Empty.Title>Review complete</Empty.Title>
      <Empty.Description>
        {reviewSummary(queue)}
        {remaining > 0
          ? " Skipped and filed saves are still in the Inbox."
          : " Your Inbox is clear."}
      </Empty.Description>
      <Empty.Action>
        {remaining > 0 ? (
          <Button variant="secondary" size="sm" onClick={onRestart}>
            Review Again
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={onExit}>
          Back to Inbox
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}
