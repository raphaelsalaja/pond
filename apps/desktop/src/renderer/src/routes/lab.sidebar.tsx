import { createFileRoute, notFound } from "@tanstack/react-router";
import { SidebarLab } from "@/lab/sidebar";

export const Route = createFileRoute("/lab/sidebar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SidebarLab,
});
