import { IconCircleDashedClock } from "@pond/icons";
import { Badge, Button, Keyboard } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { DEFAULT_FISH_ID, type FishSummary } from "@shared/fish-contracts";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { CodeBlock } from "@/features/agent/components/code-block";
import { ComposerView } from "@/features/agent/components/composer-view";
import { ErrorNotice } from "@/features/agent/components/error-notice";
import { AddMenu } from "@/features/agent/components/pane/add-menu";
import { AgentMessage } from "@/features/agent/components/pane/agent-message";
import { ChatEvent } from "@/features/agent/components/pane/chat-event";
import { FileAttachments } from "@/features/agent/components/pane/file-attachments";
import { KoiQuestion } from "@/features/agent/components/pane/question";
import { QueuedMessage } from "@/features/agent/components/pane/queued-message";
import { ResponseError } from "@/features/agent/components/pane/response-error";
import { ChangeReview } from "@/features/agent/components/pane/review";
import { RoutineEvents } from "@/features/agent/components/pane/routine-events";
import {
  SaveCitation,
  SourceThumbnail,
} from "@/features/agent/components/pane/save-preview";
import { RunStatus } from "@/features/agent/components/run-status";
import type { AssistantState } from "@/features/agent/state/assistant";
import { toUIMessage } from "@/features/agent/state/pond-messages";
import { FishMark, fishAccent, useFish } from "@/features/fish";
import { FishActivity } from "@/features/fish/components/profile/activity";
import { RoutineList } from "@/features/fish/components/profile/routine-list";
import { ModelPicker } from "@/shared/components/model-picker";
import {
  CARDS_REPLY,
  changes,
  citedReply,
  FILES,
  idle,
  lookupReply,
  MARKDOWN_REPLY,
  MULTI_REPLY,
  message,
  purge,
  QUESTION,
  SAMPLE_SOURCES,
  STOPPED_STEPS,
  SUGGESTIONS,
  sampleFish,
} from "./fixtures";
import styles from "./styles.module.css";

const ROOT = "/Users/raphaelsalaja/Developer/pond";
const APP = "apps/desktop/src/renderer/src";
const AGENT = `${APP}/features/agent/components`;
const PANE = `${AGENT}/pane`;
const UI = "packages/ui/src";

/** Lab cards run no real work; every action resolves without touching the library. */
const noop = async () => undefined;

interface EntryProps {
  component: string;
  state: string;
  source: string;
  force?: string;
  children: ReactNode;
}

/** React 19 assigns props as properties on defined elements, and these are getter-only, so set them as attributes. */
function Entry({ component, state, source, force, children }: EntryProps) {
  return (
    <lab-entry
      className={styles.entry}
      ref={(node) => {
        node?.setAttribute("component", component);
        node?.setAttribute("state", state);
        node?.setAttribute("source", source);
        if (force) node?.setAttribute("force", force);
      }}
    >
      {children}
    </lab-entry>
  );
}

/** Real Saves from Koi's chats give the cards real covers; samples stand in on an empty library. */
function useLabSaves(): AssistantSource[] {
  const { data } = useQuery({
    queryKey: ["lab.fishSaves"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const chats = await window.pond.query("agent.chats", {
        fishId: DEFAULT_FISH_ID,
      });
      const found = new Map<string, AssistantSource>();
      for (const chat of chats.slice(0, 20)) {
        const rows = await window.pond.query("agent.messages", {
          chatId: chat.id,
        });
        for (const row of rows)
          for (const source of row.metadata?.sources ?? [])
            found.set(source.id, source);
        if (found.size >= 6) break;
      }
      return [...found.values()].slice(0, 6);
    },
  });
  return data && data.length >= 3 ? data : SAMPLE_SOURCES;
}

