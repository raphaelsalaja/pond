import { nodeKinds } from "@biomejs/runtime/plugin";

import type {
	AnyJsAstNode,
	AnyJsExpression,
	AnyTsReturnType,
	AnyTsType,
	JsModule,
	JsScript,
	TsReferenceType,
} from "@biomejs/runtime/plugin";

export type SyntaxNode = AnyJsAstNode;
export type SourceRoot = JsModule | JsScript;

export const ASSERTION_KINDS = nodeKinds("TS_AS_EXPRESSION", "TS_TYPE_ASSERTION_EXPRESSION");

export const FUNCTION_KINDS = nodeKinds(
	"JS_ARROW_FUNCTION_EXPRESSION",
	"JS_CONSTRUCTOR_CLASS_MEMBER",
	"JS_FUNCTION_DECLARATION",
	"JS_FUNCTION_EXPORT_DEFAULT_DECLARATION",
	"JS_FUNCTION_EXPRESSION",
	"JS_GETTER_CLASS_MEMBER",
	"JS_GETTER_OBJECT_MEMBER",
	"JS_METHOD_CLASS_MEMBER",
	"JS_METHOD_OBJECT_MEMBER",
	"JS_SETTER_CLASS_MEMBER",
	"JS_SETTER_OBJECT_MEMBER",
	"TS_DECLARE_FUNCTION_DECLARATION",
	"TS_DECLARE_FUNCTION_EXPORT_DEFAULT_DECLARATION",
	"TS_CONSTRUCTOR_SIGNATURE_CLASS_MEMBER",
	"TS_GETTER_SIGNATURE_CLASS_MEMBER",
	"TS_METHOD_SIGNATURE_CLASS_MEMBER",
	"TS_SETTER_SIGNATURE_CLASS_MEMBER",
);

export const PARAMETER_KINDS = nodeKinds(
	"JS_FORMAL_PARAMETER",
	"JS_REST_PARAMETER",
);

export function unwrapParenthesizedExpression(
	expression: AnyJsExpression | undefined,
): AnyJsExpression | undefined {
	let current = expression;
	while (current?.kind === "JS_PARENTHESIZED_EXPRESSION") current = current.expression;
	return current;
}

export function unwrapParenthesizedType<T extends AnyTsType | AnyTsReturnType>(
	type: T | undefined,
): T | AnyTsType | undefined {
	let current: T | AnyTsType | undefined = type;
	while (current?.kind === "TS_PARENTHESIZED_TYPE") current = current.ty;
	return current;
}

/** Returns the identifier name of a reference type, or null for qualified names. */
export function referenceName(type: TsReferenceType): string | null {
	return type.name?.kind === "JS_REFERENCE_IDENTIFIER" ? (type.name.valueToken ?? null) : null;
}

export function typeArguments(type: TsReferenceType): readonly AnyTsType[] {
	return type.typeArguments?.tsTypeArgumentList ?? [];
}

export function isConstAssertion(node: SyntaxNode): boolean {
	return (
		ASSERTION_KINDS.has(node) && node.ty?.kind === "TS_REFERENCE_TYPE" && node.ty.text === "const"
	);
}

export function unquote(text: string): string {
	const first = text[0];
	return (first === '"' || first === "'") && text.length >= 2 ? text.slice(1, -1) : text;
}

/**
 * Compares two nodes from the same ancestor chain.
 * @remarks Biome nodes have no stable identity, and a strict ancestor always has longer text.
 */
export function sameChainNode(left: SyntaxNode | null, right: SyntaxNode | null): boolean {
	if (left === null || right === null) return left === right;
	return left.kind === right.kind && left.text === right.text;
}

export function nearestAncestor(
	node: SyntaxNode,
	kinds: { has(element: SyntaxNode | undefined): boolean },
): SyntaxNode | null {
	for (const ancestor of node.ancestors()) {
		if (kinds.has(ancestor)) return ancestor;
	}
	return null;
}

export function functionBoundary(node: SyntaxNode): SyntaxNode | null {
	return nearestAncestor(node, FUNCTION_KINDS);
}

/** Unwraps `export`, `export default`, and `declare` wrappers around a top-level statement. */
export function declaredStatement(statement: SyntaxNode): SyntaxNode | undefined {
	let current: SyntaxNode | undefined = statement;
	if (current.kind === "JS_EXPORT") current = current.exportClause;
	if (current?.kind === "JS_EXPORT_DEFAULT_DECLARATION_CLAUSE") current = current.declaration;
	if (current?.kind === "TS_EXPORT_DECLARE_CLAUSE" || current?.kind === "TS_DECLARE_STATEMENT")
		current = current.declaration;
	return current;
}

export function topLevelStatements(root: SourceRoot): readonly SyntaxNode[] {
	return root.kind === "JS_MODULE" ? root.items : root.statements;
}

export function typeParameterNames(node: SyntaxNode): readonly string[] {
	const parameters = "typeParameters" in node ? node.typeParameters : undefined;
	if (parameters?.kind !== "TS_TYPE_PARAMETERS") return [];
	return parameters.items.flatMap((parameter) =>
		parameter.kind === "TS_TYPE_PARAMETER" && parameter.name?.identToken !== undefined
			? [parameter.name.identToken]
			: [],
	);
}

export function bindingName(binding: SyntaxNode | undefined): string {
	if (binding?.kind === "JS_IDENTIFIER_BINDING") return binding.nameToken ?? binding.text;
	return binding?.text ?? "";
}
