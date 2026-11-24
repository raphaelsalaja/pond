import { DefaultChatTransport } from "ai";
import { z } from "zod";
import type { PondUIMessage } from "./pond-messages";

const requestId = z.object({ requestId: z.string().min(1) });

export async function ipcChatFetch(
  _input: RequestInfo | URL,
  init?: RequestInit,
) {
  const signal = init?.signal;
  signal?.throwIfAborted();
  let closePort: (() => void) | undefined;
  let settled = false;
  let abort: (() => void) | null = null;
  const cleanup = () => {
    if (abort) {
      signal?.removeEventListener("abort", abort);
    }
    closePort?.();
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error) {
          controller.error(error);
        } else {
          controller.close();
        }
      };
      abort = () =>
        finish(new DOMException("The request was aborted.", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      try {
        closePort = window.pond.agentStream(parseBody(init), (event) => {
          if (settled) {
            return;
          }
          if (event.type === "data") {
            controller.enqueue(new Uint8Array(event.data));
          } else {
            finish(event.type === "error" ? new Error(event.error) : undefined);
          }
        });
        if (settled) {
          cleanup();
        }
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Could not read this reply."),
        );
      }
    },
    cancel() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

export function parseBody(init?: RequestInit) {
  const raw = z.string().safeParse(init?.body);
  if (!raw.success) {
    return {};
  }
  try {
    const parsed = z
      .record(z.string(), z.json())
      .safeParse(JSON.parse(raw.data));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function pondChatTransport() {
  return new DefaultChatTransport<PondUIMessage>({
    api: "pond://agent",
    fetch: ipcChatFetch,
    prepareSendMessagesRequest: ({ id, messages, body }) => ({
      body: {
        ...body,
        chatId: id,
        messages,
        requestId:
          requestId.safeParse(body).data?.requestId ?? crypto.randomUUID(),
      },
    }),
  });
}
