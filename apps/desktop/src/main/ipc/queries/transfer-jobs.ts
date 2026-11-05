import { z } from "zod";
import { transferJobStore } from "../../core/transfer-jobs";
import { retryTransferJob } from "../../core/transfer-operations";
import { type QueryHandlerMap, query, StringParam } from "./params";
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
} satisfies QueryHandlerMap;
