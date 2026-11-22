import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import { parameterName, parameterType } from "../shared/parameters.ts";

export const noUnknownParameters = defineRule({
	query: ast("JS_FORMAL_PARAMETER", "JS_REST_PARAMETER"),
	run(node) {
		const type = parameterType(node);
		if (type?.kind !== "TS_UNKNOWN_TYPE") return;
		const name = parameterName(node);
		if (name === "cause") return;
		registerDiagnostic(
			type,
			"error",
			`Parameter \`${name}\` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.`,
		);
	},
});