function Reply({
  id,
  role = "assistant",
  content,
  metadata,
  state = idle,
  streaming = false,
  avatar,
}: {
  id: string;
  role?: "user" | "assistant";
  content: string;
  metadata?: Parameters<typeof message>[3];
  state?: AssistantState;
  streaming?: boolean;
  avatar?: ReactNode;
}) {
  return (
    <AgentMessage
      message={toUIMessage(message(id, role, content, metadata))}
      state={state}
      provider="openai"
      attachedIds={[]}
      attach={() => undefined}
      streaming={streaming}
      latest
      onAnswer={noop}
      onSuggest={() => undefined}
      onRegenerate={() => undefined}
      avatar={avatar ? () => avatar : undefined}
    />
  );
}

function MessageEntries({
  sources,
  fish,
}: {
  sources: AssistantSource[];
  fish: FishSummary | undefined;
}) {
  const source = `${APP}/features/agent/components/pane/agent-message.tsx`;
  const mark = fish ? (
    <FishMark color={fish.color} species={fish.species} activity="thinking" />
  ) : null;
  return (
    <>
      <Entry component="Message" state="Yours" source={source}>
        <Reply id="you" role="user" content="Find me some poster grids" />
      </Entry>
      <Entry component="Message" state="Yours With Files" source={source}>
        <Reply
          id="you-files"
          role="user"
          content="Use these as a reference"
          metadata={{ files: FILES }}
        />
      </Entry>
      <Entry component="Message" state="Reply" source={source}>
        <Reply id="reply" content="Found 6 Saves that fit. Most are poster grids from Are.na." />
      </Entry>
      <Entry
        component="Message"
        state="Reply, Hover"
        source={`${UI}/message/message-actions.tsx`}
        force="hover"
      >
        <Reply id="reply-hover" content="Hover shows Copy, Quote and Retry." />
      </Entry>
      <Entry component="Message" state="Reply In Three" source={source}>
        <Reply id="reply-multi" content={MULTI_REPLY} />
      </Entry>
      <Entry component="Message" state="Markdown" source={source}>
        <Reply id="reply-markdown" content={MARKDOWN_REPLY} />
      </Entry>
      <Entry component="Message" state="Citations" source={source}>
        <Reply
          id="reply-cited"
          content={citedReply(sources)}
          metadata={{ sources }}
        />
      </Entry>
      <Entry component="Message" state="Save Cards" source={`${PANE}/save-cards/index.tsx`}>
        <Reply
          id="reply-cards"
          content={CARDS_REPLY}
          metadata={{
            sources,
            results: [
              {
                title: "Poster grids",
                saveIds: sources.map((source) => source.id),
              },
            ],
            suggestions: SUGGESTIONS,
          }}
        />
      </Entry>
      <Entry component="Message" state="Lookup Result" source={`${PANE}/save-cards/index.tsx`}>
        <Reply
          id="reply-lookup"
          content={lookupReply(sources)}
          metadata={{ sources }}
        />
      </Entry>
      <Entry component="Message" state="Stopped" source={source}>
        <Reply
          id="reply-stopped"
          content="I'd started tagging when you"
          metadata={{ steps: STOPPED_STEPS, stopped: true }}
        />
      </Entry>
      <Entry component="Message" state="Working" source={source}>
        <Reply
          id="reply-working"
          content=""
          streaming
          avatar={mark}
          state={{ ...idle, busy: true, activity: "searching" }}
        />
      </Entry>
    </>
  );
}

function StatusEntries({ fish }: { fish: FishSummary | undefined }) {
  const source = `${AGENT}/run-status/index.tsx`;
  const mark = (activity: "thinking" | "searching") =>
    fish ? (
      <FishMark color={fish.color} species={fish.species} activity={activity} />
    ) : null;
  return (
    <>
      <Entry component="Run Status" state="Thinking" source={source}>
        <RunStatus icon={mark("thinking")}>Thinking</RunStatus>
      </Entry>
      <Entry component="Run Status" state="Tool Running" source={source}>
        <RunStatus icon={mark("searching")}>Searching your library</RunStatus>
      </Entry>
    </>
  );
}

