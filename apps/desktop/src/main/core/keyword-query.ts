import { folderMetadata, folders, saveFolders, saves } from "@pond/schema/db";
import { type SQL, sql } from "drizzle-orm";

export type KeywordScope =
  | "title"
  | "description"
  | "creator"
  | "tags"
  | "notes"
  | "url"
  | "folder"
  | "folder-description"
  | "extension"
  | "annotation";
type IndexedKeywordScope = Exclude<
  KeywordScope,
  "folder" | "folder-description" | "extension"
>;
type Keyword =
  | {
      kind: "term";
      value: string;
      phrase: boolean;
      scope?: KeywordScope;
    }
  | { kind: "not"; child: Keyword }
  | { kind: "and" | "or"; left: Keyword; right: Keyword };

type Token =
  | Extract<Keyword, { kind: "term" }>
  | { kind: "and" | "or" | "not" | "open" | "close" };

const SCOPES = new Set<string>([
  "title",
  "description",
  "creator",
  "tags",
  "notes",
  "url",
  "folder",
  "folder-description",
  "extension",
  "annotation",
]);
function isKeywordScope(value: string): value is KeywordScope {
  return SCOPES.has(value);
}

function tokenize(query: string): Token[] {
  if (query.length > 4096) throw new Error("Search is too long.");
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < query.length) {
    const char = query[offset];
    if (!char || /\s/.test(char)) {
      offset += 1;
      continue;
    }
    if (char === "(" || char === ")" || char === "-") {
      tokens.push({
        kind: char === "(" ? "open" : char === ")" ? "close" : "not",
      });
      offset += 1;
      continue;
    }
    if (query.slice(offset, offset + 2) === "||") {
      tokens.push({ kind: "or" });
      offset += 2;
      continue;
    }
    const scoped = query.slice(offset).match(/^([\p{L}-]+):/u);
    const rawScope = scoped?.[1]?.toLowerCase();
    const scope = rawScope && isKeywordScope(rawScope) ? rawScope : undefined;
    if (scope) offset += scoped?.[0].length ?? 0;
    const phrase = query[offset] === '"';
    if (phrase) offset += 1;
    let value = "";
    while (offset < query.length) {
      const current = query[offset] ?? "";
      if (phrase && current === '"') {
        offset += 1;
        break;
      }
      if (
        !phrase &&
        (/\s|[()]/.test(current) || query.slice(offset, offset + 2) === "||")
      )
        break;
      if (
        phrase &&
        current === "\\" &&
        ['"', "\\"].includes(query[offset + 1] ?? "")
      )
        offset += 1;
      value += query[offset] ?? "";
      offset += 1;
    }
    if (!phrase && ["AND", "OR", "NOT"].includes(value)) {
      tokens.push({
        kind: value === "AND" ? "and" : value === "OR" ? "or" : "not",
      });
    } else {
      value = value.replaceAll("*", "").trim();
      if (/[\p{L}\p{N}]/u.test(value))
        tokens.push({ kind: "term", value, phrase, scope });
    }
    if (tokens.length > 128) throw new Error("Search has too many conditions.");
  }
  return tokens;
}

function parse(query: string, mode: "all" | "any"): Keyword | null {
  const tokens = tokenize(query);
  let position = 0;
  let depth = 0;
  const startsOperand = () =>
    ["term", "not", "open"].includes(tokens[position]?.kind ?? "");

  function operand(): Keyword {
    depth += 1;
    if (depth > 32) throw new Error("Search groups are nested too deeply.");
    const token = tokens[position++];
    let result: Keyword;
    if (token?.kind === "term") result = token;
    else if (token?.kind === "not") result = { kind: "not", child: operand() };
    else if (token?.kind === "open") {
      result = disjunction();
      if (tokens[position++]?.kind !== "close")
        throw new Error("Close the search group with a parenthesis.");
    } else throw new Error("Enter a keyword after the search operator.");
    depth -= 1;
    return result;
  }

  function conjunction(): Keyword {
    let left = operand();
    while (
      tokens[position]?.kind === "and" ||
      (mode === "all" && startsOperand())
    ) {
      if (tokens[position]?.kind === "and") position += 1;
      left = { kind: "and", left, right: operand() };
    }
    return left;
  }

  function disjunction(): Keyword {
    let left = conjunction();
    while (
      tokens[position]?.kind === "or" ||
      (mode === "any" && startsOperand())
    ) {
      if (tokens[position]?.kind === "or") position += 1;
      left = { kind: "or", left, right: conjunction() };
    }
    return left;
  }

  if (!tokens.length) return null;
  const result = disjunction();
  if (position !== tokens.length)
    throw new Error("Unexpected search operator or parenthesis.");
  return result;
}

