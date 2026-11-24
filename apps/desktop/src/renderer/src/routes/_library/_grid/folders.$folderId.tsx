import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/folders/$folderId")({
  staticData: {
    nav: (params) => ({ kind: "folder", id: params.folderId ?? "" }),
  },
});