function ReviewEntries({ sources }: { sources: AssistantSource[] }) {
  const source = `${PANE}/review/index.tsx`;
  const all = changes(sources);
  const review = (id: string, list = all) => (
    <ChangeReview messageId={`lab-${id}`} changes={list} perform={noop} />
  );
  return (
    <>
      <Entry component="Review" state="One Change" source={source}>
        {review("one", all.slice(0, 1))}
      </Entry>
      <Entry component="Review" state="Five Changes" source={source}>
        {review("five")}
      </Entry>
      <Entry component="Review" state="Partly Decided" source={source}>
        {review(
          "partial",
          changes(sources, ["applied", "dismissed", "pending", "pending", "pending"]),
        )}
      </Entry>
      <Entry component="Review" state="Row Failed" source={source}>
        {review(
          "failed",
          all.slice(0, 2).map((change, index) =>
            index ? change : { ...change, error: "This Save was deleted." },
          ),
        )}
      </Entry>
      <Entry component="Review" state="Applied" source={source}>
        {review("applied", changes(sources, Array(5).fill("applied")))}
      </Entry>
      <Entry component="Review" state="Applied And Dismissed" source={source}>
        {review(
          "mixed",
          changes(sources, ["applied", "applied", "dismissed", "applied", "dismissed"]),
        )}
      </Entry>
      <Entry component="Review" state="All Dismissed" source={source}>
        {review("dismissed", changes(sources, Array(5).fill("dismissed")))}
      </Entry>
      <Entry component="Review" state="Undone" source={source}>
        {review("undone", changes(sources, Array(5).fill("undone")))}
      </Entry>
      <Entry component="Trash" state="Pending" source={source}>
        {review("trash", [purge("pending")])}
      </Entry>
      <Entry component="Trash" state="Emptied" source={source}>
        {review("trash-done", [purge("applied")])}
      </Entry>
      <Entry component="Trash" state="Kept" source={source}>
        {review("trash-kept", [purge("dismissed")])}
      </Entry>
    </>
  );
}

function QuestionEntries() {
  const source = `${PANE}/question/index.tsx`;
  return (
    <>
      <Entry component="Question" state="Open" source={source}>
        <KoiQuestion {...QUESTION} onAnswer={noop} />
      </Entry>
      <Entry component="Question" state="Recommended" source={source}>
        <KoiQuestion {...QUESTION} recommended={0} onAnswer={noop} />
      </Entry>
      <Entry component="Question" state="Long Options" source={source}>
        <KoiQuestion
          question="Your Inbox has 48 Saves from three sources. What should I do with them?"
          options={[
            "File each into the folder that fits it best",
            "Tag them by topic and leave them in the Inbox",
            "Move anything older than a month to Trash",
          ]}
          recommended={1}
          onAnswer={noop}
        />
      </Entry>
      <Entry component="Question" state="Answered" source={source}>
        <KoiQuestion {...QUESTION} answered="By project" onAnswer={noop} />
      </Entry>
      <Entry component="Question" state="Older" source={source}>
        <KoiQuestion {...QUESTION} disabled onAnswer={noop} />
      </Entry>
    </>
  );
}

