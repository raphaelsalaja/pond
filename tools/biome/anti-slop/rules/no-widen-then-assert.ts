import { ast, defineRule, nodeKinds, registerDiagnostic } from "@biomejs/runtime/plugin";

import type {
	AnyJsExpression,
	AnyTsType,
	Binding,
	SemanticModel,
	TsAsExpression,
	TsTypeAssertionExpression,
} from "@biomejs/runtime/plugin";

import {
	annotationType,
	bindingAnnotation,
	bindingDeclarator,
	identifierBinding,
	isConstDeclarator,
} from "../shared/bindings.ts";
import {
	ASSERTION_KINDS,
	functionBoundary,
	referenceName,
	sameChainNode,
	type SyntaxNode,
	typeArguments,
	unwrapParenthesizedExpression,
	unwrapParenthesizedType,
} from "../shared/syntax.ts";

type BroadTypeKind = "top" | "object" | "record";
type Assertion = TsAsExpression | TsTypeAssertionExpression;

type KnownValueEvidence = {
	readonly type: AnyTsType | null;
};

const VALUE_EVIDENCE_KINDS = nodeKinds(
	"JS_ARRAY_EXPRESSION",
	"JS_ARROW_FUNCTION_EXPRESSION",
	"JS_BIGINT_LITERAL_EXPRESSION",
	"JS_BOOLEAN_LITERAL_EXPRESSION",
	"JS_CLASS_EXPRESSION",
	"JS_FUNCTION_EXPRESSION",
	"JS_NEW_EXPRESSION",
	"JS_NULL_LITERAL_EXPRESSION",
	"JS_NUMBER_LITERAL_EXPRESSION",
	"JS_OBJECT_EXPRESSION",
	"JS_REGEX_LITERAL_EXPRESSION",
	"JS_STRING_LITERAL_EXPRESSION",
);

/** Bounds const-chain resolution so cyclic initializers cannot recurse forever. */
const MAX_CONST_CHAIN = 32;

function unwrapType(type: AnyTsType | undefined): AnyTsType | undefined {
	return unwrapParenthesizedType(type) as AnyTsType | undefined;
}

function isUnknownOrAnyType(type: AnyTsType | undefined): boolean {
	const unwrapped = unwrapType(type);
	return unwrapped?.kind === "TS_UNKNOWN_TYPE" || unwrapped?.kind === "TS_ANY_TYPE";
}

function isBroadRecordKeyType(type: AnyTsType | undefined): boolean {
	const unwrapped = unwrapType(type);
	if (unwrapped === undefined) return false;
	if (
		unwrapped.kind === "TS_STRING_TYPE" ||
		unwrapped.kind === "TS_NUMBER_TYPE" ||
		unwrapped.kind === "TS_SYMBOL_TYPE"
	) {
		return true;
	}
	if (unwrapped.kind === "TS_UNION_TYPE") return unwrapped.types.every(isBroadRecordKeyType);
	return unwrapped.kind === "TS_REFERENCE_TYPE" && referenceName(unwrapped) === "PropertyKey";
}

function isBroadRecordType(type: AnyTsType | undefined): boolean {
	const unwrapped = unwrapType(type);
	if (unwrapped?.kind === "TS_REFERENCE_TYPE") {
		const name = referenceName(unwrapped);
		const parameters = typeArguments(unwrapped);
		if (name === "Readonly") return isBroadRecordType(parameters[0]);
		return (
			name === "Record" &&
			parameters.length === 2 &&
			isBroadRecordKeyType(parameters[0]) &&
			isUnknownOrAnyType(parameters[1])
		);
	}
	if (unwrapped?.kind !== "TS_OBJECT_TYPE" || unwrapped.members.length !== 1) return false;
	const [member] = unwrapped.members;
	return (
		member?.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER" &&
		isBroadRecordKeyType(member.parameter?.typeAnnotation?.ty) &&
		isUnknownOrAnyType(member.typeAnnotation?.ty)
	);
}

function broadTypeKind(type: AnyTsType | undefined): BroadTypeKind | null {
	const unwrapped = unwrapType(type);
	if (unwrapped === undefined) return null;
	if (unwrapped.kind === "TS_UNKNOWN_TYPE" || unwrapped.kind === "TS_ANY_TYPE") return "top";
	if (unwrapped.kind === "TS_NON_PRIMITIVE_TYPE") return "object";
	return isBroadRecordType(unwrapped) ? "record" : null;
}

function asAssertion(expression: AnyJsExpression | undefined): Assertion | null {
	const unwrapped = unwrapParenthesizedExpression(expression);
	return unwrapped !== undefined && ASSERTION_KINDS.has(unwrapped) ? (unwrapped as Assertion) : null;
}

function normalizedTypeText(type: AnyTsType | undefined): string | undefined {
	return unwrapType(type)?.text.replaceAll(/\s+/gu, "");
}

function typesHaveSameSyntax(left: AnyTsType | null, right: AnyTsType): boolean {
	return left !== null && normalizedTypeText(left) === normalizedTypeText(right);
}

