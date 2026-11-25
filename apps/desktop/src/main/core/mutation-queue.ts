import { AsyncLocalStorage } from "node:async_hooks";

export function createMutationQueue() {
  let tail = Promise.resolve();
  const scope = new AsyncLocalStorage<{ active: boolean }>();
  let suspended = false;
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (scope.getStore()?.active) {
        return operation();
      }
      if (suspended) {
        return Promise.reject(
          new Error("The library is changing. Try again when it opens."),
        );
      }
      const result = tail.then(async () => {
        const current = { active: true };
        try {
          return await scope.run(current, operation);
        } finally {
          current.active = false;
        }
      });
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    async suspend(): Promise<void> {
      suspended = true;
      await tail;
    },
    resume(): void {
      suspended = false;
    },
    async idle(): Promise<void> {
      await tail;
    },
  };
}
