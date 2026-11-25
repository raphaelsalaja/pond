import type { AgentModelOptions } from "@pond/schema";
import { Button } from "@pond/ui";
import type { AssistantProvider, AssistantSource } from "@shared/assistant";
import { type RefObject, useRef, useState } from "react";
import {
  type AssistantState,
  assistant,
} from "@/features/agent/state/assistant";
import { isLibrarySaveDrag, saveDropIds } from "@/features/saves";
import { ModelPicker } from "@/shared/components/model-picker";
import { openSettings } from "@/shared/lib/open-settings";
import { ComposerEditor, type ComposerEditorHandle } from "../../composer";
import { ComposerView } from "../../composer-view";
import { ErrorNotice } from "../../error-notice";
import { useThreadScroll } from "../../thread";
import { AddMenu } from "../add-menu";
import { ReferencedSavesPopover } from "../consulted-saves";
import { FileAttachments } from "../file-attachments";
import { QueuedMessage } from "../queued-message";
import { ResponseAnnouncement } from "../response-announcement";
import styles from "./styles.module.css";

interface ComposeAreaProps {
  name: string;
  state: AssistantState;
  provider: AssistantProvider | "";
  modelId: string;
  modelOptions: AgentModelOptions;
  patchModel: (next: { provider: AssistantProvider; modelId: string }) => void;
  patchModelOptions: (next: AgentModelOptions) => void;
  running: boolean;
  chatError: Error | undefined;
  lastAssistantId: string | undefined;
  lastError: string | undefined;
  requiredAction: string | undefined;
  referencesOpen: boolean;
  referenceSources: AssistantSource[];
  attachedIds: string[];
  inputRef: RefObject<ComposerEditorHandle | null>;
  focus: () => void;
  attach: (sources: AssistantSource[]) => void;
  submit: (content?: string) => void;
  queue: (content: string) => void;
}

export function ComposeArea({
  name,
  state,
  provider,
  modelId,
  modelOptions,
  patchModel,
  patchModelOptions,
  running,
  chatError,
  lastAssistantId,
  lastError,
  requiredAction,
  referencesOpen,
  referenceSources,
  attachedIds,
  inputRef,
  focus,
  attach,
  submit,
  queue,
}: ComposeAreaProps) {
  const [dropping, setDropping] = useState(false);
  const composer = useRef<HTMLDivElement>(null);
  const { scrollToBottom } = useThreadScroll();
  function send(content?: string) {
    submit(content);
    void scrollToBottom();
  }
  return (
    <div className={styles["compose-area"]}>
      <ResponseAnnouncement
        key={state.chatId ?? `new:${state.fishId}`}
        running={running}
        responseId={lastAssistantId}
        requiredAction={requiredAction}
        error={state.error ?? chatError?.message ?? lastError}
      />
      <div className={styles.notices}>
        <QueuedMessage
          content={state.queued?.content ?? null}
          onSendNow={assistant.sendQueuedNow}
          onRemove={assistant.unqueue}
        />
        {!provider ? (
          <ErrorNotice
            title="Connect a provider in Settings before you can send."
            actions={
              <Button size="sm" onClick={() => openSettings("models")}>
                Open Settings
              </Button>
            }
          />
        ) : null}
        {state.error || chatError ? (
          <ErrorNotice
            title={
              state.error ??
              chatError?.message ??
              "Could not send this message."
            }
            onRetry={state.failed ? () => void assistant.retry() : undefined}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openSettings("agent-models")}
                >
                  Open Models
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={assistant.clearError}
                >
                  Dismiss
                </Button>
              </>
            }
          />
        ) : null}
      </div>
      <ReferencedSavesPopover
        open={referencesOpen}
        sources={referenceSources}
        attachedIds={attachedIds}
        anchorRef={composer}
        onAttach={attach}
        onClose={() => assistant.closeReferences()}
      />
      <div
        ref={composer}
        onDragEnterCapture={(event) => {
          if (!isLibrarySaveDrag(event.dataTransfer)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragOverCapture={(event) => {
          if (!isLibrarySaveDrag(event.dataTransfer)) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          setDropping(true);
        }}
        onDragLeaveCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setDropping(false);
        }}
        onDropCapture={(event) => {
          const ids = saveDropIds(event.dataTransfer);
          if (!ids.length) return;
          event.preventDefault();
          setDropping(false);
          void assistant.attachIds(ids);
          requestAnimationFrame(focus);
        }}
      >
        <ComposerView
          placeholder={`Message ${name}`}
          running={running}
          empty={
            !state.draft.trim() &&
            !state.attachments.length &&
            !state.files.length
          }
          attached={state.files.length > 0}
          data-dragging={dropping || undefined}
          onSend={() => send()}
          onStop={assistant.stop}
          leading={
            <AddMenu
              disabled={state.loading}
              onAttach={(files) => {
                assistant.attachFiles(files);
                requestAnimationFrame(focus);
              }}
              onAddSaves={() => inputRef.current?.mention()}
            />
          }
          toolbar={
            <ModelPicker
              provider={provider}
              modelId={modelId}
              options={modelOptions}
              disabled={running}
              onChange={patchModel}
              onOptionsChange={patchModelOptions}
            />
          }
          editor={
            <ComposerEditor
              key={state.chatId ?? `new:${state.fishId}`}
              ref={inputRef}
              value={state.draft}
              disabled={state.loading || !provider}
              running={running}
              placeholder={`Message ${name}`}
              attachments={state.attachments}
              anchorRef={composer}
              onChange={(value) => assistant.setDraft(value)}
              onSend={send}
              onQueue={queue}
              onAttach={attach}
              onRemove={(id) => assistant.removeAttachment(id)}
              onDropIds={(ids) => {
                void assistant.attachIds(ids);
                requestAnimationFrame(focus);
              }}
            />
          }
        >
          <FileAttachments
            files={state.files}
            onRemove={assistant.removeFile}
          />
        </ComposerView>
      </div>
    </div>
  );
}
