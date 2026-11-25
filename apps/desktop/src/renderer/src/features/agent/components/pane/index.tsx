import { useChat } from "@ai-sdk/react";
import type { AgentModelOptions } from "@pond/schema";
import { Pane } from "@pond/ui";
import {
  agentModelOptionsFor,
  agentModelOptionsKey,
  runControlsForOptions,
} from "@shared/agent-model-options";
import {
  ASSISTANT_ACTIVITY_LABELS,
  ASSISTANT_MODELS,
  type AssistantActivity,
  type AssistantProvider,
  type AssistantSource,
} from "@shared/assistant";
import { DEFAULT_FISH_NAME, type FishColor } from "@shared/fish-contracts";
import { chosenModelId } from "@shared/provider-models";
import { MotionConfig, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useEffect, useRef } from "react";
import {
  type AssistantState,
  assistant,
  useAssistant,
} from "@/features/agent/state/assistant";
import { pondChatSession } from "@/features/agent/state/pond-chat";
import { fromUIMessage } from "@/features/agent/state/pond-messages";
import {
  FishMark,
  fishAccent,
  fishMood,
  fish as fishStore,
  useFish,
  useHydrateFish,
} from "@/features/fish";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { usePrefs } from "@/shared/state/prefs";
import type { ComposerEditorHandle } from "../composer";
import { Thread } from "../thread";
import { AgentMessage } from "./agent-message";
import { FishChatActions } from "./chat-actions";
import { ChatEvent } from "./chat-event";
import { routineEventText } from "./chat-event/events";
import { ComposeArea } from "./compose-area";
import { RoutineEvents } from "./routine-events";
import styles from "./styles.module.css";
import { timeBreaks, timeLabel, turnMarks } from "./timeline";

export { AgentMessage } from "./agent-message";

interface AgentPersona {
  name: string;
  icon: ReactNode;
  color?: FishColor;
  /** What the fish is doing right now, in this chat or a routine run; null while idle. */
  activity: AssistantActivity | null;
  avatar?: (activity: AssistantActivity) => ReactNode;
}

