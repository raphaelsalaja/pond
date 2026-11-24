import type {
  AssistantMessage,
  AssistantProvider,
  AssistantSource,
} from "@shared/assistant";
import { assistant } from "@/features/agent/state/assistant";
import { openSave } from "@/features/saves/navigation";
import { AssistantResponse } from "./assistant-response";
import { KoiQuestion } from "./question";
import { ResponseError } from "./response-error";
import { ChangeReview } from "./review";
import { SaveCards } from "./save-cards";
import { Suggestions } from "./suggestions";

export function inferredLookupResult(
  content: string,
  sources: Array<AssistantSource>,
) {
  if (sources.length < 2) {
    return null;
  }
  const lines = content
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }
  const references: Array<number> = [];
  for (const line of lines) {
    if (!/^(?:(?:\d+[.)]|[-*+])\s+)?\[\d+\]/.test(line)) {
      return null;
    }
    const matches = [...line.matchAll(/\[(\d+)\](?:\(#save-(\d+)\))?/g)];
    if (!matches.length) {
      return null;
    }
    for (const match of matches) {
      const reference = Number(match[2] ?? match[1]);
      if (reference < 1 || reference > sources.length) {
        return null;
      }
      references.push(reference);
    }
  }
  const saveIds = [...new Set(references)].flatMap(
    (reference) => sources[reference - 1]?.id ?? [],
  );
  if (saveIds.length < 2) {
    return null;
  }
  return { title: "References", saveIds } as const;
}

export function ResponseExtras({
  message,
  questionAnswer,
  questionDisabled,
  provider,
  attachedIds,
  busy,
  attach,
  onAnswer,
  onSuggest,
}: {
  message: AssistantMessage;
  questionAnswer?: string;
  questionDisabled: boolean;
  provider: AssistantProvider;
  attachedIds: Array<string>;
  busy: boolean;
  attach: (sources: Array<AssistantSource>) => void;
  onAnswer?: (answer: string) => Promise<void>;
  onSuggest?: (suggestion: string) => void;
}) {
  const suggestions = message.metadata?.suggestions;
  const sources = message.metadata?.sources ?? [];
  const inferredResult = inferredLookupResult(message.content, sources);
  const results = message.metadata?.results?.length
    ? message.metadata.results
    : inferredResult
      ? [inferredResult]
      : [];
  const changed = new Set(
    (message.metadata?.changes ?? []).map((change) => change.saveId),
  );
  const unchanged = (ids: Array<string>) =>
    ids.filter((id) => !changed.has(id));
  return (
    <>
      {results.map((result) => (
        <SaveCards
          key={result.title}
          sources={sources}
          saveIds={unchanged(result.saveIds)}
          attachedIds={attachedIds}
          onOpenSave={openSave}
          onAttach={attach}
        />
      ))}
      {message.metadata?.question ? (
        <KoiQuestion
          question={message.metadata.question.question}
          options={message.metadata.question.options}
          recommended={message.metadata.question.recommended}
          answered={questionAnswer}
          disabled={questionDisabled}
          onAnswer={async (answer) => {
            if (onAnswer) {
              await onAnswer(answer);
              return;
            }
            await assistant.answerQuestion(message.id, answer, provider);
          }}
        />
      ) : null}
      {message.metadata?.changes?.length ? (
        <ChangeReview
          messageId={message.id}
          disabled={busy}
          changes={message.metadata.changes}
        />
      ) : null}
      {message.metadata?.error ? (
        <ResponseError error={message.metadata.error} />
      ) : null}
      {sources.length && !results.length ? (
        <SaveCards
          sources={sources}
          saveIds={unchanged(sources.map((source) => source.id))}
          attachedIds={attachedIds}
          onOpenSave={openSave}
          onAttach={attach}
        />
      ) : null}
      {suggestions?.length && !questionDisabled ? (
        <Suggestions
          suggestions={suggestions}
          onPick={(suggestion) => {
            if (onSuggest) {
              onSuggest(suggestion);
            } else {
              void assistant.suggest(suggestion, provider);
            }
          }}
        />
      ) : null}
    </>
  );
}

export function ResponseContent({
  message,
  attach,
  ...props
}: Parameters<typeof ResponseExtras>[0]) {
  const sources = message.metadata?.sources ?? [];
  const lookup = inferredLookupResult(message.content, sources);
  return (
    <>
      {!lookup ? (
        <AssistantResponse
          content={message.content}
          sources={sources}
          onOpenSave={openSave}
        />
      ) : null}
      <ResponseExtras message={message} attach={attach} {...props} />
    </>
  );
}
