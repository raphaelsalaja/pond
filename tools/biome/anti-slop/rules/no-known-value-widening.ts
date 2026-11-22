import { ast, defineRule, nodeKinds, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyJsExpression, AnyTsType, SemanticModel } from "@biomejs/runtime/plugin";

import {
	annotationType,
	bindingDeclarator,
	identifierBinding,
	isConstDeclarator,
} from "../shared/bindings.ts";
import {
	classifyWideningTarget,
	createTypeEnvironment,
	isKnownEvidenceExpression,
	type TypeEnvironment,
	unwrapExpression,
	type WideningTarget,
} from "../shared/dictionary-types.ts";
import { explicitReturnType } from "../shared/return-types.ts";
import {
	ASSERTION_KINDS,
	bindingName,
	functionBoundary,
	type SyntaxNode,
	unquote,
} from "../shared/syntax.ts";

const FLOW_KINDS = nodeKinds(
	"JS_ARROW_FUNCTION_EXPRESSION",
	"JS_ASSIGNMENT_EXPRESSION",
	"JS_PROPERTY_CLASS_MEMBER",
	"JS_RETURN_STATEMENT",
	"JS_VARIABLE_DECLARATOR",
	"TS_AS_EXPRESSION",
	"TS_TYPE_ASSERTION_EXPRESSION",
);

const CLASS_MEMBER_FUNCTIONS = nodeKinds(
	"JS_CONSTRUCTOR_CLASS_MEMBER",
	"JS_GETTER_CLASS_MEMBER",
	"JS_METHOD_CLASS_MEMBER",
	"JS_SETTER_CLASS_MEMBER",
);

/** Bounds const-chain resolution so cyclic initializers cannot recurse forever. */
const MAX_CONST_CHAIN = 32;

function hasKnownEvidence(model: SemanticModel, expression: AnyJsExpression, depth = 0): boolean {
	if (isKnownEvidenceExpression(expression)) return true;
	if (depth >= MAX_CONST_CHAIN) return false;
	const binding = identifierBinding(model, unwrapExpression(expression));
	if (binding === undefined) return false;
	const declarator = bindingDeclarator(binding);
	const initializer = declarator?.initializer?.expression;
	if (
		declarator === null ||
		initializer === undefined ||
		!isConstDeclarator(declarator) ||
		binding.allWrites().length > 0
	) {
		return false;
	}
	return hasKnownEvidence(model, initializer, depth + 1);
}

function keyName(name: SyntaxNode | undefined): string {
	if (name === undefined) return "";
	if (name.kind === "JS_LITERAL_MEMBER_NAME") return unquote(name.text);
	if (name.kind === "JS_PRIVATE_CLASS_MEMBER_NAME") return name.text.replace(/^#/u, "");
	return name.text;
}

function functionName(owner: SyntaxNode | null): string {
	if (owner === null) return "anonymous function";
	if ("id" in owner && owner.id !== undefined) return owner.id.text;
	if (CLASS_MEMBER_FUNCTIONS.has(owner)) return keyName(owner.name);
	const declarator = owner.parent?.kind === "JS_INITIALIZER_CLAUSE" ? owner.parent.parent : undefined;
	if (declarator?.kind === "JS_VARIABLE_DECLARATOR" && declarator.id?.kind === "JS_IDENTIFIER_BINDING")
		return bindingName(declarator.id);
	return "anonymous function";
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
	return destination.kind === "open dictionary" || destination.kind === "generic container";
}

function isEmptyObjectExpression(expression: AnyJsExpression): boolean {
	const unwrapped = unwrapExpression(expression);
	return unwrapped.kind === "JS_OBJECT_EXPRESSION" && unwrapped.members.length === 0;
}

export const noKnownValueWidening = defineRule({
	query: ast("JS_MODULE", "JS_SCRIPT", { semantic: true }),
	run(root, { model }) {
		const environment: TypeEnvironment = createTypeEnvironment(root);
		const target = (type: SyntaxNode | undefined) =>
			type === undefined ? null : classifyWideningTarget(type as AnyTsType, environment);

		const reportFlow = (
			expression: AnyJsExpression | undefined,
			destination: WideningTarget | null,
			subject: string,
		) => {
			if (expression === undefined || destination === null) return;
			if (isDictionaryAccumulatorTarget(destination) && isEmptyObjectExpression(expression)) return;
			if (!hasKnownEvidence(model, expression)) return;
			registerDiagnostic(
				expression,
				"error",
				`The explicit ${destination.kind} type on ${subject} discards known type evidence. Keep inference, validate with \`satisfies\`, or use a named owner contract.`,
			);
		};

		for (const node of root.descendants(FLOW_KINDS)) {
			switch (node.kind) {
				case "JS_VARIABLE_DECLARATOR": {
					if (node.id?.kind !== "JS_IDENTIFIER_BINDING") break;
					reportFlow(
						node.initializer?.expression,
						target(annotationType(node.variableAnnotation)),
						`binding \`${bindingName(node.id)}\``,
					);
					break;
				}
				case "JS_PROPERTY_CLASS_MEMBER": {
					reportFlow(
						node.value?.expression,
						target(annotationType(node.propertyAnnotation)),
						`property \`${keyName(node.name)}\``,
					);
					break;
				}
				case "JS_ASSIGNMENT_EXPRESSION": {
					const left = node.left;
					if (node.operatorToken !== "=" || left?.kind !== "JS_IDENTIFIER_ASSIGNMENT") break;
					const binding = model.binding(left);
					const declarator = binding === undefined ? null : bindingDeclarator(binding);
					if (declarator?.id?.kind !== "JS_IDENTIFIER_BINDING") break;
					reportFlow(
						node.right,
						target(annotationType(declarator.variableAnnotation)),
						`binding \`${bindingName(declarator.id)}\``,
					);
					break;
				}
				case "JS_RETURN_STATEMENT": {
					const owner = functionBoundary(node);
					reportFlow(
						node.argument,
						target(owner === null ? undefined : explicitReturnType(owner)),
						`return value of \`${functionName(owner)}\``,
					);
					break;
				}
				case "JS_ARROW_FUNCTION_EXPRESSION": {
					const body = node.body;
					if (body === undefined || body.kind === "JS_FUNCTION_BODY") break;
					reportFlow(body, target(explicitReturnType(node)), `return value of \`${functionName(node)}\``);
					break;
				}
				case "TS_AS_EXPRESSION":
				case "TS_TYPE_ASSERTION_EXPRESSION": {
					if (ASSERTION_KINDS.has(node.parent)) break;
					reportFlow(node.expression, target(node.ty), "assertion");
					break;
				}
			}
		}
	},
});
