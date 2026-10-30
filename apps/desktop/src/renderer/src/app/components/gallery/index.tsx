import {
  IconCanvasFill,
  IconClockFill,
  IconImageFill,
  IconTagFill,
} from "@pond/icons";
import { Button, Empty, Toggle, ToggleGroup } from "@pond/ui";
import { Prompt } from "@pond/ui/prompt";
import type { AssistantChange } from "@shared/assistant";
import { createContext, type ReactNode, use, useEffect, useState } from "react";
import { KoiQuestion } from "@/features/agent/components/pane/question";
import { ChangeReview } from "@/features/agent/components/pane/review";
import type { ReviewPerform } from "@/features/agent/state/review";
import {
  DownloadsCompletedHidden,
  DownloadsEmpty,
} from "@/features/downloads/components/empty";
import {
  FolderEmpty,
  LibraryEmpty,
  LibrarySectionEmpty,
  TrashEmpty,
  UncategorizedEmpty,
} from "@/features/library/components/empty";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { FishGallery } from "./fish";
import {
  LONG_OPTIONS,
  QUESTION,
  reviewFixtures,
  type SampleSave,
} from "./fixtures";
import { PromptGallery } from "./prompts";
import styles from "./styles.module.css";

type Theme = "light" | "dark";
type ThemeMode = Theme | "both";

const WIDTHS = { pane: 360, chat: 480, wide: 640 } as const;
type Width = keyof typeof WIDTHS;

const Frames = createContext<{ themes: readonly Theme[]; width: number }>({
  themes: ["light"],
  width: WIDTHS.chat,
});

const answer = async () => {};

