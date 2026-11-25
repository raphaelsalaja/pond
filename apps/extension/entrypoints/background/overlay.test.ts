import { expect, it, vi } from "vitest";
import { createOverlayTransport, type OverlayMessage } from "./overlay";

const toast = { id: "a", status: "saved" as const, title: "T" };
const message: OverlayMessage = {
  request: { view: "toast", toast },
  appearance: { theme: null, mode: null },
};

function setup() {
  const send =
    vi.fn<(msg: OverlayMessage, tabId: number) => Promise<boolean>>();
  const inject = vi.fn(async (_tabId: number) => {});
  const transport = createOverlayTransport({
    send,
    inject,
    sleep: () => Promise.resolve(),
  });
  return { transport, send, inject };
}

it("delivers without injecting when the overlay already answers", async () => {
  const { transport, send, inject } = setup();
  send.mockResolvedValue(true);

  await expect(transport.show(1, message)).resolves.toBe(true);
  expect(inject).not.toHaveBeenCalled();
});

it("injects once and retries until the listener answers", async () => {
  const { transport, send, inject } = setup();
  send
    .mockRejectedValueOnce(new Error("no receiver"))
    .mockRejectedValueOnce(new Error("listener not ready"))
    .mockResolvedValue(true);

  await expect(transport.show(1, message)).resolves.toBe(true);
  expect(inject).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledTimes(3);
});

it("injects once when captures race on a cold page", async () => {
  const { transport, send, inject } = setup();
  send.mockRejectedValueOnce(new Error("no receiver")).mockResolvedValue(true);

  const [first, second] = await Promise.all([
    transport.show(1, message),
    transport.show(1, message),
  ]);
  expect(first).toBe(true);
  expect(second).toBe(true);
  expect(inject).toHaveBeenCalledOnce();
});

it("serializes different tabs independently", async () => {
  const { transport, send, inject } = setup();
  send.mockRejectedValue(new Error("no receiver"));

  const [first, second] = await Promise.all([
    transport.show(1, message),
    transport.show(2, message),
  ]);
  expect(first).toBe(false);
  expect(second).toBe(false);
  expect(inject).toHaveBeenCalledTimes(2);
});

it("falls back when the page refuses the script", async () => {
  const { transport, send, inject } = setup();
  send.mockRejectedValue(new Error("no receiver"));
  inject.mockRejectedValue(new Error("cannot script"));

  await expect(transport.show(1, message)).resolves.toBe(false);
});