function InlineEntries({
  sources,
  fish,
}: {
  sources: AssistantSource[];
  fish: FishSummary | undefined;
}) {
  const [first, second] = sources as [AssistantSource, AssistantSource];
  return (
    <>
      <Entry component="Queued Message" state="Short" source={`${PANE}/queued-message/index.tsx`}>
        <QueuedMessage content="Also tag them grid" onSendNow={() => undefined} onRemove={() => undefined} />
      </Entry>
      <Entry component="Queued Message" state="Long" source={`${PANE}/queued-message/index.tsx`}>
        <QueuedMessage
          content="When you're done, move every poster grid into Inspiration and give the best three a rating of five"
          onSendNow={() => undefined}
          onRemove={() => undefined}
        />
      </Entry>
      <Entry component="Chat Event" state="Routine Ran" source={`${PANE}/chat-event/index.tsx`}>
        <ChatEvent icon={<IconCircleDashedClock size={12} />}>
          {`${fish?.name ?? "Koi"} ran "Morning Tidy"`}
        </ChatEvent>
      </Entry>
      <Entry component="Chat Event" state="Routine Changes" source={`${PANE}/routine-events.tsx`}>
        <RoutineEvents
          events={[
            { kind: "created", fishId: DEFAULT_FISH_ID, routineId: "tidy", name: "Morning Tidy" },
            { kind: "updated", fishId: DEFAULT_FISH_ID, routineId: "inbox", name: "Inbox Sweep" },
            { kind: "deleted", fishId: DEFAULT_FISH_ID, routineId: "old", name: "Old Digest" },
          ]}
        />
      </Entry>
      <Entry component="Error" state="With Retry" source={`${AGENT}/error-notice/index.tsx`}>
        <ErrorNotice onRetry={() => undefined}>
          The connection dropped before the reply finished.
        </ErrorNotice>
      </Entry>
      <Entry component="Error" state="No Credits" source={`${PANE}/response-error/index.tsx`}>
        <ResponseError error="insufficient_quota, see platform.openai.com" />
      </Entry>
      <Entry component="Error" state="Rate Limited" source={`${PANE}/response-error/index.tsx`}>
        <ResponseError error="Rate limit reached" />
      </Entry>
      <Entry component="Error" state="Bad Key" source={`${PANE}/response-error/index.tsx`}>
        <ResponseError error="Invalid API key" />
      </Entry>
      <Entry component="File Attachments" state="Removable" source={`${PANE}/file-attachments/index.tsx`}>
        <FileAttachments files={FILES} onRemove={() => undefined} />
      </Entry>
      <Entry component="File Attachments" state="Sent" source={`${PANE}/file-attachments/index.tsx`}>
        <FileAttachments files={FILES} />
      </Entry>
      <Entry component="Save Citation" state="Inline" source={`${PANE}/save-preview/index.tsx`}>
        <p className={styles.prose}>
          The closest match is{" "}
          <SaveCitation source={first} reference={1} onOpenSave={() => undefined} />{" "}
          and{" "}
          <SaveCitation source={second} reference={2} onOpenSave={() => undefined} />.
        </p>
      </Entry>
      <Entry component="Save Citation" state="Compact" source={`${PANE}/save-preview/index.tsx`}>
        <p className={styles.prose}>
          See{" "}
          <SaveCitation source={first} reference={1} onOpenSave={() => undefined} compact />
        </p>
      </Entry>
      <Entry component="Source Thumbnail" state="Square" source={`${PANE}/save-preview/index.tsx`}>
        <div className={styles.row}>
          {sources.slice(0, 4).map((source) => (
            <SourceThumbnail key={source.id} id={source.id} source={source} />
          ))}
        </div>
      </Entry>
      <Entry component="Source Thumbnail" state="Compact" source={`${PANE}/save-preview/index.tsx`}>
        <div className={styles.row}>
          {sources.slice(0, 4).map((source) => (
            <SourceThumbnail key={source.id} id={source.id} source={source} size="compact" />
          ))}
        </div>
      </Entry>
      <Entry component="Code Block" state="TypeScript" source={`${AGENT}/code-block/index.tsx`}>
        <CodeBlock.Root
          language="ts"
          code={'const tags = ["typography", "grid"];\nawait pond.tag(saves, tags);'}
        />
      </Entry>
    </>
  );
}

function ComposerEntries() {
  const source = `${AGENT}/composer-view/index.tsx`;
  const composer = (
    props: Partial<Parameters<typeof ComposerView>[0]>,
  ) => (
    <ComposerView
      placeholder="Message Koi"
      empty
      onSend={() => undefined}
      onStop={() => undefined}
      leading={
        <AddMenu onAttach={() => undefined} onAddSaves={() => undefined} />
      }
      toolbar={
        <ModelPicker provider="openai" modelId="gpt-5" onChange={() => undefined} />
      }
      {...props}
    />
  );
  return (
    <>
      <Entry component="Composer" state="Empty" source={source}>
        {composer({})}
      </Entry>
      <Entry component="Composer" state="Typed" source={source}>
        {composer({
          empty: false,
          inputProps: { defaultValue: "Tag these as typography" },
        })}
      </Entry>
      <Entry component="Composer" state="Running" source={source}>
        {composer({ running: true, empty: false })}
      </Entry>
      <Entry component="Composer" state="With Files" source={source}>
        {composer({
          empty: false,
          attached: true,
          children: <FileAttachments files={FILES} onRemove={() => undefined} />,
        })}
      </Entry>
    </>
  );
}

