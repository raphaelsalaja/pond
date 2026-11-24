import { IconDownload } from "@pond/icons";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { UpdateFlowPrototype } from "@/prototypes/update-flow";

export const Route = createFileRoute("/_library/dev/update-flow")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  staticData: {
    details: null,
    crumb: { label: "Update Flow", icon: IconDownload },
  },
  component: UpdateFlowPrototype,
});