function isDefinitelyObjectType(type: AnyTsType | undefined): boolean {
	const unwrapped = unwrapType(type);
	switch (unwrapped?.kind) {
		case "TS_ARRAY_TYPE":
		case "TS_CONSTRUCTOR_TYPE":
		case "TS_FUNCTION_TYPE":
		case "TS_MAPPED_TYPE":
		case "TS_NON_PRIMITIVE_TYPE":
		case "TS_TUPLE_TYPE":
			return true;
		case "TS_OBJECT_TYPE":
			return unwrapped.members.length > 0;
		case "TS_INTERSECTION_TYPE":
			return unwrapped.types.every(isDefinitelyObjectType);
		case "TS_TYPE_OPERATOR_TYPE":
			return unwrapped.operatorToken === "readonly" && isDefinitelyObjectType(unwrapped.ty);
		default:
			return false;
	}
}

function isDefinitelyNarrowerRecordType(type: AnyTsType | undefined): boolean {
	const unwrapped = unwrapType(type);
	if (unwrapped?.kind === "TS_OBJECT_TYPE") {
		return unwrapped.members.some((member) => member.kind !== "TS_INDEX_SIGNATURE_TYPE_MEMBER");
	}
	if (unwrapped?.kind !== "TS_REFERENCE_TYPE") return false;
	const name = referenceName(unwrapped);
	const parameters = typeArguments(unwrapped);
	if (name === "Readonly") return isDefinitelyNarrowerRecordType(parameters[0]);
	return name === "Record" && parameters.length === 2 && !isUnknownOrAnyType(parameters[1]);
}

function knownValueEvidence(
	model: SemanticModel,
	expression: AnyJsExpression,
	boundary: SyntaxNode | null,
	depth: number,
): KnownValueEvidence | null {
	const unwrapped = unwrapParenthesizedExpression(expression);
	if (unwrapped === undefined) return null;

	const assertion = asAssertion(unwrapped);
	if (assertion !== null) {
		const type = assertion.ty;
		return type === undefined || broadTypeKind(type) !== null ? null : { type };
	}
	if (unwrapped.kind === "JS_TEMPLATE_EXPRESSION") return unwrapped.tag === undefined ? { type: null } : null;
	if (VALUE_EVIDENCE_KINDS.has(unwrapped)) return { type: null };

	if (depth >= MAX_CONST_CHAIN) return null;
	const binding = identifierBinding(model, unwrapped);
	if (binding === undefined) return null;

	const annotated = bindingAnnotation(binding);
	if (annotated !== null) {
		if (!sameChainNode(functionBoundary(annotated.owner), boundary) || broadTypeKind(annotated.type) !== null)
			return null;
		return { type: annotated.type };
	}

	const declarator = bindingDeclarator(binding);
	const initializer = declarator?.initializer?.expression;
	if (
		declarator === null ||
		initializer === undefined ||
		!isConstDeclarator(declarator) ||
		binding.allWrites().length > 0 ||
		!sameChainNode(functionBoundary(declarator), boundary)
	) {
		return null;
	}
	return knownValueEvidence(model, initializer, boundary, depth + 1);
}

function widenedBinding(
	model: SemanticModel,
	binding: Binding,
): {
	readonly broadKind: BroadTypeKind;
	readonly evidence: KnownValueEvidence;
	readonly boundary: SyntaxNode | null;
} | null {
	const declarator = bindingDeclarator(binding);
	const initializer = declarator?.initializer?.expression;
	if (
		declarator === null ||
		initializer === undefined ||
		declarator.id?.kind !== "JS_IDENTIFIER_BINDING" ||
		!isConstDeclarator(declarator) ||
		binding.allWrites().length > 0
	) {
		return null;
	}

	const boundary = functionBoundary(declarator);
	const declaredType = annotationType(declarator.variableAnnotation);
	const initializerAssertion = asAssertion(initializer);
	const initializerBroadKind =
		initializerAssertion === null ? null : broadTypeKind(initializerAssertion.ty);
	const broadKind = broadTypeKind(declaredType) ?? initializerBroadKind;
	if (broadKind === null) return null;

	const originalExpression =
		initializerAssertion !== null && initializerBroadKind !== null
			? initializerAssertion.expression
			: initializer;
	if (originalExpression === undefined) return null;
	const evidence = knownValueEvidence(model, originalExpression, boundary, 1);
	return evidence === null ? null : { broadKind, evidence, boundary };
}

function assertionIsNarrower(
	broadKind: BroadTypeKind,
	evidence: KnownValueEvidence,
	assertedType: AnyTsType,
): boolean {
	if (broadTypeKind(assertedType) !== null) return false;
	if (broadKind === "top") return true;
	if (typesHaveSameSyntax(evidence.type, assertedType)) return true;
	if (broadKind === "object") return isDefinitelyObjectType(assertedType);
	return isDefinitelyNarrowerRecordType(assertedType);
}

export const noWidenThenAssert = defineRule({
	query: ast("TS_AS_EXPRESSION", "TS_TYPE_ASSERTION_EXPRESSION", { semantic: true }),
	run(node, { model }) {
		const assertedType = node.ty;
		const expression = unwrapParenthesizedExpression(node.expression);
		if (assertedType === undefined || expression?.kind !== "JS_IDENTIFIER_EXPRESSION") return;
		const binding = identifierBinding(model, expression);
		if (binding === undefined) return;
		const widened = widenedBinding(model, binding);
		if (
			widened === null ||
			!sameChainNode(functionBoundary(node), widened.boundary) ||
			!assertionIsNarrower(widened.broadKind, widened.evidence, assertedType)
		) {
			return;
		}
		registerDiagnostic(
			node,
			"error",
			`Binding "${expression.text}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.`,
		);
	},
});
