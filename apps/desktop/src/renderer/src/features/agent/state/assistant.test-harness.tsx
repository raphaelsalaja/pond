import type { AgentStreamEvent } from "@shared/agent-stream";
import { agentStreamRequest } from "@shared/assistant";
import type { AgentStreamRequest } from "@shared/assistant";
import { DEFAULT_FISH_ID } from "@shared/fish-contracts";
import type { QueryResult } from "@shared/query-contracts";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAssistant } from "./assistant";
import type { AssistantState } from "./assistant";

export interface StreamReply {
  error?: string;
  text?: string | Array<string>;
  waitForTextChunk?: () => Promise<void>;
}

type ChatRow = QueryResult<"agent.chats">[number];
type MessageRow = QueryResult<"agent.messages">[number];

export function chatRow(id: string, title: string | null = null): ChatRow {
  return {
    id,
    title,
    fishId: DEFAULT_FISH_ID,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function messageRow(
  message: Pick<MessageRow, "id" | "chatId" | "content"> & Partial<MessageRow>,
): MessageRow {
  return {
    role: "assistant",
    metadata: null,
    createdAt: new Date(0),
    ...message,
  };
}

/** Records each agent stream request and resolves `request(n)` once the nth one arrives. */
export function streamRequests() {
  const requests: Array<AgentStreamRequest> = [];
  const arrivals: Array<PromiseWithResolvers<void>> = [];
  const arrival = (index: number) => {
    const existing = arrivals[index];
    if (existing) {
      return existing;
    }
    const created = Promise.withResolvers<void>();
    arrivals[index] = created;
    return created;
  };
  return {
    requests,
    record(request: AgentStreamRequest) {
      requests.push(request);
      arrival(requests.length - 1).resolve();
    },
    request(count: number) {
      return arrival(count - 1).promise;
    },
  };
}

export function agentStreamBridge(
  reply: (request: AgentStreamRequest) => StreamReply | Promise<StreamReply>,
): typeof window.pond.agentStream {
  return (body, receive: (event: AgentStreamEvent) => void) => {
    const request = agentStreamRequest.parse(body);
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "start" });
          const result = await reply(request);
          if (result.error) {
            writer.write({ type: "error", errorText: result.error });
            return;
          }
          const text = Array.isArray(result.text)
            ? result.text
            : result.text
              ? [result.text]
              : [];
          if (text.length) {
            writer.write({ type: "text-start", id: "text" });
            for (let index = 0; index < text.length; index++) {
              writer.write({
                type: "text-delta",
                id: "text",
                delta: text[index] ?? "",
              });
              if (index < text.length - 1) {
                await result.waitForTextChunk?.();
              }
            }
            writer.write({ type: "text-end", id: "text" });
          }
          writer.write({ type: "finish", finishReason: "stop" });
        },
      }),
    });
    const reader = response.body?.getReader();
    let closed = false;
    void (async () => {
      try {
        while (!closed && reader) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          receive({ type: "data", data: Array.from(value) });
        }
        if (!closed) {
          receive({ type: "end" });
        }
      } catch (error) {
        if (!closed) {
          receive({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Could not read this reply.",
          });
        }
      }
    })();
    return () => {
      closed = true;
      void reader?.cancel();
    };
  };
}

function Probe<Snapshot extends object>({
  select,
}: {
  select: (state: AssistantState) => Snapshot | null;
}) {
  const state = useAssistant();
  const snapshot = select(state);
  return snapshot ? <output>{JSON.stringify(snapshot)}</output> : null;
}

export function createAssistantHarness<Snapshot extends object>(
  select: (state: AssistantState) => Snapshot | null,
) {
  const host = document.createElement("div");
  const root = createRoot(host);

  return {
    host,
    async mount() {
      await act(async () => root.render(<Probe select={select} />));
    },
    async hide() {
      await act(async () => root.render(null));
    },
    async unmount(settle?: () => void | Promise<void>) {
      await act(async () => {
        await settle?.();
        root.unmount();
      });
    },
  };
}
