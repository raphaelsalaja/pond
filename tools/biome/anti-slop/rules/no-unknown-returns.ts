import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyTsReturnType, TsTypeAliasDeclaration } from "@biomejs/runtime/plugin";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.ts";
import { explicitReturnType, RETURN_TYPE_OWNER_KINDS } from "../shared/return-types.ts";
import { referenceName, typeArguments } from "../shared/syntax.ts";
import { isGenericAlias, referencedAliasName, topLevelTypeAliases } from "../shared/type-aliases.ts";

function resolvesToUnknown(
	type: AnyTsReturnType,
	aliases: ReadonlyMap<string, TsTypeAliasDeclaration>,
	shadowedAliases: ReadonlySet<string>,
	visited: ReadonlySet<string> = new Set(),
): boolean {
	if (type.kind === "TS_UNKNOWN_TYPE") return true;
	if (type.kind === "TS_PARENTHESIZED_TYPE")
		return type.ty !== undefined && resolvesToUnknown(type.ty, aliases, shadowedAliases, visited);
	if (type.kind === "TS_UNION_TYPE") {
		return type.types.some((member) => resolvesToUnknown(member, aliases, shadowedAliases, visited));
	}
	if (type.kind !== "TS_REFERENCE_TYPE") return false;
	const reference = referenceName(type);
	if (reference === "Promise" || reference === "PromiseLike") {
		const value = typeArguments(type)[0];
		return value !== undefined && resolvesToUnknown(value, aliases, shadowedAliases, visited);
	}
	const name = referencedAliasName(type);
	if (name === null || visited.has(name) || shadowedAliases.has(name)) return false;
	const alias = aliases.get(name);
	if (alias?.ty === undefined || isGenericAlias(alias)) return false;
	return resolvesToUnknown(alias.ty, aliases, shadowedAliases, new Set([...visited, name]));
}

export const noUnknownReturns = defineRule({
	query: ast("JS_MODULE", "JS_SCRIPT"),
	run(root) {
		const aliases = topLevelTypeAliases(root);
		for (const owner of root.descendants(RETURN_TYPE_OWNER_KINDS)) {
			const type = explicitReturnType(owner);
			if (type === undefined || !resolvesToUnknown(type, aliases, new Set())) continue;
			if (!resolvesToUnknown(type, aliases, lexicalTypeParameterNames(owner))) continue;
			registerDiagnostic(
				type,
				"error",
				"This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.",
			);
		}
	},
});
