import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import { ASSERTION_KINDS, isConstAssertion, unwrapParenthesizedExpression } from "../shared/syntax.ts";

export const noChainedTypeAssertions = defineRule({
	query: ast("TS_AS_EXPRESSION", "TS_TYPE_ASSERTION_EXPRESSION"),
	run(node) {
		let parent = node.parent;
		while (parent?.kind === "JS_PARENTHESIZED_EXPRESSION") parent = parent.parent;
		if (ASSERTION_KINDS.has(parent)) return;

		let count = 0;
		let hasNonConst = false;
		let current: typeof node | undefined = node;
		while (current !== undefined) {
			count += 1;
			if (!isConstAssertion(current)) hasNonConst = true;
			const inner = unwrapParenthesizedExpression(current.expression);
			current = ASSERTION_KINDS.has(inner) ? inner : undefined;
		}
		if (count <= 1 || !hasNonConst) return;

		registerDiagnostic(
			node,
			"error",
			"This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
		);
	},
});
