import { ast, defineRule, nodeKinds, registerDiagnostic } from "@biomejs/runtime/plugin";

import { leadingTrivia } from "../shared/leading-comments.ts";
import { isConstAssertion, type SyntaxNode } from "../shared/syntax.ts";

const COMMENT_OWNER_KINDS = nodeKinds(
	"JS_EXPRESSION_STATEMENT",
	"JS_PROPERTY_CLASS_MEMBER",
	"JS_RETURN_STATEMENT",
	"JS_THROW_STATEMENT",
	"JS_VARIABLE_STATEMENT",
);

const TOP_LEVEL_KINDS = nodeKinds("JS_MODULE", "JS_MODULE_ITEM_LIST", "JS_SCRIPT");

const SAFETY = /\bSAFETY\s*:/u;

function isCommentOwner(node: SyntaxNode): boolean {
	if (COMMENT_OWNER_KINDS.has(node)) return true;
	const parent = node.parent;
	return (
		node.kind === "JS_VARIABLE_DECLARATION" &&
		parent?.kind !== "JS_VARIABLE_STATEMENT" &&
		parent?.kind !== "JS_VARIABLE_DECLARATION_CLAUSE"
	);
}

function isTopLevel(node: SyntaxNode): boolean {
	const parent = node.parent;
	return TOP_LEVEL_KINDS.has(parent) || parent?.parent?.kind === "JS_SCRIPT";
}

function hasSafetyComment(assertion: SyntaxNode): boolean {
	let current: SyntaxNode | undefined = assertion;
	while (current !== undefined) {
		if (SAFETY.test(leadingTrivia(current))) return true;
		if (isCommentOwner(current) || isTopLevel(current)) return false;
		current = current.parent;
	}
	return false;
}

export const requireSafetyCommentForTypeAssertion = defineRule({
	query: ast("TS_AS_EXPRESSION", "TS_TYPE_ASSERTION_EXPRESSION"),
	run(node) {
		if (isConstAssertion(node) || hasSafetyComment(node)) return;
		registerDiagnostic(
			node,
			"error",
			"This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion or its containing statement.",
		);
	},
});
