import type { AnyJsExpression, JsReferenceIdentifier, SemanticModel } from "@biomejs/runtime/plugin";

import { unquote } from "./syntax.ts";

export type MemberCall = {
	readonly object: JsReferenceIdentifier;
	readonly method: string;
};

/** Reads `object.method` or `object["method"]` from a call callee. */
export function memberCall(callee: AnyJsExpression | undefined): MemberCall | null {
	if (callee?.kind === "JS_STATIC_MEMBER_EXPRESSION") {
		const object = callee.object;
		const member = callee.member;
		if (object?.kind !== "JS_IDENTIFIER_EXPRESSION" || object.name === undefined) return null;
		if (member?.kind !== "JS_NAME" || member.valueToken === undefined) return null;
		return { object: object.name, method: member.valueToken };
	}
	if (callee?.kind === "JS_COMPUTED_MEMBER_EXPRESSION") {
		const object = callee.object;
		const member = callee.member;
		if (object?.kind !== "JS_IDENTIFIER_EXPRESSION" || object.name === undefined) return null;
		if (member?.kind !== "JS_STRING_LITERAL_EXPRESSION" || member.valueToken === undefined)
			return null;
		return { object: object.name, method: unquote(member.valueToken) };
	}
	return null;
}

/** Returns whether `reference` names a global, which Biome reports as having no binding. */
export function isGlobalReference(
	model: SemanticModel,
	reference: JsReferenceIdentifier,
	name: string,
): boolean {
	return reference.valueToken === name && model.binding(reference) === undefined;
}
