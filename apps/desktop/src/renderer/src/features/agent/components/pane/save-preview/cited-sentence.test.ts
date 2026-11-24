// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { citedSentence } from "./cited-sentence";

afterEach(() => {
  document.body.innerHTML = "";
});

function sentenceFor(html: string, index = 0) {
  document.body.innerHTML = html;
  const citation = document.querySelectorAll("[data-citation]")[index];
  return citation ? (citedSentence(citation)?.toString() ?? null) : null;
}

const cite = (n: number) => `<button data-citation>${n}</button>`;

it("spans from the last sentence end up to the citation", () => {
  expect(
    sentenceFor(
      `<p>Grids help. A <strong>bento</strong> layout groups cards.${cite(1)} More soon.</p>`,
    ),
  ).toBe("A bento layout groups cards.");
});

it("starts after an earlier citation in the same sentence", () => {
  expect(
    sentenceFor(
      `<p>Clocks use serif type ${cite(1)} and tight grids ${cite(2)}</p>`,
      1,
    ),
  ).toBe("and tight grids");
});

it("shares the sentence between back-to-back citations", () => {
  expect(
    sentenceFor(`<p>Intro. Clocks use serif type.${cite(1)}${cite(2)}</p>`, 1),
  ).toBe("Clocks use serif type.");
});

it("stays inside the citation's block", () => {
  expect(
    sentenceFor(
      `<p>Earlier paragraph</p><ul><li>One list item${cite(1)}</li></ul>`,
    ),
  ).toBe("One list item");
  expect(sentenceFor(`<div>${cite(1)}</div>`)).toBeNull();
});