function ProfileEntries({ fish }: { fish: FishSummary }) {
  const sample = sampleFish(fish);
  const profile = `${APP}/features/fish/components/profile`;
  return (
    <>
      <Entry component="Routines" state="Sample" source={`${profile}/routine-list/index.tsx`}>
        <div>
          <RoutineList fish={sample} />
        </div>
      </Entry>
      <Entry component="Routines" state={`${fish.name}'s`} source={`${profile}/routine-list/index.tsx`}>
        <div>
          <RoutineList fish={fish} />
        </div>
      </Entry>
      <Entry component="Activity" state="Sample" source={`${profile}/activity/index.tsx`}>
        <div>
          <FishActivity fish={sample} />
        </div>
      </Entry>
      <Entry component="Activity" state="No Runs" source={`${profile}/activity/index.tsx`}>
        <div>
          <FishActivity fish={{ ...sample, runs: [], lastRun: null }} />
        </div>
      </Entry>
    </>
  );
}

function PrimitiveEntries() {
  return (
    <>
      <Entry component="Keyboard" state="Inline In Buttons" source={`${UI}/keyboard/index.tsx`}>
        <div className={styles.row}>
          <Button size="sm" rounding="rounded" variant="secondary">
            Dismiss All
            <Keyboard.Shortcut density="inline" aria-hidden>
              Esc
            </Keyboard.Shortcut>
          </Button>
          <Button size="sm" rounding="rounded">
            Apply All
            <Keyboard.Shortcut density="inline" aria-hidden>
              {["⌘", "↵"]}
            </Keyboard.Shortcut>
          </Button>
        </div>
      </Entry>
      <Entry component="Keyboard" state="Default" source={`${UI}/keyboard/index.tsx`}>
        <div className={styles.row}>
          <Keyboard.Shortcut>{["⌘", "K"]}</Keyboard.Shortcut>
          <Keyboard.Shortcut>1</Keyboard.Shortcut>
          <Keyboard.Shortcut>Esc</Keyboard.Shortcut>
        </div>
      </Entry>
      <Entry component="Badge Dot" state="Tones" source={`${UI}/badge/index.tsx`}>
        <div className={styles.row}>
          <Badge.Dot />
          <Badge.Dot tone="accent" />
          <Badge.Dot tone="negative" />
          <Badge.Dot tone="accent" live />
        </div>
      </Entry>
      <Entry component="Button" state="Card Footer" source={`${UI}/button/index.tsx`}>
        <div className={styles.row}>
          <Button size="sm" rounding="rounded" variant="secondary">
            Later
          </Button>
          <Button size="sm" rounding="rounded" variant="destructive">
            Empty Trash
          </Button>
          <Button size="xs" rounding="rounded" variant="secondary">
            Undo
          </Button>
        </div>
      </Entry>
    </>
  );
}

export function FishLab() {
  useEffect(() => {
    void import("../download/lab.js");
  }, []);
  const fish = useFish(DEFAULT_FISH_ID);
  const sources = useLabSaves();
  return (
    <div className={styles.page} {...(fish ? fishAccent(fish.color) : null)}>
      <lab-page title="Fish" root={ROOT}>
        <lab-tune
          ref={(node) => {
            node?.setAttribute("property", "--lab-column");
            node?.setAttribute("label", "Column Width");
            node?.setAttribute("min", "280");
            node?.setAttribute("max", "720");
            node?.setAttribute("value", "440");
            node?.setAttribute("format", "{}px");
          }}
        />
        <MessageEntries sources={sources} fish={fish} />
        <StatusEntries fish={fish} />
        <ReviewEntries sources={sources} />
        <QuestionEntries />
        <InlineEntries sources={sources} fish={fish} />
        <ComposerEntries />
        {fish ? <ProfileEntries fish={fish} /> : null}
        <PrimitiveEntries />
      </lab-page>
    </div>
  );
}
