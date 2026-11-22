const BLOCK = "p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6";
const SENTENCE_END = /[.!?]["')\]]*\s+/g;
const HIGHLIGHT = "cited-sentence";

interface Piece {
  node: Text;
  start: number;
}

function locate(pieces: Piece[], offset: number): [Text, number] | null {
  for (const piece of pieces) {
    if (offset <= piece.start + piece.node.length) {
      return [piece.node, offset - piece.start];
    }
  }
  return null;
}

/** The run of text a citation closes: from the last sentence end or earlier citation in its block, up to the citation. */
export function citedSentence(citation: Element): Range | null {
  const block = citation.closest(BLOCK);
  if (!block) return null;
  const pieces: Piece[] = [];
  let text = "";
  let afterCitation = 0;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      citation.contains(node) ||
      !(
        citation.compareDocumentPosition(node) &
        Node.DOCUMENT_POSITION_PRECEDING
      )
    ) {
      break;
    }
    if (node.parentElement?.closest("[data-citation]")) {
      if (text.slice(afterCitation).trim()) afterCitation = text.length;
      continue;
    }
    pieces.push({ node: node as Text, start: text.length });
    text += (node as Text).data;
  }
  const end = text.trimEnd().length;
  const base = text.slice(afterCitation, end).trim() ? afterCitation : 0;
  let start = base;
  for (const match of text.slice(base, end).matchAll(SENTENCE_END)) {
    start = base + match.index + match[0].length;
  }
  while (start < end && /\s/.test(text.charAt(start))) start += 1;
  if (start >= end) return null;
  const from = locate(pieces, start);
  const to = locate(pieces, end);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(...from);
  range.setEnd(...to);
  return range;
}

export function showCitedSentence(citation: Element) {
  if (typeof Highlight === "undefined" || !CSS.highlights) return;
  const range = citedSentence(citation);
  if (range) CSS.highlights.set(HIGHLIGHT, new Highlight(range));
  else CSS.highlights.delete(HIGHLIGHT);
}

export function hideCitedSentence() {
  if (typeof CSS !== "undefined") CSS.highlights?.delete(HIGHLIGHT);
}
