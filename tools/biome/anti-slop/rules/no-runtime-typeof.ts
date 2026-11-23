import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

export const noRuntimeTypeof = defineRule({
	query: ast("JS_UNARY_EXPRESSION"),
	run(node) {
		if (node.operatorToken !== "typeof") return;
		registerDiagnostic(
			node,
			"error",
			"A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.",
		);
	},
});
