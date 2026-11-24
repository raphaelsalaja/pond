import type { AnyTsType, JsFormalParameter, JsRestParameter } from "@biomejs/runtime/plugin";

import { bindingName } from "./syntax.ts";

export type Parameter = JsFormalParameter | JsRestParameter;

export function parameterType(parameter: Parameter): AnyTsType | undefined {
	return parameter.typeAnnotation?.ty;
}

export function parameterName(parameter: Parameter): string {
	return bindingName(parameter.binding);
}
