import { IconSparkle } from "@pond/icons";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { WhatsNewPrototype } from "@/prototypes/whats-new";

export const Route = createFileRoute("/_library/dev/whats-new")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      redirect({ to: "/", throw: true });
    }
  },
  staticData: {
    details: null,
    crumb: { label: "What's New", icon: IconSparkle },
  },
  component: WhatsNewPrototype,
});
