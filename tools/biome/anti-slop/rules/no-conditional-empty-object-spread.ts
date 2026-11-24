import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyJsExpression } from "@biomejs/runtime/plugin";

import { unwrapParenthesizedExpression } from "../shared/syntax.ts";

function isEmptyObject(expression: AnyJsExpression | undefined): boolean {
	return expression?.kind === "JS_OBJECT_EXPRESSION" && expression.members.length === 0;
}

export const noConditionalEmptyObjectSpread = defineRule({
	query: ast("JS_SPREAD"),
	run(node) {
		if (node.parent?.kind !== "JS_OBJECT_MEMBER_LIST") return;
		const argument = unwrapParenthesizedExpression(node.argument);
		if (argument?.kind !== "JS_CONDITIONAL_EXPRESSION") return;
		if (!isEmptyObject(argument.consequent) && !isEmptyObject(argument.alternate)) return;
		registerDiagnostic(
			node,
			"error",
			"This conditional spread hides property omission behind an empty object. Build the object in separate statements and add the property only when present.",
		);
	},
});
