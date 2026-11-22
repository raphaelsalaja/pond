import type {
	AnyJsExpression,
	AnyTsType,
	TsInterfaceDeclaration,
	TsObjectType,
	TsReferenceType,
	TsTypeAliasDeclaration,
} from "@biomejs/runtime/plugin";

import {
	declaredStatement,
	referenceName,
	type SourceRoot,
	type SyntaxNode,
	topLevelStatements,
	typeArguments,
} from "./syntax.ts";

const BUILT_INS = new Set([
	"Record",
	"Readonly",
	"Partial",
	"Required",
	"Pick",
	"Omit",
	"PropertyKey",
	"NonNullable",
]);
const TRANSPARENT_WRAPPERS = new Set(["Readonly", "Partial", "Required", "NonNullable"]);

type TypeAliasEnvironment = ReadonlyMap<string, AnyTsType>;

type ResolvedType = {
	readonly type: AnyTsType;
	readonly substitutions: TypeAliasEnvironment;
};

export type UnsafeDictionary = {
	readonly kind: "unsafe-dictionary";
	readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
};

export type WideningTargetKind =
	| "anonymous object"
	| "generic container"
	| "object"
	| "open dictionary"
	| "unknown";

export type WideningTarget = {
	readonly kind: WideningTargetKind;
};

export type TypeEnvironment = {
	readonly aliases: ReadonlyMap<string, TsTypeAliasDeclaration>;
	readonly interfaces: ReadonlyMap<string, readonly TsInterfaceDeclaration[]>;
	readonly shadowedBuiltIns: ReadonlySet<string>;
};

function importedLocalNames(statement: SyntaxNode): readonly string[] {
	if (statement.kind !== "JS_IMPORT") return [];
	const clause = statement.importClause;
	const names: string[] = [];
	const add = (binding: SyntaxNode | undefined) => {
		if (binding !== undefined) names.push(binding.text);
	};
	if (clause?.kind === "JS_IMPORT_DEFAULT_CLAUSE" || clause?.kind === "JS_IMPORT_COMBINED_CLAUSE") {
		add(clause.defaultSpecifier?.localName);
	}
	if (clause?.kind === "JS_IMPORT_NAMESPACE_CLAUSE") add(clause.namespaceSpecifier?.localName);
	const specifiers =
		clause?.kind === "JS_IMPORT_NAMED_CLAUSE"
			? clause.namedSpecifiers
			: clause?.kind === "JS_IMPORT_COMBINED_CLAUSE"
				? clause.specifier
				: undefined;
	if (specifiers?.kind === "JS_NAMESPACE_IMPORT_SPECIFIER") add(specifiers.localName);
	if (specifiers?.kind === "JS_NAMED_IMPORT_SPECIFIERS") {
		for (const specifier of specifiers.specifiers) {
			if (
				specifier.kind === "JS_NAMED_IMPORT_SPECIFIER" ||
				specifier.kind === "JS_SHORTHAND_NAMED_IMPORT_SPECIFIER"
			) {
				add(specifier.localName);
			}
		}
	}
	return names;
}

export function createTypeEnvironment(root: SourceRoot): TypeEnvironment {
	const aliases = new Map<string, TsTypeAliasDeclaration>();
	const interfaces = new Map<string, TsInterfaceDeclaration[]>();
	const shadowedBuiltIns = new Set<string>();
	const shadow = (name: string | undefined) => {
		if (name !== undefined && BUILT_INS.has(name)) shadowedBuiltIns.add(name);
	};

	for (const statement of topLevelStatements(root)) {
		for (const name of importedLocalNames(statement)) shadow(name);
		const declaration = declaredStatement(statement);

		if (declaration?.kind === "TS_TYPE_ALIAS_DECLARATION") {
			const name = declaration.bindingIdentifier?.text;
			if (name === undefined) continue;
			if (aliases.has(name)) shadowedBuiltIns.add(name);
			else aliases.set(name, declaration);
			shadow(name);
			continue;
		}

		if (declaration?.kind === "TS_INTERFACE_DECLARATION") {
			const name = declaration.id?.text;
			if (name === undefined) continue;
			interfaces.set(name, [...(interfaces.get(name) ?? []), declaration]);
			shadow(name);
			continue;
		}

		if (
			declaration?.kind === "TS_ENUM_DECLARATION" ||
			declaration?.kind === "JS_CLASS_DECLARATION" ||
			declaration?.kind === "JS_CLASS_EXPORT_DEFAULT_DECLARATION" ||
			declaration?.kind === "JS_FUNCTION_DECLARATION" ||
			declaration?.kind === "JS_FUNCTION_EXPORT_DEFAULT_DECLARATION"
		) {
			shadow(declaration.id?.text);
		}
	}

	return { aliases, interfaces, shadowedBuiltIns };
}

