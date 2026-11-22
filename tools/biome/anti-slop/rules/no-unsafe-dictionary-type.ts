import { ast, defineRule, nodeKinds, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyTsType } from "@biomejs/runtime/plugin";

import {
	classifyUnsafeDictionary,
	classifyUnsafeDictionaryValue,
	createTypeEnvironment,
	type TypeEnvironment,
} from "../shared/dictionary-types.ts";
import { referenceName, type SyntaxNode, typeArguments } from "../shared/syntax.ts";

const CANDIDATE_KINDS = nodeKinds(
	"TS_INDEX_SIGNATURE_CLASS_MEMBER",
	"TS_INDEX_SIGNATURE_TYPE_MEMBER",
	"TS_MAPPED_TYPE",
	"TS_OBJECT_TYPE",
	"TS_REFERENCE_TYPE",
);

const TYPE_KINDS = nodeKinds(
	"TS_ANY_TYPE",
	"TS_ARRAY_TYPE",
	"TS_BIGINT_TYPE",
	"TS_BOOLEAN_TYPE",
	"TS_CONDITIONAL_TYPE",
	"TS_CONSTRUCTOR_TYPE",
	"TS_FUNCTION_TYPE",
	"TS_IMPORT_TYPE",
	"TS_INDEXED_ACCESS_TYPE",
	"TS_INFER_TYPE",
	"TS_INTERSECTION_TYPE",
	"TS_MAPPED_TYPE",
	"TS_NAMED_TUPLE_TYPE_ELEMENT",
	"TS_NEVER_TYPE",
	"TS_NON_PRIMITIVE_TYPE",
	"TS_NUMBER_TYPE",
	"TS_OBJECT_TYPE",
	"TS_PARENTHESIZED_TYPE",
	"TS_PREDICATE_RETURN_TYPE",
	"TS_REFERENCE_TYPE",
	"TS_STRING_TYPE",
	"TS_SYMBOL_TYPE",
	"TS_TEMPLATE_LITERAL_TYPE",
	"TS_THIS_TYPE",
	"TS_TUPLE_TYPE",
	"TS_TYPE_OPERATOR_TYPE",
	"TS_TYPEOF_TYPE",
	"TS_UNDEFINED_TYPE",
	"TS_UNION_TYPE",
	"TS_UNKNOWN_TYPE",
	"TS_VOID_TYPE",
);

const TYPE_ALIAS_DECLARATIONS = nodeKinds("TS_TYPE_ALIAS_DECLARATION");

function isPlainAliasConsumerUse(node: AnyTsType, environment: TypeEnvironment): boolean {
	if (node.kind !== "TS_REFERENCE_TYPE" || typeArguments(node).length > 0) return false;
	const name = referenceName(node);
	return (
		name !== null &&
		environment.aliases.has(name) &&
		!node.ancestors().some((ancestor) => TYPE_ALIAS_DECLARATIONS.has(ancestor))
	);
}

function shouldReportType(node: AnyTsType, environment: TypeEnvironment): boolean {
	if (isPlainAliasConsumerUse(node, environment)) return false;
	if (classifyUnsafeDictionary(node, environment) === null) return false;
	return !node
		.ancestors()
		.some(
			(ancestor) =>
				TYPE_KINDS.has(ancestor) && classifyUnsafeDictionary(ancestor, environment) !== null,
		);
}

function report(node: SyntaxNode, value: string): void {
	registerDiagnostic(
		node,
		"error",
		`This dictionary's ${value} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.`,
	);
}

export const noUnsafeDictionaryType = defineRule({
	query: ast("JS_MODULE", "JS_SCRIPT"),
	run(root) {
		const environment = createTypeEnvironment(root);
		for (const node of root.descendants(CANDIDATE_KINDS)) {
			if (node.kind === "TS_INDEX_SIGNATURE_CLASS_MEMBER" || node.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER") {
				if (node.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER" && node.parent?.parent?.kind === "TS_OBJECT_TYPE")
					continue;
				const value = node.typeAnnotation?.ty;
				const unsafe = value === undefined ? null : classifyUnsafeDictionaryValue(value, environment);
				if (unsafe !== null) report(node, unsafe.unsafeValue);
				continue;
			}
			if (!shouldReportType(node, environment)) continue;
			const unsafe = classifyUnsafeDictionary(node, environment);
			if (unsafe !== null) report(node, unsafe.unsafeValue);
		}
	},
});
