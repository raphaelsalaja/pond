import { stat } from "node:fs/promises";
import { shell } from "electron";
import { z } from "zod";
import { transferJobStore } from "../../core/transfer-jobs";
import { retryTransferJob } from "../../core/transfer-operations";
import { query, StringParam } from "./params";
import type { QueryHandlerMap } from "./params";
export const transferJobsQueries = {
  "transferJobs.list": query(z.object({}), () => transferJobStore().list()),
  "transferJobs.cancel": query(z.object({ id: StringParam }), ({ id }) =>
    transferJobStore().cancel(id),
  ),
  "transferJobs.dismiss": query(z.object({ id: StringParam }), ({ id }) =>
    transferJobStore().dismiss(id),
  ),
  "transferJobs.retry": query(z.object({ id: StringParam }), ({ id }) =>
    retryTransferJob(id),
  ),
  "transferJobs.reveal": query(
    z.object({ path: StringParam }),
    async ({ path }) => {
      const exported = (await transferJobStore().list()).some(
        (job) =>
          job.status === "completed" &&
          job.request.kind.startsWith("export_") &&
          job.request.destination === path,
      );
      if (!exported || !(await stat(path).catch(() => null))) {
        return { ok: false, error: "This export is no longer there." };
      }
      shell.showItemInFolder(path);
      return { ok: true };
    },
  ),
} satisfies QueryHandlerMap;