function isBuiltIn(name: string, environment: TypeEnvironment): boolean {
	return BUILT_INS.has(name) && !environment.shadowedBuiltIns.has(name);
}

export function unwrapTransparentType(type: AnyTsType): AnyTsType {
	let current = type;
	while (true) {
		if (current.kind === "TS_PARENTHESIZED_TYPE" && current.ty !== undefined) current = current.ty;
		else if (
			current.kind === "TS_TYPE_OPERATOR_TYPE" &&
			current.operatorToken === "readonly" &&
			current.ty !== undefined
		)
			current = current.ty;
		else return current;
	}
}

function isUnappliedReferenceTo(type: AnyTsType, name: string): boolean {
	const unwrapped = unwrapTransparentType(type);
	return (
		unwrapped.kind === "TS_REFERENCE_TYPE" &&
		referenceName(unwrapped) === name &&
		typeArguments(unwrapped).length === 0
	);
}

function isEffectivelyEmptyMember(member: SyntaxNode): boolean {
	return (
		member.kind === "TS_PROPERTY_SIGNATURE_TYPE_MEMBER" &&
		member.optionalToken !== undefined &&
		member.typeAnnotation?.ty !== undefined &&
		unwrapTransparentType(member.typeAnnotation.ty).kind === "TS_NEVER_TYPE"
	);
}

function isEffectivelyEmptyTypeLiteral(type: TsObjectType): boolean {
	return type.members.length === 0 || type.members.every(isEffectivelyEmptyMember);
}

function isEffectivelyEmptyInterface(declarations: readonly TsInterfaceDeclaration[]): boolean {
	if (declarations.length !== 1) return false;
	const [type] = declarations;
	return (
		type !== undefined &&
		(type.extendsClause?.types.length ?? 0) === 0 &&
		(type.members.length === 0 || type.members.every(isEffectivelyEmptyMember))
	);
}

function resolvedSubstitutionArgument(
	type: AnyTsType,
	base: TypeAliasEnvironment,
	resolving: ReadonlySet<string> = new Set(),
): AnyTsType {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return type;
	const name = referenceName(unwrapped);
	if (name === null || resolving.has(name)) return type;
	const substitution = base.get(name);
	if (substitution === undefined) return type;
	return resolvedSubstitutionArgument(substitution, base, new Set([...resolving, name]));
}

function aliasSubstitution(
	alias: TsTypeAliasDeclaration,
	type: TsReferenceType,
	base: TypeAliasEnvironment,
): TypeAliasEnvironment | null {
	const parameters = alias.typeParameters?.items ?? [];
	const arguments_ = typeArguments(type);
	const next = new Map(base);
	for (const [index, parameter] of parameters.entries()) {
		if (parameter.kind !== "TS_TYPE_PARAMETER") return null;
		const argument = arguments_[index] ?? parameter.default?.ty;
		const name = parameter.name?.identToken;
		if (argument === undefined || name === undefined) return null;
		next.set(name, resolvedSubstitutionArgument(argument, next));
	}
	return next;
}

function firstTypeArgument(type: TsReferenceType): AnyTsType | undefined {
	return typeArguments(type)[0];
}