function termQuery(term: Extract<Keyword, { kind: "term" }>): string {
  const value = `"${term.value.replaceAll('"', '""')}"${term.phrase ? "" : "*"}`;
  const columns = {
    title: "title",
    description: "description",
    creator: "author",
    tags: "tag_names",
    notes: "notes",
    url: "url",
    annotation: "annotations",
  } satisfies Record<IndexedKeywordScope, string>;
  if (
    !term.scope ||
    term.scope === "folder" ||
    term.scope === "folder-description" ||
    term.scope === "extension"
  )
    return value;
  return `${columns[term.scope]} : ${value}`;
}

export function compileKeywordWhere(
  query: string,
  mode: "all" | "any" = "all",
  scopes?: readonly KeywordScope[],
): SQL | undefined {
  const tree = parse(query, mode);
  function compileTerm(
    term: Extract<Keyword, { kind: "term" }>,
    scope = term.scope,
  ): SQL {
    if (!scope) {
      const indexed = sql`${saves.id} in (
        select id from saves_fts
        where saves_fts match ${termQuery(term)}
      )`;
      return sql`(${indexed})
        or (${compileTerm(term, "folder")})
        or (${compileTerm(term, "folder-description")})
        or (${compileTerm(term, "extension")})`;
    }
    if (scope === "folder" || scope === "folder-description") {
      const column =
        scope === "folder" ? folders.name : folderMetadata.description;
      const value = `%${term.value.toLowerCase()}%`;
      return sql`exists (
        select 1 from ${saveFolders}
        inner join ${folders} on ${folders.id} = ${saveFolders.folderId}
        left join ${folderMetadata} on ${folderMetadata.folderId} = ${folders.id}
        where ${saveFolders.saveId} = ${saves.id}
          and lower(coalesce(${column}, '')) like ${value}
      )`;
    }
    if (scope === "extension") {
      const value = `%.${term.value.toLowerCase()}%`;
      return sql`exists (
        select 1 from json_each(${saves.files})
        where lower(json_extract(value, '$.path')) like ${value}
      )`;
    }
    return sql`${saves.id} in (
      select id from saves_fts
      where saves_fts match ${termQuery({ ...term, scope })}
    )`;
  }
  function compile(node: Keyword): SQL {
    if (node.kind === "term") {
      const selected = node.scope ? [node.scope] : scopes;
      if (!selected?.length) return compileTerm(node);
      const [first, ...rest] = selected;
      if (!first) return compileTerm(node);
      return rest.reduce<SQL>(
        (where, scope) => sql`(${where}) or (${compileTerm(node, scope)})`,
        compileTerm(node, first),
      );
    }
    if (node.kind === "not") return sql`not (${compile(node.child)})`;
    return node.kind === "and"
      ? sql`(${compile(node.left)}) and (${compile(node.right)})`
      : sql`(${compile(node.left)}) or (${compile(node.right)})`;
  }
  /** Drizzle's and() does not parenthesize its parts, so a bare top-level OR would escape the caller's scope. */
  return tree ? sql`(${compile(tree)})` : undefined;
}

interface Literal {
  term: Extract<Keyword, { kind: "term" }>;
  negative: boolean;
}

function alternatives(node: Keyword, negative = false): Literal[][] {
  if (node.kind === "term") return [[{ term: node, negative }]];
  if (node.kind === "not") return alternatives(node.child, !negative);
  const left = alternatives(node.left, negative);
  const right = alternatives(node.right, negative);
  const union = (node.kind === "or") !== negative;
  if (union) {
    if (left.length + right.length > 128)
      throw new Error("Search has too many alternatives.");
    return [...left, ...right];
  }
  if (left.length * right.length > 128)
    throw new Error("Search has too many alternatives.");
  return left.flatMap((a) => right.map((b) => [...a, ...b]));
}

export function toFtsMatchQuery(
  query: string,
  mode: "all" | "any" = "all",
): string | null {
  const tree = parse(query, mode);
  if (!tree) return null;
  const hasFolderScope = (node: Keyword): boolean =>
    node.kind === "term"
      ? node.scope === "folder" || node.scope === "folder-description"
      : node.kind === "not"
        ? hasFolderScope(node.child)
        : hasFolderScope(node.left) || hasFolderScope(node.right);
  if (hasFolderScope(tree))
    throw new Error("Folder fields require the full-library keyword query.");
  const branches = alternatives(tree).map((branch) => {
    const include = branch
      .filter((literal) => !literal.negative)
      .map((literal) => termQuery(literal.term));
    const exclude = branch
      .filter((literal) => literal.negative)
      .map((literal) => termQuery(literal.term));
    if (!include.length)
      throw new Error(
        "This search needs the full-library keyword query to evaluate exclusions.",
      );
    const positive = include.join(" AND ");
    return exclude.length
      ? `(${positive}) NOT (${exclude.join(" OR ")})`
      : positive;
  });
  return branches.length === 1
    ? (branches[0] ?? null)
    : branches.map((branch) => `(${branch})`).join(" OR ");
}