/** Real Saves give the tiles real covers; placeholders fill in when the library is empty. */
function useSampleSaves() {
  const [saves, setSaves] = useState<SampleSave[]>([]);
  useEffect(() => {
    let live = true;
    void window.pond
      .query("saves.listPage", { limit: 80 })
      .then((page) => {
        if (!live) return;
        setSaves(
          page.rows
            .filter((row) => row.mediaType?.startsWith("image"))
            .slice(0, 6)
            .map((row) => ({ id: row.id, title: row.title || "Untitled" })),
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return saves;
}

function Specimen({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: (theme: Theme) => ReactNode;
}) {
  const { themes, width } = use(Frames);
  return (
    <figure className={styles.specimen}>
      <figcaption className={styles.caption}>
        {label}
        {action}
      </figcaption>
      <div className={styles.frames}>
        {themes.map((theme) => (
          <div
            key={theme}
            className={styles.frame}
            data-theme={theme}
            style={{ width }}
          >
            {children(theme)}
          </div>
        ))}
      </div>
    </figure>
  );
}

function EmptyState({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return <Specimen label={label}>{() => children}</Specimen>;
}

function EmptyStates() {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Empty States</h2>
      <EmptyState label="Library">
        <LibraryEmpty />
      </EmptyState>
      <EmptyState label="Empty folder">
        <FolderEmpty />
      </EmptyState>
      <EmptyState label="Folder downloading">
        <FolderEmpty downloading={3} />
      </EmptyState>
      <EmptyState label="Uncategorized">
        <UncategorizedEmpty />
      </EmptyState>
      <EmptyState label="Untagged">
        <LibrarySectionEmpty mode="untagged" />
      </EmptyState>
      <EmptyState label="Recently Used">
        <LibrarySectionEmpty mode="recents" />
      </EmptyState>
      <EmptyState label="Recently Added">
        <LibrarySectionEmpty mode="recentlyAdded" />
      </EmptyState>
      <EmptyState label="Source">
        <LibrarySectionEmpty mode="source" />
      </EmptyState>
      <EmptyState label="Trash">
        <TrashEmpty />
      </EmptyState>
      <EmptyState label="No results">
        <MatchesEmpty onReset={() => undefined} />
      </EmptyState>
      <EmptyState label="Downloads">
        <DownloadsEmpty />
      </EmptyState>
      <EmptyState label="Downloads, completed hidden">
        <DownloadsCompletedHidden onShowCompleted={() => undefined} />
      </EmptyState>
      <EmptyState label="Tags">
        <Empty.Root>
          <Empty.Media>
            <IconTagFill size={32} />
          </Empty.Media>
          <Empty.Title>No tags yet</Empty.Title>
          <Empty.Description>
            Create your first tag to start organizing your library.
          </Empty.Description>
        </Empty.Root>
      </EmptyState>
      <EmptyState label="Combine Images">
        <Empty.Root>
          <Empty.Media>
            <IconImageFill size={32} />
          </Empty.Media>
          <Empty.Title>No images selected</Empty.Title>
          <Empty.Description>
            Drag images from your library to add them.
          </Empty.Description>
        </Empty.Root>
      </EmptyState>
      <EmptyState label="Canvas not found">
        <Empty.Root>
          <Empty.Media>
            <IconCanvasFill size={32} />
          </Empty.Media>
          <Empty.Title>Canvas not found</Empty.Title>
          <Empty.Description>
            It may have been deleted. Pick another canvas from the sidebar.
          </Empty.Description>
        </Empty.Root>
      </EmptyState>
      <EmptyState label="Fish runs">
        <Empty.Root>
          <Empty.Media>
            <IconClockFill size={32} />
          </Empty.Media>
          <Empty.Title>No runs yet</Empty.Title>
          <Empty.Description>
            Ask Koi in chat to set a routine, and its runs show up here.
          </Empty.Description>
        </Empty.Root>
      </EmptyState>
    </section>
  );
}

function Review({
  label,
  changes,
  disabled,
}: {
  label: string;
  changes: AssistantChange[];
  disabled?: boolean;
}) {
  return (
    <Specimen label={label}>
      {(theme) => (
        <ChangeReview
          messageId={`gallery:${label}:${theme}`}
          changes={changes}
          disabled={disabled}
        />
      )}
    </Specimen>
  );
}

const OUTCOMES = {
  apply: "applied",
  dismiss: "dismissed",
  undo: "undone",
} as const;

const settle = () => new Promise((resolve) => setTimeout(resolve, 900));

function LiveReview({ changes: initial }: { changes: AssistantChange[] }) {
  const [changes, setChanges] = useState(initial);
  const perform: ReviewPerform = async (_messageId, ids, action) => {
    await settle();
    setChanges((current) =>
      current.map((change) =>
        ids.includes(change.id)
          ? { ...change, status: OUTCOMES[action] }
          : change,
      ),
    );
  };
  return (
    <Specimen
      label="Review"
      action={
        <Button size="xs" variant="ghost" onClick={() => setChanges(initial)}>
          Reset
        </Button>
      }
    >
      {(theme) => (
        <ChangeReview
          messageId={`gallery:live:${theme}`}
          changes={changes}
          perform={perform}
        />
      )}
    </Specimen>
  );
}

function LiveQuestion() {
  const [answered, setAnswered] = useState<string>();
  const [round, setRound] = useState(0);
  return (
    <Specimen
      label="Question"
      action={
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setAnswered(undefined);
            setRound((value) => value + 1);
          }}
        >
          Reset
        </Button>
      }
    >
      {(theme) => (
        <KoiQuestion
          key={`${theme}:${round}`}
          {...QUESTION}
          answered={answered}
          onAnswer={async (value) => {
            await settle();
            setAnswered(value);
          }}
        />
      )}
    </Specimen>
  );
}

export function Gallery() {
  const [mode, setMode] = useState<ThemeMode>("both");
  const [width, setWidth] = useState<Width>("chat");
  const fixtures = reviewFixtures(useSampleSaves());
  const live = [...fixtures.several, ...fixtures.purge].map((change) => ({
    ...change,
    id: `live:${change.id}`,
  }));
  const themes: readonly Theme[] = mode === "both" ? ["light", "dark"] : [mode];

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <h1 className={styles.title}>Gallery</h1>
        <ToggleGroup
          aria-label="Theme"
          value={[mode]}
          onValueChange={(value) =>
            /** SAFETY: every Toggle in this group carries a ThemeMode value. */
            value[0] && setMode(value[0] as ThemeMode)
          }
        >
          <Toggle size="sm" value="light">
            Light
          </Toggle>
          <Toggle size="sm" value="dark">
            Dark
          </Toggle>
          <Toggle size="sm" value="both">
            Both
          </Toggle>
        </ToggleGroup>
        <ToggleGroup
          aria-label="Width"
          value={[width]}
          onValueChange={(value) =>
            /** SAFETY: every Toggle in this group carries a WIDTHS key. */
            value[0] && setWidth(value[0] as Width)
          }
        >
          <Toggle size="sm" value="pane">
            Pane
          </Toggle>
          <Toggle size="sm" value="chat">
            Chat
          </Toggle>
          <Toggle size="sm" value="wide">
            Wide
          </Toggle>
        </ToggleGroup>
      </header>

      <Frames value={{ themes, width: WIDTHS[width] }}>
        <div className={styles.scroll}>
          <FishGallery themes={themes} />
          <PromptGallery themes={themes} />
          <EmptyStates />

          <section className={styles.section}>
            <h2 className={styles.heading}>Live</h2>
            <LiveReview
              key={live.map((change) => change.id).join()}
              changes={live}
            />
            <LiveQuestion />
          </section>

          <section className={styles.section}>
            <h2 className={styles.heading}>Review</h2>
            <Review label="One change" changes={fixtures.single} />
            <Review label="Several changes" changes={fixtures.several} />
            <Review label="Failed change" changes={fixtures.failed} />
            <Review label="Mixed statuses" changes={fixtures.mixed} />
            <Review label="Library action" changes={fixtures.operation} />
            <Review
              label="Disabled while Koi runs"
              changes={fixtures.several}
              disabled
            />
            <Review label="All applied" changes={fixtures.applied} />
            <Review label="Applied and dismissed" changes={fixtures.decided} />
            <Review label="All dismissed" changes={fixtures.dismissed} />
            <Review label="Undone" changes={fixtures.undone} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.heading}>Empty Trash</h2>
            <Review label="Pending" changes={fixtures.purge} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.heading}>Question</h2>
            <Specimen label="Open">
              {() => <KoiQuestion {...QUESTION} onAnswer={answer} />}
            </Specimen>
            <Specimen label="Long options">
              {() => (
                <KoiQuestion
                  question={QUESTION.question}
                  options={LONG_OPTIONS}
                  onAnswer={answer}
                />
              )}
            </Specimen>
            <Specimen label="Older question">
              {() => <KoiQuestion {...QUESTION} disabled onAnswer={answer} />}
            </Specimen>
            <Specimen label="Answered with an option">
              {() => (
                <KoiQuestion
                  {...QUESTION}
                  answered="By project"
                  onAnswer={answer}
                />
              )}
            </Specimen>
            <Specimen label="Answered in your own words">
              {() => (
                <KoiQuestion
                  {...QUESTION}
                  answered="Keep it as is, I like the mess"
                  onAnswer={answer}
                />
              )}
            </Specimen>
          </section>

          <section className={styles.section}>
            <h2 className={styles.heading}>Prompt Parts</h2>
            <Specimen label="Selected choice">
              {() => (
                <Prompt.Root>
                  <Prompt.Body>
                    <Prompt.Title>{QUESTION.question}</Prompt.Title>
                    <Prompt.Choices aria-label={QUESTION.question}>
                      <Prompt.Choice letter="A">By type</Prompt.Choice>
                      <Prompt.Choice letter="B" selected>
                        By project
                      </Prompt.Choice>
                      <Prompt.Freeform
                        letter="C"
                        aria-label="Your answer"
                        placeholder="Other…"
                      />
                    </Prompt.Choices>
                  </Prompt.Body>
                  <Prompt.Footer>
                    <Button size="sm">Continue</Button>
                  </Prompt.Footer>
                </Prompt.Root>
              )}
            </Specimen>
            <Specimen label="Several answers">
              {() => (
                <Prompt.Root>
                  <Prompt.Answers>
                    <Prompt.Answer>
                      <Prompt.AnswerQuestion>
                        {QUESTION.question}
                      </Prompt.AnswerQuestion>
                      <Prompt.AnswerText>By project</Prompt.AnswerText>
                    </Prompt.Answer>
                    <Prompt.Answer tone="muted">
                      <Prompt.AnswerQuestion>
                        Should I tag the new Saves too?
                      </Prompt.AnswerQuestion>
                      <Prompt.AnswerText>Skipped</Prompt.AnswerText>
                    </Prompt.Answer>
                  </Prompt.Answers>
                </Prompt.Root>
              )}
            </Specimen>
          </section>
        </div>
      </Frames>
    </div>
  );
}