function unsafeDirectValue(
	type: AnyTsType,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
	resolvingAliases: ReadonlySet<string>,
): UnsafeDictionary["unsafeValue"] | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.kind === "TS_UNKNOWN_TYPE") return "unknown";
	if (unwrapped.kind === "TS_ANY_TYPE") return "any";
	if (unwrapped.kind === "TS_NON_PRIMITIVE_TYPE") return "object";
	if (unwrapped.kind === "TS_OBJECT_TYPE" && isEffectivelyEmptyTypeLiteral(unwrapped))
		return "empty-object";
	if (unwrapped.kind === "TS_UNION_TYPE") {
		return unwrapped.types.some(
			(member) => unsafeDirectValue(member, environment, substitutions, resolvingAliases) !== null,
		)
			? "union"
			: null;
	}
	if (unwrapped.kind === "TS_INTERSECTION_TYPE") {
		const unsafeMembers = unwrapped.types.map((member) =>
			unsafeDirectValue(member, environment, substitutions, resolvingAliases),
		);
		if (unsafeMembers.includes("any")) return "any";
		return unsafeMembers.length > 0 && unsafeMembers.every((member) => member !== null)
			? (unsafeMembers[0] ?? null)
			: null;
	}
	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return null;
	const name = referenceName(unwrapped);
	if (name === null) return null;
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment)) {
		const wrapped = firstTypeArgument(unwrapped);
		return wrapped === undefined
			? null
			: unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases);
	}
	const substitution = substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? null
			: unsafeDirectValue(substitution, environment, substitutions, resolvingAliases);
	}
	const interfaceDeclarations = environment.interfaces.get(name);
	if (interfaceDeclarations !== undefined) {
		return isEffectivelyEmptyInterface(interfaceDeclarations) ? "empty-object" : null;
	}
	const alias = environment.aliases.get(name);
	if (alias?.ty === undefined || resolvingAliases.has(name)) return null;
	const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
	if (nextSubstitutions === null) return null;
	return unsafeDirectValue(
		alias.ty,
		environment,
		nextSubstitutions,
		new Set([...resolvingAliases, name]),
	);
}

function dictionaryValueTypes(
	type: AnyTsType,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
	resolvingAliases: ReadonlySet<string>,
): readonly ResolvedType[] {
	const unwrapped = unwrapTransparentType(type);

	if (unwrapped.kind === "TS_OBJECT_TYPE") {
		return unwrapped.members.flatMap((member): readonly ResolvedType[] =>
			member.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER" && member.typeAnnotation?.ty !== undefined
				? [{ type: member.typeAnnotation.ty, substitutions }]
				: [],
		);
	}

	if (unwrapped.kind === "TS_MAPPED_TYPE") {
		const value = unwrapped.mappedType?.ty;
		return value === undefined ? [] : [{ type: value, substitutions }];
	}

	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return [];
	const name = referenceName(unwrapped);
	if (name === null) return [];

	const substitution = substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? []
			: dictionaryValueTypes(substitution, environment, substitutions, resolvingAliases);
	}

	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment)) {
		const wrapped = firstTypeArgument(unwrapped);
		return wrapped === undefined
			? []
			: dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases);
	}

	if (name === "Record" && isBuiltIn(name, environment)) {
		const value = typeArguments(unwrapped)[1];
		return value === undefined ? [] : [{ type: value, substitutions }];
	}

	if ((name === "Pick" || name === "Omit") && isBuiltIn(name, environment)) {
		const source = firstTypeArgument(unwrapped);
		return source === undefined
			? []
			: dictionaryValueTypes(source, environment, substitutions, resolvingAliases);
	}

	const alias = environment.aliases.get(name);
	if (alias?.ty === undefined || resolvingAliases.has(name)) return [];
	const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
	if (nextSubstitutions === null) return [];
	return dictionaryValueTypes(
		alias.ty,
		environment,
		nextSubstitutions,
		new Set([...resolvingAliases, name]),
	);
}

export function classifyUnsafeDictionaryValue(
	valueType: AnyTsType,
	environment: TypeEnvironment,
): UnsafeDictionary | null {
	const unsafeValue = unsafeDirectValue(valueType, environment, new Map(), new Set());
	return unsafeValue === null ? null : { kind: "unsafe-dictionary", unsafeValue };
}

export function classifyUnsafeDictionary(
	type: AnyTsType,
	environment: TypeEnvironment,
): UnsafeDictionary | null {
	for (const valueType of dictionaryValueTypes(type, environment, new Map(), new Set())) {
		const unsafeValue = unsafeDirectValue(
			valueType.type,
			environment,
			valueType.substitutions,
			new Set(),
		);
		if (unsafeValue !== null) return { kind: "unsafe-dictionary", unsafeValue };
	}
	return null;
}

