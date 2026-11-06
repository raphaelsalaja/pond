import { Button } from "@pond/ui";
import type { TransferJob } from "@shared/transfer-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import styles from "./styles.module.css";

const labels = {
  export_eagle_package: "Export Eagle Package",
  export_files: "Export Files",
  export_package: "Export Pond Package",
  import_eagle_package: "Import Eagle Package",
  import_package: "Import Pond Package",
  copy_library: "Copy to Library",
  merge_library: "Merge Library",
} satisfies Record<TransferJob["request"]["kind"], string>;
const states = {
  running: "In progress",
  cancelling: "Cancelling after this file",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Canceled",
  interrupted: "Interrupted",
} satisfies Record<TransferJob["status"], string>;
const transferAction = {
  cancel: "transferJobs.cancel",
  dismiss: "transferJobs.dismiss",
  retry: "transferJobs.retry",
} as const;
type TransferAction = keyof typeof transferAction;

function canRetry(status: TransferJob["status"]): boolean {
  return (
    status === "failed" || status === "cancelled" || status === "interrupted"
  );
}
function canDismiss(status: TransferJob["status"]): boolean {
  return status !== "running" && status !== "cancelling";
}

export function TransferJobsPanel({ search = "" }: { search?: string }) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ["transfer-jobs"],
    queryFn: () => window.pond.query("transferJobs.list", {}),
    refetchInterval: 1000,
  });
  const action = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: TransferAction }) => {
      const result = await window.pond.query(transferAction[kind], { id });
      if (!result.ok) {
        throw new Error(
          kind === "dismiss"
            ? result.error
            : "This transfer has already changed. Try again.",
        );
      }
    },
    onMutate: () => setError(null),
    onSuccess: () => client.invalidateQueries({ queryKey: ["transfer-jobs"] }),
    onError: (cause) => setError(cause.message),
  });
  const acting = (id: string, kind: TransferAction) =>
    action.isPending &&
    action.variables?.id === id &&
    action.variables.kind === kind;
  const visible = (jobs.data ?? [])
    .filter((job) =>
      `${labels[job.request.kind]} ${job.request.destination}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, 30);
  if (!visible.length && !jobs.isError) return null;
  return (
    <section className={styles.panel} aria-label="Library transfers">
      <h2>Library Transfers</h2>
      {jobs.isError ? (
        <p role="alert">Couldn't load transfer history.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {visible.map((job) => {
        const active = job.status === "running" || job.status === "cancelling";
        return (
          <article key={job.id} className={styles.row}>
            <div className={styles.details}>
              <strong>{labels[job.request.kind]}</strong>
              <span
                className={styles.destination}
                title={job.request.destination}
              >
                {job.request.destination}
              </span>
              <span>
                {states[job.status]}
                {active && job.total
                  ? ` · ${job.phase}: ${job.completed} of ${job.total}`
                  : ""}
              </span>
              {active ? (
                <progress
                  aria-label={`${labels[job.request.kind]} progress`}
                  max={job.total || 1}
                  value={job.total ? job.completed : undefined}
                />
              ) : null}
              {job.error && job.status !== "cancelled" ? (
                <span className={styles.error}>{job.error}</span>
              ) : null}
            </div>
            {job.status === "cancelling" ? null : (
              <div className={styles.actions}>
                {job.status === "running" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={action.isPending}
                    loading={acting(job.id, "cancel")}
                    onClick={() =>
                      action.mutate({ id: job.id, kind: "cancel" })
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
                {canRetry(job.status) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={action.isPending}
                    loading={acting(job.id, "retry")}
                    onClick={() => action.mutate({ id: job.id, kind: "retry" })}
                  >
                    Retry
                  </Button>
                ) : null}
                {canDismiss(job.status) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={action.isPending}
                    loading={acting(job.id, "dismiss")}
                    onClick={() =>
                      action.mutate({ id: job.id, kind: "dismiss" })
                    }
                  >
                    Dismiss
                  </Button>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
