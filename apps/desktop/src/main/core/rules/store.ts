import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "@pond/schema/json";
import { isJsonValue } from "@pond/schema/json";
import { z } from "zod";
import {
  RULE_CAP,
  RuleInputSchema,
  RuleSchema,
} from "../../../shared/rule-contracts";
import type { Rule, RuleInput } from "../../../shared/rule-contracts";
import { readBundleJson, writeBundleJson } from "../../lib/library-config";
import { resolvePaths } from "../../paths";

const JsonEntrySchema = z.custom<JsonValue>(isJsonValue);

/** Entries stay raw so a Rule written by a newer build survives a save from this one. */
const RuleFileSchema = z.object({
  version: z.literal(1),
  rules: z.array(JsonEntrySchema),
  /** Set once Source incoming filing has moved into Rules for this Library. */
  incomingMigrated: z.boolean().catch(false),
});
type RuleFile = z.infer<typeof RuleFileSchema>;

const EMPTY_FILE: RuleFile = { version: 1, rules: [], incomingMigrated: false };

export function rulesFile(root: string): string {
  return join(root, "rules.json");
}

export interface RuleShelf {
  rules: Array<Rule>;
  /** Entries this build can't parse, kept in file order after the readable ones. */
  unreadable: Array<JsonValue>;
  incomingMigrated: boolean;
}

function readFile(root: string): RuleFile {
  const file = rulesFile(root);
  const stored = readBundleJson(file, resolvePaths().backupDir);
  if (!stored) {
    if (existsSync(file)) throw new Error("Your Rules could not be read.");
    return EMPTY_FILE;
  }
  return RuleFileSchema.parse(stored.data);
}

export function readRules(root = resolvePaths().libraryRoot): RuleShelf {
  const file = readFile(root);
  const rules: Array<Rule> = [];
  const unreadable: Array<JsonValue> = [];
  for (const entry of file.rules) {
    const parsed = RuleSchema.safeParse(entry);
    if (parsed.success) rules.push(parsed.data);
    else unreadable.push(entry);
  }
  return { rules, unreadable, incomingMigrated: file.incomingMigrated };
}

export function listRules(root = resolvePaths().libraryRoot): Array<Rule> {
  return readRules(root).rules;
}

export function writeRules(
  shelf: RuleShelf,
  root = resolvePaths().libraryRoot,
): void {
  const rules = z.array(RuleSchema).parse(shelf.rules);
  writeBundleJson(rulesFile(root), {
    version: 1,
    rules: [...rules, ...shelf.unreadable],
    incomingMigrated: shelf.incomingMigrated,
  });
}

function requireRule(shelf: RuleShelf, id: string): Rule {
  const rule = shelf.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error("That Rule no longer exists.");
  return rule;
}

export function getRule(
  id: string,
  root = resolvePaths().libraryRoot,
): Rule | null {
  return listRules(root).find((rule) => rule.id === id) ?? null;
}

export function createRule(
  input: RuleInput,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Rule {
  const shelf = readRules(root);
  if (shelf.rules.length >= RULE_CAP) {
    throw new Error(`A Library can have up to ${RULE_CAP} Rules.`);
  }
  const rule = RuleSchema.parse({
    ...RuleInputSchema.parse(input),
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
  writeRules({ ...shelf, rules: [...shelf.rules, rule] }, root);
  return rule;
}

export function updateRule(
  id: string,
  input: RuleInput,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Rule {
  const shelf = readRules(root);
  const current = requireRule(shelf, id);
  const next = RuleSchema.parse({
    ...RuleInputSchema.parse(input),
    id,
    createdAt: current.createdAt,
    updatedAt: now,
  });
  writeRules(
    {
      ...shelf,
      rules: shelf.rules.map((rule) => (rule.id === id ? next : rule)),
    },
    root,
  );
  return next;
}

export function setRuleEnabled(
  id: string,
  enabled: boolean,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Rule {
  const current = requireRule(readRules(root), id);
  return updateRule(id, { ...current, enabled }, root, now);
}

function copyName(name: string, taken: ReadonlyArray<Rule>): string {
  const names = new Set(taken.map((rule) => rule.name.toLocaleLowerCase()));
  const base = `${name} Copy`.slice(0, 80);
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const next = `${name} Copy ${n}`.slice(0, 80);
    if (!names.has(next.toLocaleLowerCase())) return next;
  }
}

/** The copy starts off, so duplicating a Rule never files the same Saves twice by surprise. */
export function duplicateRule(
  id: string,
  root = resolvePaths().libraryRoot,
  now = Date.now(),
): Rule {
  const shelf = readRules(root);
  const current = requireRule(shelf, id);
  return createRule(
    {
      name: copyName(current.name, shelf.rules),
      enabled: false,
      trigger: current.trigger,
      conditions: current.conditions,
      actions: current.actions,
    },
    root,
    now,
  );
}

export function deleteRule(
  id: string,
  root = resolvePaths().libraryRoot,
): void {
  const shelf = readRules(root);
  requireRule(shelf, id);
  writeRules(
    { ...shelf, rules: shelf.rules.filter((rule) => rule.id !== id) },
    root,
  );
}

export function markIncomingMigrated(
  added: ReadonlyArray<Rule>,
  root = resolvePaths().libraryRoot,
): void {
  const shelf = readRules(root);
  writeRules(
    {
      ...shelf,
      rules: [...shelf.rules, ...added],
      incomingMigrated: true,
    },
    root,
  );
}
