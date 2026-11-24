import { Button, Empty } from "@pond/ui";

interface ListQuery {
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
}

/** The empty, loading, and error states every storage list shares. */
export function ListEmpty({
  query,
  noun,
  filter,
  emptyTitle,
}: {
  query: ListQuery;
  noun: string;
  filter?: { term: string; clear: () => void };
  emptyTitle: string;
}) {
  if (query.isError) {
    return (
      <Empty.Root role="alert">
        <Empty.Title>Couldn&apos;t Load {noun}</Empty.Title>
        <Empty.Description>
          Check that the Library is available, then try again.
        </Empty.Description>
        <Empty.Action>
          <Button
            size="sm"
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Try Again
          </Button>
        </Empty.Action>
      </Empty.Root>
    );
  }
  if (query.isPending) {
    return (
      <Empty.Root role="status">
        <Empty.Title>Loading {noun}</Empty.Title>
      </Empty.Root>
    );
  }
  if (filter) {
    return (
      <Empty.Root role="status">
        <Empty.Title>
          {filter.term
            ? `No Results for “${filter.term}”`
            : `No Matching ${noun}`}
        </Empty.Title>
        <Empty.Action>
          <Button size="sm" variant="secondary" onClick={filter.clear}>
            Clear Filters
          </Button>
        </Empty.Action>
      </Empty.Root>
    );
  }
  return (
    <Empty.Root role="status">
      <Empty.Title>{emptyTitle}</Empty.Title>
    </Empty.Root>
  );
}
