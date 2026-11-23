import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyTsType, TsTypeAliasDeclaration } from "@biomejs/runtime/plugin";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.ts";
import { parameterName, parameterType } from "../shared/parameters.ts";
import { PARAMETER_KINDS } from "../shared/syntax.ts";
import { isGenericAlias, referencedAliasName, topLevelTypeAliases } from "../shared/type-aliases.ts";

function resolvesToObject(
	type: AnyTsType,
	aliases: ReadonlyMap<string, TsTypeAliasDeclaration>,
	shadowedAliases: ReadonlySet<string>,
	visited: ReadonlySet<string> = new Set(),
): boolean {
	if (type.kind === "TS_NON_PRIMITIVE_TYPE") return true;
	if (type.kind === "TS_PARENTHESIZED_TYPE")
		return type.ty !== undefined && resolvesToObject(type.ty, aliases, shadowedAliases, visited);
	if (type.kind === "TS_UNION_TYPE") {
		return type.types.some((member) => resolvesToObject(member, aliases, shadowedAliases, visited));
	}
	if (type.kind !== "TS_REFERENCE_TYPE") return false;
	const name = referencedAliasName(type);
	if (name === null || visited.has(name) || shadowedAliases.has(name)) return false;
	const alias = aliases.get(name);
	if (alias?.ty === undefined || isGenericAlias(alias)) return false;
	return resolvesToObject(alias.ty, aliases, shadowedAliases, new Set([...visited, name]));
}

export const noObjectParameters = defineRule({
	query: ast("JS_MODULE", "JS_SCRIPT"),
	run(root) {
		const aliases = topLevelTypeAliases(root);
		for (const parameter of root.descendants(PARAMETER_KINDS)) {
			const type = parameterType(parameter);
			if (type === undefined || !resolvesToObject(type, aliases, new Set())) continue;
			if (!resolvesToObject(type, aliases, lexicalTypeParameterNames(parameter))) continue;
			registerDiagnostic(
				type,
				"error",
				`Parameter \`${parameterName(parameter)}\` uses the broad \`object\` type. Accept a named owner type; parse external input at its boundary before calling this function.`,
			);
		}
	},
});
