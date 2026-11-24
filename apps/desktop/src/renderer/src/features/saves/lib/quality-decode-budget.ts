const MAX_ACTIVE_DECODES = 3;
const MAX_QUEUED_DECODES = 24;

interface DecodeTask {
  run: () => Promise<void>;
  cancel: () => void;
}

export function createQualityDecodeBudget(
  maxActive = MAX_ACTIVE_DECODES,
  maxQueued = MAX_QUEUED_DECODES,
) {
  const queue: Array<DecodeTask> = [];
  let active = 0;

  const drain = () => {
    while (active < maxActive) {
      const task = queue.shift();
      if (!task) {
        return;
      }
      active++;
      void task.run().finally(() => {
        active--;
        drain();
      });
    }
  };

  return {
    schedule(run: () => Promise<void>): () => void {
      let cancelled = false;
      const task: DecodeTask = {
        run: () => (cancelled ? Promise.resolve() : run()),
        cancel: () => {
          cancelled = true;
        },
      };
      if (queue.length >= maxQueued) {
        queue.shift()?.cancel();
      }
      queue.push(task);
      drain();
      return task.cancel;
    },
    snapshot() {
      return { active, queued: queue.length };
    },
  };
}

export const qualityDecodeBudget = createQualityDecodeBudget();