export function classifyWideningTarget(
	type: AnyTsType,
	environment: TypeEnvironment,
): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.kind === "TS_UNKNOWN_TYPE") return { kind: "unknown" };
	if (unwrapped.kind === "TS_NON_PRIMITIVE_TYPE") return { kind: "object" };
	if (unwrapped.kind === "TS_OBJECT_TYPE") {
		return unwrapped.members.some((member) => member.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER")
			? { kind: "open dictionary" }
			: unwrapped.members.length > 0
				? { kind: "anonymous object" }
				: null;
	}
	if (unwrapped.kind === "TS_MAPPED_TYPE") return { kind: "open dictionary" };
	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return null;
	const name = referenceName(unwrapped);
	if (name === null) return null;
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment)) {
		const wrapped = firstTypeArgument(unwrapped);
		return wrapped === undefined ? null : classifyWideningTarget(wrapped, environment);
	}
	if (name === "Record" && isBuiltIn(name, environment)) return { kind: "open dictionary" };
	const alias = environment.aliases.get(name);
	if (alias?.ty === undefined) return null;
	const substitutions = aliasSubstitution(alias, unwrapped, new Map());
	if (substitutions === null) return null;
	if ((alias.typeParameters?.items.length ?? 0) > 0) {
		return dictionaryValueTypes(alias.ty, environment, substitutions, new Set([name])).length > 0
			? { kind: "generic container" }
			: null;
	}
	return classifyAliasBroadTarget(alias.ty, environment, substitutions, new Set([name]));
}

function isBroadMappedKey(
	type: AnyTsType,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
): boolean {
	const unwrapped = unwrapTransparentType(type);
	if (
		unwrapped.kind === "TS_STRING_TYPE" ||
		unwrapped.kind === "TS_NUMBER_TYPE" ||
		unwrapped.kind === "TS_SYMBOL_TYPE"
	) {
		return true;
	}
	if (unwrapped.kind === "TS_UNION_TYPE") {
		return unwrapped.types.every((member) => isBroadMappedKey(member, environment, substitutions));
	}
	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return false;
	const name = referenceName(unwrapped);
	if (name === null) return false;
	const substitution = substitutions.get(name);
	if (substitution !== undefined && !isUnappliedReferenceTo(substitution, name)) {
		return isBroadMappedKey(substitution, environment, substitutions);
	}
	return name === "PropertyKey" && isBuiltIn(name, environment);
}

function classifyAliasBroadTarget(
	type: AnyTsType,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
	resolvingAliases: ReadonlySet<string>,
): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.kind === "TS_UNKNOWN_TYPE") return { kind: "unknown" };
	if (unwrapped.kind === "TS_NON_PRIMITIVE_TYPE") return { kind: "object" };
	if (unwrapped.kind === "TS_OBJECT_TYPE") {
		return unwrapped.members.some((member) => member.kind === "TS_INDEX_SIGNATURE_TYPE_MEMBER")
			? { kind: "open dictionary" }
			: null;
	}
	if (unwrapped.kind === "TS_MAPPED_TYPE") {
		return unwrapped.keysType !== undefined &&
			isBroadMappedKey(unwrapped.keysType, environment, substitutions)
			? { kind: "open dictionary" }
			: null;
	}
	if (unwrapped.kind !== "TS_REFERENCE_TYPE") return null;
	const name = referenceName(unwrapped);
	if (name === null) return null;
	const substitution = substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? null
			: classifyAliasBroadTarget(substitution, environment, substitutions, resolvingAliases);
	}
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment)) {
		const wrapped = firstTypeArgument(unwrapped);
		return wrapped === undefined
			? null
			: classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases);
	}
	if (name === "Record" && isBuiltIn(name, environment)) return { kind: "open dictionary" };
	const alias = environment.aliases.get(name);
	if (alias?.ty === undefined || resolvingAliases.has(name)) return null;
	const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
	if (nextSubstitutions === null) return null;
	return classifyAliasBroadTarget(
		alias.ty,
		environment,
		nextSubstitutions,
		new Set([...resolvingAliases, name]),
	);
}

const KNOWN_EVIDENCE_KINDS = new Set([
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
	"JS_UNARY_EXPRESSION",
]);

/** Strips parentheses, assertions, `satisfies`, and non-null markers around an expression. */
export function unwrapExpression(expression: AnyJsExpression): AnyJsExpression {
	let current = expression;
	while (
		(current.kind === "JS_PARENTHESIZED_EXPRESSION" ||
			current.kind === "TS_AS_EXPRESSION" ||
			current.kind === "TS_SATISFIES_EXPRESSION" ||
			current.kind === "TS_TYPE_ASSERTION_EXPRESSION" ||
			current.kind === "TS_NON_NULL_ASSERTION_EXPRESSION") &&
		current.expression !== undefined
	) {
		current = current.expression;
	}
	return current;
}

export function isKnownEvidenceExpression(expression: AnyJsExpression): boolean {
	const current = unwrapExpression(expression);
	if (current.kind === "JS_TEMPLATE_EXPRESSION") return current.tag === undefined;
	return KNOWN_EVIDENCE_KINDS.has(current.kind);
}
