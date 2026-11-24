import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { JsReferenceIdentifier, SemanticModel } from "@biomejs/runtime/plugin";

import { memberCall } from "../shared/member-call.ts";
import { unquote } from "../shared/syntax.ts";

const MOCK_METHODS = new Set(["mock", "doMock", "unstable_mockModule"]);
const FRAMEWORK_SOURCES: ReadonlyMap<string, string> = new Map([
	["vi", "vitest"],
	["jest", "@jest/globals"],
]);

function importSource(specifier: { ancestors(): readonly { kind: string }[] }): string | null {
	for (const ancestor of specifier.ancestors()) {
		if (
			(ancestor.kind === "JS_IMPORT_NAMED_CLAUSE" || ancestor.kind === "JS_IMPORT_COMBINED_CLAUSE") &&
			"source" in ancestor
		) {
			const source = ancestor.source;
			return source?.kind === "JS_MODULE_SOURCE" && source.valueToken !== undefined
				? unquote(source.valueToken)
				: null;
		}
	}
	return null;
}

function isTestFrameworkObject(model: SemanticModel, reference: JsReferenceIdentifier): boolean {
	const name = reference.valueToken;
	const expectedSource = name === undefined ? undefined : FRAMEWORK_SOURCES.get(name);
	if (expectedSource === undefined) return false;
	const binding = model.binding(reference);
	if (binding === undefined) return true;
	if (binding.declarationKind() !== "import") return false;
	const specifier = binding.syntax().parent;
	if (specifier?.kind === "JS_SHORTHAND_NAMED_IMPORT_SPECIFIER") {
		return importSource(specifier) === expectedSource;
	}
	if (specifier?.kind === "JS_NAMED_IMPORT_SPECIFIER") {
		const imported = specifier.name?.text;
		return (
			imported !== undefined && unquote(imported) === name && importSource(specifier) === expectedSource
		);
	}
	return false;
}

export const noModuleMocking = defineRule({
	query: ast("JS_CALL_EXPRESSION", { semantic: true }),
	run(node, { model }) {
		const call = memberCall(node.callee);
		if (call === null || !MOCK_METHODS.has(call.method)) return;
		if (!isTestFrameworkObject(model, call.object)) return;
		registerDiagnostic(
			node,
			"error",
			"Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
		);
	},
});
