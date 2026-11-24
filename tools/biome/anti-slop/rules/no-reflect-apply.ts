import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import { isGlobalReference, memberCall } from "../shared/member-call.ts";

export const noReflectApply = defineRule({
	query: ast("JS_CALL_EXPRESSION", { semantic: true }),
	run(node, { model }) {
		const call = memberCall(node.callee);
		if (call?.method !== "apply" || !isGlobalReference(model, call.object, "Reflect")) return;
		registerDiagnostic(
			node,
			"error",
			"Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface.",
		);
	},
});
