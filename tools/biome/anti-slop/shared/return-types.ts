import { nodeKinds } from "@biomejs/runtime/plugin";

import type { AnyTsReturnType } from "@biomejs/runtime/plugin";

import type { SyntaxNode } from "./syntax.ts";

export const RETURN_TYPE_OWNER_KINDS = nodeKinds(
	"JS_ARROW_FUNCTION_EXPRESSION",
	"JS_FUNCTION_DECLARATION",
	"JS_FUNCTION_EXPORT_DEFAULT_DECLARATION",
	"JS_FUNCTION_EXPRESSION",
	"JS_GETTER_CLASS_MEMBER",
	"JS_GETTER_OBJECT_MEMBER",
	"JS_METHOD_CLASS_MEMBER",
	"JS_METHOD_OBJECT_MEMBER",
	"TS_CALL_SIGNATURE_TYPE_MEMBER",
	"TS_CONSTRUCT_SIGNATURE_TYPE_MEMBER",
	"TS_CONSTRUCTOR_TYPE",
	"TS_DECLARE_FUNCTION_DECLARATION",
	"TS_DECLARE_FUNCTION_EXPORT_DEFAULT_DECLARATION",
	"TS_FUNCTION_TYPE",
	"TS_GETTER_SIGNATURE_CLASS_MEMBER",
	"TS_GETTER_SIGNATURE_TYPE_MEMBER",
	"TS_METHOD_SIGNATURE_CLASS_MEMBER",
	"TS_METHOD_SIGNATURE_TYPE_MEMBER",
);

/** Reads the explicit return type of any function-like node. */
export function explicitReturnType(node: SyntaxNode): AnyTsReturnType | undefined {
	switch (node.kind) {
		case "TS_FUNCTION_TYPE":
		case "TS_CONSTRUCTOR_TYPE":
			return node.returnType;
		case "TS_CONSTRUCT_SIGNATURE_TYPE_MEMBER":
		case "TS_GETTER_SIGNATURE_TYPE_MEMBER":
			return node.typeAnnotation?.ty;
		case "JS_GETTER_CLASS_MEMBER":
		case "JS_GETTER_OBJECT_MEMBER":
		case "TS_GETTER_SIGNATURE_CLASS_MEMBER":
			return node.returnType?.ty;
		default:
			return "returnTypeAnnotation" in node && node.returnTypeAnnotation?.kind === "TS_RETURN_TYPE_ANNOTATION"
				? node.returnTypeAnnotation.ty
				: undefined;
	}
}