function AgentPaneContent({
  persona,
  state,
  provider,
  modelId,
  modelOptions,
  patchModel,
  patchModelOptions,
  reduceMotion,
}: {
  persona: AgentPersona;
  state: AssistantState;
  provider: AssistantProvider | "";
  modelId: string;
  modelOptions: AgentModelOptions;
  patchModel: (next: { provider: AssistantProvider; modelId: string }) => void;
  patchModelOptions: (next: AgentModelOptions) => void;
  reduceMotion: boolean;
}) {
  const input = useRef<ComposerEditorHandle>(null);
  const chat = pondChatSession(state.chatId ?? "draft");
  const { messages, status, error: chatError } = useChat({ chat });
  const running =
    status === "submitted" || status === "streaming" || state.busy;
  /** Only messages that first render mid-run pop in, so loaded history and post-run rehydration stay still. */
  const entering = useRef(new Map<string, boolean>());
  for (const message of messages) {
    if (!entering.current.has(message.id))
      entering.current.set(message.id, running);
  }
  const referenceMessage = state.messages.find(
    (message) => message.id === state.referenceMessageId,
  );
  const referenceSources = referenceMessage?.metadata?.sources;
  const retainedReferenceSources = useRef<AssistantSource[]>([]);
  if (referenceSources?.length)
    retainedReferenceSources.current = referenceSources;
  const attachedIds = state.attachments.map((source) => source.id);
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  const lastResponse = messages.find(
    (message) => message.id === lastAssistantId,
  );
  const lastMetadata = lastResponse
    ? fromUIMessage(lastResponse, state.chatId ?? "pending").metadata
    : undefined;
  const reviews = messages.flatMap((message) => {
    if (message.role !== "assistant") return [];
    const changes = fromUIMessage(message, state.chatId ?? "pending").metadata
      ?.changes;
    return changes?.length ? [{ messageId: message.id, changes }] : [];
  });
  const pending = reviews.findLast((row) =>
    row.changes.some((change) => change.status === "pending"),
  );
  const questionAnswered = state.messages.some(
    (message) => message.metadata?.replyToQuestion === lastAssistantId,
  );
  const requiredAction =
    lastMetadata?.question && !questionAnswered
      ? `${persona.name} needs your answer. Read the latest response to continue.`
      : pending?.messageId === lastAssistantId
        ? `${persona.name} has changes ready for review.`
        : undefined;

  const createdAt = new Map(
    state.messages.map((message) => [message.id, message.createdAt]),
  );
  const breaks = timeBreaks(
    messages.map((message) => createdAt.get(message.id)),
  );
  const now = new Date();
  const marks = turnMarks(messages, state.chatId ?? "pending", persona.name);

  function focus() {
    input.current?.focus();
  }
  useEffect(() => {
    if (state.focusRequest) requestAnimationFrame(() => input.current?.focus());
  }, [state.focusRequest]);
  function attach(sources: AssistantSource[]) {
    assistant.attach(sources);
    requestAnimationFrame(focus);
  }
  function submit(content = state.draft) {
    if (!provider || running) return;
    assistant.setDraft(content);
    void assistant.send(provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }
  function queue(content: string) {
    if (!provider) return;
    assistant.setDraft(content);
    void assistant.queue(provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }
  function regenerate() {
    if (!provider || running) return;
    void assistant.regenerate(provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }
  async function answerQuestion(messageId: string, answer: string) {
    if (!provider || running) return;
    await assistant.answerQuestion(messageId, answer, provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }

  const presence = persona.activity
    ? `${ASSISTANT_ACTIVITY_LABELS[persona.activity]}…`
    : running
      ? "Working…"
      : null;

  return (
    <MotionConfig
      reducedMotion={reduceMotion ? "always" : "never"}
      transition={{ type: "spring", duration: 0.22, bounce: 0 }}
    >
      <section
        className={styles.assistant}
        data-reduced-motion={reduceMotion || undefined}
        aria-label={persona.name}
        {...(persona.color ? fishAccent(persona.color) : null)}
      >
        <Pane.Header
          className={styles.header}
          title={
            <>
              <span className={styles["header-name"]}>{persona.name}</span>
              {presence ? (
                <span className={styles.status} role="status">
                  {presence}
                </span>
              ) : null}
            </>
          }
        >
          <FishChatActions />
        </Pane.Header>
        <div className={styles.workspace}>
          <Thread.Conversation
            key={state.chatId ?? "new"}
            className={styles.body}
            marks={marks}
            viewportProps={{ className: styles.viewport }}
            empty={
              state.loading ? <p role="status">Loading conversation</p> : null
            }
            composer={
              <ComposeArea
                name={persona.name}
                state={state}
                provider={provider}
                modelId={modelId}
                modelOptions={modelOptions}
                patchModel={patchModel}
                patchModelOptions={patchModelOptions}
                running={running}
                chatError={chatError}
                lastAssistantId={lastAssistantId}
                lastError={lastMetadata?.error}
                requiredAction={requiredAction}
                referencesOpen={Boolean(referenceSources?.length)}
                referenceSources={retainedReferenceSources.current}
                attachedIds={attachedIds}
                inputRef={input}
                focus={focus}
                attach={attach}
                submit={submit}
                queue={queue}
              />
            }
          >
            {messages.map((message, index) => {
              const metadata = fromUIMessage(
                message,
                state.chatId ?? "pending",
              ).metadata;
              const at = breaks[index] ? createdAt.get(message.id) : undefined;
              const stamp = at ? (
                <time className={styles.time} dateTime={at.toISOString()}>
                  {timeLabel(at, now)}
                </time>
              ) : null;
              if (message.role === "user" && metadata?.routine)
                return (
                  <Fragment key={message.id}>
                    {stamp}
                    <ChatEvent
                      icon={persona.icon}
                      data-thread-mark={message.id}
                    >
                      {routineEventText(persona.name, metadata.routine)}
                    </ChatEvent>
                  </Fragment>
                );
              return (
                <Fragment key={message.id}>
                  {stamp}
                  <article
                    className={styles.turn}
                    data-role={message.role}
                    data-thread-mark={
                      message.role === "user" ? message.id : undefined
                    }
                    aria-label={
                      message.role === "assistant"
                        ? `Response from ${persona.name}`
                        : "Your message"
                    }
                  >
                    <AgentMessage
                      message={message}
                      state={state}
                      provider={provider || ASSISTANT_MODELS[0].id}
                      attachedIds={attachedIds}
                      attach={attach}
                      streaming={
                        status === "streaming" &&
                        message.role === "assistant" &&
                        message.id === messages.at(-1)?.id
                      }
                      entering={entering.current.get(message.id) ?? false}
                      latest={message.id === lastAssistantId}
                      onAnswer={answerQuestion}
                      onRegenerate={
                        message.id === lastAssistantId && !running && provider
                          ? regenerate
                          : undefined
                      }
                      avatar={persona.avatar}
                    />
                  </article>
                  {message.role === "assistant" &&
                  metadata?.routineEvents?.length ? (
                    <RoutineEvents events={metadata.routineEvents} />
                  ) : null}
                </Fragment>
              );
            })}
          </Thread.Conversation>
        </div>
      </section>
    </MotionConfig>
  );
}

export function AgentPane() {
  const state = useAssistant();
  useHydrateFish();
  const fish = useFish(state.fishId);
  const persona: AgentPersona = {
    name: fish?.name ?? DEFAULT_FISH_NAME,
    color: fish?.color,
    activity: fish?.activity ?? null,
    icon: fish ? (
      <FishMark
        color={fish.color}
        species={fish.species}
        activity={fish.activity}
        mood={fishMood(fish)}
      />
    ) : null,
    avatar: fish
      ? (activity) => (
          <FishMark
            color={fish.color}
            species={fish.species}
            activity={activity}
            mood="busy"
            size={18}
          />
        )
      : undefined,
  };
  const [prefs, patchPrefs] = usePrefs("agent");
  const [preferences] = usePrefs("preferences");
  const systemReducedMotion = useReducedMotion();
  const reduceMotion =
    preferences.reduceMotion === "always" ||
    (preferences.reduceMotion !== "never" && Boolean(systemReducedMotion));
  const fishModel = fish?.model ?? null;
  const provider =
    fishModel?.provider ??
    ASSISTANT_MODELS.find((model) => model.id === prefs.languageModel)?.id ??
    "";
  const modelId = fishModel
    ? fishModel.modelId
    : provider
      ? chosenModelId(provider, prefs)
      : "";
  const modelOptions = agentModelOptionsFor(
    prefs.modelOptions,
    provider,
    modelId,
  );
  return (
    <AgentPaneContent
      persona={persona}
      state={state}
      provider={provider}
      modelId={modelId}
      modelOptions={modelOptions}
      patchModel={(next) => {
        if (fish && fishModel) {
          void fishStore.update(fish.id, { model: next }).catch((error) =>
            notify({
              id: "fish-model",
              title: `Couldn't change ${fish.name}'s model`,
              description: errorCopy(error, "Try again."),
            }),
          );
          return;
        }
        const update: Partial<typeof prefs> = {
          languageModel: next.provider,
          modelIds: { ...prefs.modelIds, [next.provider]: next.modelId },
        };
        if (next.provider === "ollama") update.ollamaModelId = next.modelId;
        if (next.provider === "lmstudio") update.lmstudioModelId = next.modelId;
        patchPrefs(update);
      }}
      patchModelOptions={(next) => {
        if (!provider || !modelId) return;
        patchPrefs({
          modelOptions: {
            ...prefs.modelOptions,
            [agentModelOptionsKey(provider, modelId)]: next,
          },
        });
      }}
      reduceMotion={reduceMotion}
    />
  );
}
