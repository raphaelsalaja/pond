import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import { isGlobalReference, memberCall } from "../shared/member-call.ts";

export const noReflectGet = defineRule({
	query: ast("JS_CALL_EXPRESSION", { semantic: true }),
	run(node, { model }) {
		const call = memberCall(node.callee);
		if (call?.method !== "get" || !isGlobalReference(model, call.object, "Reflect")) return;
		registerDiagnostic(
			node,
			"error",
			"Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it.",
		);
	},
});
