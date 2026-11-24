import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SourceDetail } from "@/features/sources/components/inspector";
import {
  isSourceDetailsKind,
  SourceDetailsPageSchema,
} from "@/features/sources/state/source-detail";

const SourceDetailSearchSchema = z.object({
  page: SourceDetailsPageSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/_library/sources_/$kind/$id")({
  staticData: { details: null },
  validateSearch: SourceDetailSearchSchema,
  beforeLoad: ({ params }) => {
    if (!isSourceDetailsKind(params.kind)) throw redirect({ to: "/sources" });
  },
  component: SourceDetailRoute,
});

function SourceDetailRoute() {
  const { kind, id } = Route.useParams();
  const { page } = Route.useSearch();
  if (!isSourceDetailsKind(kind)) return null;
  return <SourceDetail key={`${kind}:${id}`} kind={kind} id={id} page={page} />;
}
