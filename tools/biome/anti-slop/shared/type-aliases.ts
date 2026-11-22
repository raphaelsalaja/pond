import type { AnyTsType, TsTypeAliasDeclaration } from "@biomejs/runtime/plugin";

import {
	declaredStatement,
	referenceName,
	type SourceRoot,
	topLevelStatements,
	typeArguments,
} from "./syntax.ts";

/** Maps each top-level type alias name to its last declaration. */
export function topLevelTypeAliases(root: SourceRoot): Map<string, TsTypeAliasDeclaration> {
	const aliases = new Map<string, TsTypeAliasDeclaration>();
	for (const statement of topLevelStatements(root)) {
		const declaration = declaredStatement(statement);
		if (declaration?.kind !== "TS_TYPE_ALIAS_DECLARATION") continue;
		const name = declaration.bindingIdentifier?.text;
		if (name !== undefined) aliases.set(name, declaration);
	}
	return aliases;
}

/** Returns the alias name a bare, unapplied reference points at. */
export function referencedAliasName(type: AnyTsType): string | null {
	if (type.kind === "TS_PARENTHESIZED_TYPE")
		return type.ty === undefined ? null : referencedAliasName(type.ty);
	if (type.kind !== "TS_REFERENCE_TYPE") return null;
	return typeArguments(type).length === 0 ? referenceName(type) : null;
}

export function isGenericAlias(alias: TsTypeAliasDeclaration): boolean {
	return alias.typeParameters !== undefined;
}
