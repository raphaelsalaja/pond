import {
  IconArrowRotateClockwise,
  IconCircleXmark,
  IconCopy,
  IconFolderOpen,
  IconMediaPause,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import type { TransferJob } from "@shared/transfer-contracts";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { statusFeed } from "@/features/downloads/lib/status-feed";
import {
  transferActive,
  transferCanRetry,
  transferRevealable,
} from "@/features/downloads/lib/transfer-rows";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";

export const TRANSFER_JOBS_KEY = ["transfer-jobs"] as const;

const ACTIONS = {
  cancel: "transferJobs.cancel",
  dismiss: "transferJobs.dismiss",
  retry: "transferJobs.retry",
} as const;

async function runTransferAction(
  client: QueryClient,
  job: TransferJob,
  kind: keyof typeof ACTIONS,
) {
  const result = await window.pond.query(ACTIONS[kind], { id: job.id });
  if (!result.ok)
    statusFeed.error(
      "Library Transfers",
      kind === "dismiss"
        ? result.error
        : "This transfer has already changed. Try again.",
    );
  await client.invalidateQueries({ queryKey: TRANSFER_JOBS_KEY });
}

export async function revealTransfer(job: TransferJob) {
  const result = await window.pond.query("transferJobs.reveal", {
    path: job.request.destination,
  });
  if (!result.ok) statusFeed.error("Show in Finder", result.error);
}

function copyText(text: string) {
  void window.pond.query("clipboard.writeText", { text });
}

export function buildTransferMenuItems(
  job: TransferJob,
  client: QueryClient,
): MenuItemSpec[] {
  const error = job.status === "cancelled" ? "" : (job.error?.trim() ?? "");
  return [
    {
      label: "Show in Finder",
      icon: <IconFolderOpen />,
      hidden: !transferRevealable(job),
      onClick: () => void revealTransfer(job),
    },
    { type: "separator" },
    {
      label: "Retry Transfer",
      icon: <IconArrowRotateClockwise />,
      hidden: !transferCanRetry(job),
      onClick: () => void runTransferAction(client, job, "retry"),
    },
    {
      label: "Cancel Transfer",
      icon: <IconMediaPause />,
      hidden: job.status !== "running",
      onClick: () => void runTransferAction(client, job, "cancel"),
    },
    { type: "separator" },
    {
      label: "Copy Path",
      icon: <IconCopy />,
      onClick: () => copyText(job.request.destination),
    },
    {
      label: "Copy Error",
      icon: <IconCopy />,
      hidden: !error,
      onClick: () => copyText(error),
    },
    { type: "separator" },
    {
      label: "Dismiss",
      icon: <IconCircleXmark />,
      hidden: transferActive(job),
      onClick: () => void runTransferAction(client, job, "dismiss"),
    },
  ];
}

export function TransferContextMenu({
  job,
  children,
}: {
  job: TransferJob;
  children: ReactElement;
}) {
  const client = useQueryClient();
  return (
    <SpecContextMenu buildItems={() => buildTransferMenuItems(job, client)}>
      {children}
    </SpecContextMenu>
  );
}
