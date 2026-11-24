import { ast, defineRule, registerDiagnostic } from "@biomejs/runtime/plugin";

import type { AnyTsType, TsTypeAliasDeclaration } from "@biomejs/runtime/plugin";

import { isGenericAlias, referencedAliasName, topLevelTypeAliases } from "../shared/type-aliases.ts";

function resolvesToUnknown(
	type: AnyTsType,
	aliases: ReadonlyMap<string, TsTypeAliasDeclaration>,
	visited: ReadonlySet<string>,
): boolean {
	if (type.kind === "TS_UNKNOWN_TYPE") return true;
	if (type.kind === "TS_PARENTHESIZED_TYPE")
		return type.ty !== undefined && resolvesToUnknown(type.ty, aliases, visited);
	const name = referencedAliasName(type);
	if (name === null || visited.has(name)) return false;
	const alias = aliases.get(name);
	if (alias?.ty === undefined || isGenericAlias(alias)) return false;
	return resolvesToUnknown(alias.ty, aliases, new Set([...visited, name]));
}

export const noUnknownTypeAliases = defineRule({
	query: ast("JS_MODULE", "JS_SCRIPT"),
	run(root) {
		const aliases = topLevelTypeAliases(root);
		for (const [name, alias] of aliases) {
			const id = alias.bindingIdentifier;
			if (alias.ty === undefined || id === undefined) continue;
			if (!resolvesToUnknown(alias.ty, aliases, new Set([name]))) continue;
			registerDiagnostic(
				id,
				"error",
				`Type alias \`${name}\` hides \`unknown\`. Keep \`unknown\` explicit at the parsing boundary or on an allowed \`cause\` field; otherwise use the parsed owner type.`,
			);
		}
	},
});
