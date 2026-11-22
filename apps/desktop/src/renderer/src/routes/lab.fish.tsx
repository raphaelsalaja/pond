import { createFileRoute, notFound } from "@tanstack/react-router";
import { FishLab } from "@/lab/fish";

export const Route = createFileRoute("/lab/fish")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: FishLab,
});
