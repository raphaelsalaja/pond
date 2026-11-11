import { QueueWorkerRequestSchema } from "./worker-contract";
import { executeQueueWorkerRequest } from "./worker-operations";

process.parentPort.on("message", (event) => {
  const parsed = QueueWorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  void executeQueueWorkerRequest(parsed.data).then((response) => {
    process.parentPort.postMessage(response);
  });
});
