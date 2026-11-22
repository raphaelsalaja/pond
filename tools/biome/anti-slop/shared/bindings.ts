import type {
	AnyJsExpression,
	AnyTsType,
	Binding,
	JsVariableDeclarator,
	SemanticModel,
} from "@biomejs/runtime/plugin";

import type { SyntaxNode } from "./syntax.ts";

/** Resolves an identifier expression to its binding, or undefined for globals and other expressions. */
export function identifierBinding(
	model: SemanticModel,
	expression: AnyJsExpression,
): Binding | undefined {
	if (expression.kind !== "JS_IDENTIFIER_EXPRESSION" || expression.name === undefined) return undefined;
	return model.binding(expression.name);
}

export function bindingDeclarator(binding: Binding): JsVariableDeclarator | null {
	const parent = binding.syntax().parent;
	return parent?.kind === "JS_VARIABLE_DECLARATOR" ? parent : null;
}

export function isConstDeclarator(declarator: JsVariableDeclarator): boolean {
	const declaration = declarator.parent?.parent;
	return declaration?.kind === "JS_VARIABLE_DECLARATION" && declaration.kindToken === "const";
}

/** Reads the type from a variable, property, or parameter annotation node. */
export function annotationType(annotation: SyntaxNode | undefined): AnyTsType | undefined {
	if (annotation?.kind === "TS_TYPE_ANNOTATION") return annotation.ty;
	if (
		annotation?.kind === "TS_DEFINITE_VARIABLE_ANNOTATION" ||
		annotation?.kind === "TS_DEFINITE_PROPERTY_ANNOTATION" ||
		annotation?.kind === "TS_OPTIONAL_PROPERTY_ANNOTATION"
	) {
		return annotation.typeAnnotation?.ty;
	}
	return undefined;
}

/** Returns the explicit type written on a binding's declaration, when it has one. */
export function bindingAnnotation(binding: Binding): { readonly owner: SyntaxNode; readonly type: AnyTsType } | null {
	const owner = binding.syntax().parent;
	if (owner?.kind === "JS_VARIABLE_DECLARATOR") {
		const type = annotationType(owner.variableAnnotation);
		return type === undefined ? null : { owner, type };
	}
	if (owner?.kind === "JS_FORMAL_PARAMETER" || owner?.kind === "JS_REST_PARAMETER") {
		const type = owner.typeAnnotation?.ty;
		return type === undefined ? null : { owner, type };
	}
	return null;
}
