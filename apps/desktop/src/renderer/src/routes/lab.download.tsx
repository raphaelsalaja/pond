import { createFileRoute, notFound } from "@tanstack/react-router";
import { DownloadLab } from "@/lab/download";

export const Route = createFileRoute("/lab/download")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DownloadLab,
});
