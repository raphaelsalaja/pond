import { nodeKinds } from "@biomejs/runtime/plugin";

import { type SyntaxNode, typeParameterNames } from "./syntax.ts";

const INFER_TYPES = nodeKinds("TS_INFER_TYPE");

function inferNames(node: SyntaxNode | undefined, names: Set<string>): void {
	if (node === undefined) return;
	const candidates = node.kind === "TS_INFER_TYPE" ? [node] : node.descendants(INFER_TYPES);
	for (const infer of candidates) {
		if (infer.kind === "TS_INFER_TYPE" && infer.name?.identToken !== undefined) {
			names.add(infer.name.identToken);
		}
	}
}

/**
 * Collects type parameter names in scope at `node`.
 * @remarks A conditional's true branch matches by text, so a false branch with identical text also sees `infer` names.
 */
export function lexicalTypeParameterNames(node: SyntaxNode): ReadonlySet<string> {
	const names = new Set<string>();
	let descendant = node;
	for (const current of [node, ...node.ancestors()]) {
		for (const name of typeParameterNames(current)) names.add(name);
		if (
			current.kind === "TS_MAPPED_TYPE" &&
			(descendant.kind === "TS_MAPPED_TYPE_AS_CLAUSE" || descendant.kind === "TS_TYPE_ANNOTATION") &&
			current.propertyName?.identToken !== undefined
		) {
			names.add(current.propertyName.identToken);
		}
		if (
			current.kind === "TS_CONDITIONAL_TYPE" &&
			current.trueType !== undefined &&
			descendant !== current &&
			descendant.kind === current.trueType.kind &&
			descendant.text === current.trueType.text
		) {
			inferNames(current.extendsType, names);
		}
		descendant = current;
	}
	return names;
}
