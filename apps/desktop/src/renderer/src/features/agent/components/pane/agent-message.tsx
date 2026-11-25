import { useTextReveal } from "@pond/ui";
import { Message } from "@pond/ui/message";
import type {
  AssistantActivity,
  AssistantProvider,
  AssistantSource,
} from "@shared/assistant";
import { MESSAGE_BREAK, splitMessages } from "@shared/assistant-text";
import { type ReactNode, useRef } from "react";
import {
  type AssistantState,
  assistant,
} from "@/features/agent/state/assistant";
import {
  fromUIMessage,
  messageText,
  type PondUIMessage,
  partData,
} from "@/features/agent/state/pond-messages";
import { openSave } from "@/features/saves/navigation";
import { RunStatus } from "../run-status";
import { currentActivityLabel } from "./activity-label";
import { AssistantResponse } from "./assistant-response";
import { FileAttachments } from "./file-attachments";
import { inferredLookupResult, ResponseExtras } from "./response-content";

async function copyText(text: string): Promise<void> {
  const result = await window.pond.query("clipboard.writeText", { text });
  if (!result.ok) throw new Error(result.error);
}

export function AgentMessage({
  message,
  state,
  provider,
  attachedIds,
  attach,
  streaming,
  entering = false,
  latest,
  onAnswer,
  onRegenerate,
  avatar,
}: {
  message: PondUIMessage;
  state: AssistantState;
  provider: AssistantProvider;
  attachedIds: string[];
  attach: (sources: AssistantSource[]) => void;
  streaming: boolean;
  entering?: boolean;
  latest: boolean;
  onAnswer: (messageId: string, answer: string) => Promise<void>;
  /** Only the latest settled reply can run again. */
  onRegenerate?: () => void;
  avatar?: (activity: AssistantActivity) => ReactNode;
}) {
  const domain = fromUIMessage(message, state.chatId ?? "pending");
  const text = messageText(message);
  const finished = Boolean(domain.metadata?.stopped || domain.metadata?.error);
  const reveal = useTextReveal(
    text,
    message.role === "assistant" && streaming,
    finished,
  );
  const responseText = message.role === "assistant" ? reveal.text : text;
  const settled = !streaming && !reveal.pending;
  const saved = domain.metadata?.messages;
  const bubbles =
    message.role !== "assistant"
      ? []
      : settled && saved?.length
        ? saved
        : splitMessages(responseText);
  const animatedResponse = useRef(false);
  if (message.role === "assistant" && (streaming || reveal.pending))
    animatedResponse.current = true;
  const steps = partData(message, "pond-steps") ?? state.steps;
  const activity =
    partData(message, "pond-activity")?.activity ?? state.activity;
  const showActivity =
    message.role === "assistant" &&
    streaming &&
    (!text ||
      text.trimEnd().endsWith(MESSAGE_BREAK) ||
      steps.some((step) => step.status === "running"));
  const sources = domain.metadata?.sources?.length
    ? domain.metadata.sources
    : streaming
      ? state.sources
      : [];
  const extras = {
    ...domain,
    metadata: {
      ...domain.metadata,
      sources: sources.length ? sources : domain.metadata?.sources,
      steps:
        streaming && state.steps.length ? state.steps : domain.metadata?.steps,
    },
  };
  const attachments =
    domain.metadata?.attachments ??
    (message.role === "user"
      ? state.messages.find((row) => row.id === message.id)?.metadata
          ?.attachments
      : undefined);
  const actionBar =
    message.role === "assistant" && (!text || !settled) ? null : (
      <Message.ActionBar
        text={message.role === "assistant" ? bubbles.join("\n\n") : text}
        onCopy={copyText}
        onQuote={() => {
          if (sources.length) attach(sources);
          else if (text) assistant.quote(text);
        }}
        onRetry={
          message.role === "assistant" &&
          !domain.metadata?.changes?.some(
            (change) => change.status === "applied",
          )
            ? onRegenerate
            : undefined
        }
      />
    );
  return (
    <Message.View
      animateEntrance={entering}
      from={message.role === "user" ? "user" : "assistant"}
      footer={
        message.role === "assistant" && settled ? (
          <ResponseExtras
            message={extras}
            questionAnswer={
              state.messages.find(
                (reply) => reply.metadata?.replyToQuestion === extras.id,
              )?.content
            }
            questionDisabled={state.busy || state.loading || !latest}
            provider={provider}
            attachedIds={attachedIds}
            busy={state.busy}
            attach={attach}
            onAnswer={(answer) => onAnswer(extras.id, answer)}
          />
        ) : null
      }
      actions={actionBar}
    >
      {message.role === "user" ? (
        <FileAttachments files={domain.metadata?.files ?? []} />
      ) : null}
      {message.role === "assistant" &&
      inferredLookupResult(text, sources) ? null : responseText ? (
        message.role === "assistant" ? (
          bubbles.map((bubble, index) => (
            <Message.Bubble
              // biome-ignore lint/suspicious/noArrayIndexKey: messages only ever append, so position is their identity.
              key={index}
            >
              <AssistantResponse
                content={bubble}
                streaming={animatedResponse.current}
                sources={sources}
                onOpenSave={openSave}
              />
            </Message.Bubble>
          ))
        ) : (
          <Message.Bubble>
            <AssistantResponse
              content={responseText}
              sources={attachments ?? []}
              onOpenSave={openSave}
            />
          </Message.Bubble>
        )
      ) : null}
      {showActivity ? (
        <RunStatus icon={avatar?.(activity)}>
          {currentActivityLabel(activity, steps)}
        </RunStatus>
      ) : null}
    </Message.View>
  );
}
