import { expect, it } from "vitest";
import { createMutationQueue } from "./mutation-queue";

it("closes admission before draining accepted writes, including failures, and resumes explicitly", async () => {
  const queue = createMutationQueue();
  const release = Promise.withResolvers<void>();
  const order: Array<string> = [];
  const first = queue.run(async () => {
    order.push("first");
    await release.promise;
  });
  const failed = queue.run(async () => {
    order.push("failed");
    throw new Error("disk");
  });
  const rejected = expect(failed).rejects.toThrow("disk");
  const last = queue.run(async () => {
    order.push("last");
  });
  let drained = false;
  const drain = queue.suspend().then(() => {
    drained = true;
  });
  await expect(
    queue.run(async () => {
      order.push("rejected");
    }),
  ).rejects.toThrow("library is changing");
  expect(drained).toBe(false);
  release.resolve();
  await Promise.all([first, rejected, last, drain]);
  expect(order).toEqual(["first", "failed", "last"]);
  expect(drained).toBe(true);
  queue.resume();
  await queue.run(async () => {
    order.push("new library");
  });
  expect(order.at(-1)).toBe("new library");
});

it("keeps nested metadata writes in their admitted scope while shutdown waits", async () => {
  const queue = createMutationQueue();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const order: Array<string> = [];
  const write = queue.run(async () => {
    entered.resolve();
    await release.promise;
    await queue.run(async () => {
      order.push("nested index update");
    });
    order.push("metadata persisted");
  });
  await entered.promise;
  const stopped = queue.suspend().then(() => order.push("stopped"));
  release.resolve();
  await Promise.all([write, stopped]);
  expect(order).toEqual([
    "nested index update",
    "metadata persisted",
    "stopped",
  ]);
});
