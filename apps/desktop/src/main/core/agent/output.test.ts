import { expect, it } from "vitest";
import { sourceExcerpt } from "../../../shared/assistant-text";
import { answerProblem, evidence, evidenceAnswerProblem } from "./output";

it("normalizes escaped metadata and removes standalone scraper controls", () => {
  expect(
    sourceExcerpt("Vivid lighting.\\nShow transcript\\n\\nA film.\nSubscribe"),
  ).toBe("Vivid lighting. A film.");
  expect(sourceExcerpt("x".repeat(900)).length).toBe(700);
});
it("keeps evidence readable, bounded, and without record IDs", () => {
  const context = evidence([
    {
      id: "private-id",
      title: "Film",
      source: "arena",
      url: "https://example.com",
      description: String.raw`A film.\nShow transcript`,
    },
  ]);
  expect(context).toContain("[1] Film");
  expect(context).not.toMatch(/private-id|Show transcript|\\n/);
});
it("does not confuse normal prose, code, or a JSON tutorial with Save records", () => {
  for (const text of [
    "The id is useful.",
    '```json\n{"id":"example","name":"A"}\n```',
    "The source uses light well.",
  ]) {
    expect(answerProblem(text)).toBeNull();
  }
  expect(
    answerProblem(
      '{"id":"a","url":"https://example.com"}',
      "Export this Save as JSON",
    ),
  ).toBeNull();
});
it("rejects escaped whitespace soup and internal envelopes", () => {
  expect(answerProblem(String.raw`A\nB\nC\nD`)).toBeTruthy();
  expect(answerProblem('{"answer":"Hello","changes":[]}')).toBeTruthy();
});

it("still rejects records when the user explicitly asks to stop dumping JSON", () => {
  expect(
    answerProblem(
      '{"id":"film","url":"https://example.com"}',
      "Stop dumping JSON and explain it",
    ),
  ).toBeTruthy();
});

it("rejects invented Save references", () => {
  expect(evidenceAnswerProblem("See [Film](#save-3).", 2)).toBe(
    "unknown evidence reference",
  );
  expect(evidenceAnswerProblem("See [Film](#save-2).", 2)).toBeNull();
});

it("does not classify the meaning of the model's prose", () => {
  expect(
    evidenceAnswerProblem(
      "I can't see images clearly enough to compare them.",
      2,
    ),
  ).toBeNull();
});
