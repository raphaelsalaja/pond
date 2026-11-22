import { IconMagnifier } from "@pond/icons";
import { Button, Empty } from "@pond/ui";

interface MatchesEmptyProps {
  query?: string;
  filtered?: boolean;
  /** Counted noun the filters hide, like "12 sources". */
  hidden?: string;
  onReset?: () => void;
}

function copy(query: string, filtered: boolean, hidden?: string) {
  if (query && filtered) {
    return {
      description: "Nothing matches this search with your filters on.",
      action: "Clear Search and Filters",
    };
  }
  if (filtered) {
    return {
      description: hidden
        ? `Your filters hide ${hidden}.`
        : "Nothing matches your filters.",
      action: "Clear Filters",
    };
  }
  if (query) {
    return {
      description: "Check the spelling or try another word.",
      action: "Clear Search",
    };
  }
  return {
    description: "Try a different search or clear the filters.",
    action: "Clear Search and Filters",
  };
}

export function MatchesEmpty({
  query = "",
  filtered = false,
  hidden,
  onReset,
}: MatchesEmptyProps = {}) {
  const trimmed = query.trim();
  const content = copy(trimmed, filtered, hidden);
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconMagnifier size={14} />
      </Empty.Media>
      <Empty.Title>
        {trimmed ? `No results for “${trimmed}”` : "No results found"}
      </Empty.Title>
      <Empty.Description>{content.description}</Empty.Description>
      {onReset ? (
        <Empty.Action>
          <Button variant="primary" size="sm" onClick={onReset}>
            {content.action}
          </Button>
        </Empty.Action>
      ) : null}
    </Empty.Root>
  );
}
