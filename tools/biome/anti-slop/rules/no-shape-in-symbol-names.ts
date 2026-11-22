import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

const FORBIDDEN_TERM = "shape";
const IDENTIFIER_START = /^[\p{ID_Start}$_]/u;

export const noShapeInSymbolNames = defineRule({
	query: ast(
		"JS_IDENTIFIER_ASSIGNMENT",
		"JS_IDENTIFIER_BINDING",
		"JS_LABEL",
		"JS_LITERAL_EXPORT_NAME",
		"JS_LITERAL_MEMBER_NAME",
		"JS_NAME",
		"JS_PRIVATE_CLASS_MEMBER_NAME",
		"JS_PRIVATE_NAME",
		"JS_REFERENCE_IDENTIFIER",
		"JSX_NAME",
		"JSX_REFERENCE_IDENTIFIER",
		"TS_IDENTIFIER_BINDING",
		"TS_LITERAL_ENUM_MEMBER_NAME",
		"TS_TYPE_PARAMETER_NAME",
	),
	run(node) {
		const name = node.text.startsWith("#") ? node.text.slice(1) : node.text;
		if (!IDENTIFIER_START.test(name)) return;
		if (!name.toLowerCase().includes(FORBIDDEN_TERM)) return;
		registerDiagnostic(
			node,
			"error",
			`Rename symbol "${name}" for its domain role; "shape" describes structure rather than ownership.`,
		);
	},
});
