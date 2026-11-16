import { IconMagnifier } from "@pond/icons";
import { Button, Empty } from "@pond/ui";

interface MatchesEmptyProps {
  actionLabel?: string;
  description?: string;
  onReset?: () => void;
}

export function MatchesEmpty({
  actionLabel = "Clear Search and Filters",
  description = "Try a different search or clear the filters.",
  onReset,
}: MatchesEmptyProps = {}) {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconMagnifier size={32} />
      </Empty.Media>
      <Empty.Title>No results found</Empty.Title>
      <Empty.Description>{description}</Empty.Description>
      {onReset ? (
        <Empty.Action>
          <Button variant="primary" size="sm" onClick={onReset}>
            {actionLabel}
          </Button>
        </Empty.Action>
      ) : null}
    </Empty.Root>
  );
}
