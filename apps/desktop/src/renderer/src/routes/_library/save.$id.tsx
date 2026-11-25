import { createFileRoute, redirect } from "@tanstack/react-router";

/** Older builds and the main process open a Save by path; it now opens over All. */
export const Route = createFileRoute("/_library/save/$id")({
  beforeLoad: ({ params }) => {
    redirect({
      to: "/",
      search: { save: params.id },
      replace: true,
      throw: true,
    });
  },
});
