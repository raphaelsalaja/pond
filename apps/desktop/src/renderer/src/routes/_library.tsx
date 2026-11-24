import { createFileRoute } from "@tanstack/react-router";

import { Library } from "@/features/library/components/page";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { librarySearchSchema } from "@/features/search/lib/schemas";

export const Route = createFileRoute("/_library")({
  validateSearch: librarySearchSchema,
  loaderDeps: ({ search }) => ({ save: search.save }),
  loader: ({ deps }) => (deps.save ? ensureSaves([deps.save]) : undefined),
  component: () => <Library />,
});
