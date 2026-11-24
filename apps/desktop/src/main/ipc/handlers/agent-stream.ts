import { ipcMain } from "electron";
import { agentStreamRequest } from "../../../shared/assistant";
import type { AgentStreamRequest } from "../../../shared/assistant";
import { IPC } from "../../../shared/constants";
import { isTrustedSender } from "../helpers";

type AgentStreamPayload = Parameters<typeof agentStreamRequest.safeParse>[0];

export function registerAgentStream(): void {
  ipcMain.on(IPC.agentStream, (event, payload: AgentStreamPayload) => {
    const port = event.ports[0];
    if (!port) {
      return;
    }
    port.start();
    if (!isTrustedSender(event)) {
      port.close();
      return;
    }
    const parsed = agentStreamRequest.safeParse(payload);
    if (!parsed.success) {
      void writeError(port, "Invalid request.");
      return;
    }
    const abort = new AbortController();
    port.on("close", () => {
      abort.abort();
      void stopAgentMessage(parsed.data.chatId, parsed.data.requestId);
    });
    abort.signal.addEventListener("abort", () => {
      void stopAgentMessage(parsed.data.chatId, parsed.data.requestId);
    });
    void reply(port, parsed.data, abort.signal);
  });
}

async function reply(
  port: Electron.MessagePortMain,
  input: AgentStreamRequest,
  signal: AbortSignal,
) {
  try {
    const { streamAgentTurn } = await import("../../core/agent/stream");
    const response = await streamAgentTurn(input);
    const body = response.body;
    if (!body) {
      await writeError(port, "Could not reply. Try again.");
      return;
    }
    const reader = body.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        port.postMessage(value);
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      await writeError(
        port,
        error instanceof Error ? error.message : "Could not reply. Try again.",
      );
    }
    return;
  }
  port.close();
}

async function writeError(port: Electron.MessagePortMain, message: string) {
  const { uiMessageErrorResponse } = await import("../../core/agent/stream");
  const response = uiMessageErrorResponse(message);
  const body = response.body;
  if (body) {
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        port.postMessage(value);
      }
    }
  }
  port.close();
}

async function stopAgentMessage(
  chatId: string,
  requestId: string,
): Promise<void> {
  const { stopMessage } = await import("../../core/agent/chat");
  stopMessage(chatId, requestId);
}
