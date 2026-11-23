import type { JsAstElement } from "@biomejs/runtime/plugin";

import type { SyntaxNode } from "./syntax.ts";

/** Returns the index just past any whitespace and comments starting at `index`. */
function skipTrivia(text: string, index: number): number {
	let cursor = index;
	while (cursor < text.length) {
		if (/\s/u.test(text[cursor] ?? "")) {
			cursor += 1;
		} else if (text.startsWith("//", cursor)) {
			const end = text.indexOf("\n", cursor);
			cursor = end === -1 ? text.length : end + 1;
		} else if (text.startsWith("/*", cursor)) {
			const end = text.indexOf("*/", cursor + 2);
			cursor = end === -1 ? text.length : end + 2;
		} else {
			break;
		}
	}
	return cursor;
}

type Gap = { readonly element: JsAstElement; readonly gap: string; readonly first: boolean };

/**
 * Splits a parent's text into the trivia gap before each child.
 * @remarks Nodes expose trimmed text only, so trivia is recovered from the parent's text.
 */
function childGaps(parent: SyntaxNode): readonly Gap[] | null {
	const text = parent.text;
	const gaps: Gap[] = [];
	let cursor = 0;
	let seenText = false;
	for (const element of parent.childrenWithTokens()) {
		if (element.text === "") continue;
		const start = cursor;
		cursor = skipTrivia(text, cursor);
		if (!text.startsWith(element.text, cursor)) {
			const found = text.indexOf(element.text, cursor);
			if (found === -1) return null;
			cursor = found;
		}
		gaps.push({ element, gap: text.slice(start, cursor), first: !seenText });
		seenText = true;
		cursor += element.text.length;
	}
	return gaps;
}

/**
 * Collects the comment text directly before a node's first token.
 * @remarks Comments before the first statement of a file are not reachable from the plugin API.
 */
export function leadingTrivia(node: SyntaxNode): string {
	const parent = node.parent;
	if (parent === undefined) return "";
	const matches = (childGaps(parent) ?? []).filter(
		({ element }) => element.kind === node.kind && element.text === node.text,
	);
	return matches.map(({ gap, first }) => (first ? leadingTrivia(parent) : gap)).join("\n");
}
