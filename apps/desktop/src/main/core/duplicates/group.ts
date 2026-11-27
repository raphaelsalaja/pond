import { relationRank } from "../../../shared/duplicate-contracts";
import type {
  DuplicateGroup,
  DuplicatePair,
} from "../../../shared/duplicate-contracts";

class UnionFind {
  #parent = new Map<string, string>();

  find(id: string): string {
    let root = id;
    for (let next = this.#parent.get(root); next && next !== root;) {
      root = next;
      next = this.#parent.get(root);
    }
    for (let node = id; node !== root;) {
      const next = this.#parent.get(node) ?? root;
      this.#parent.set(node, root);
      node = next;
    }
    return root;
  }

  union(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a === b) return;
    if (a < b) this.#parent.set(b, a);
    else this.#parent.set(a, b);
  }

  has(id: string): boolean {
    return this.#parent.has(id);
  }

  add(id: string): void {
    if (!this.#parent.has(id)) this.#parent.set(id, id);
  }
}

/** Near and exact groups never share a Save, so one pass over the pairs finds every pair inside each group, already in position order. */
function fillGroupPairs(
  groups: ReadonlyArray<DuplicateGroup>,
  pairs: ReadonlyArray<DuplicatePair>,
): void {
  const groupOf = new Map<string, DuplicateGroup>();
  for (const group of groups) {
    for (const id of group.ids) groupOf.set(id, group);
  }
  for (const [position, pair] of pairs.entries()) {
    const group = groupOf.get(pair.ids[0]);
    if (group && group === groupOf.get(pair.ids[1])) group.pairs.push(position);
  }
}

/** Exact matches are transitive and union; near matches are not, so a near group only admits Saves that match every member, and absorbs any exact group it touches. */
export function groupPairs(
  pairs: ReadonlyArray<DuplicatePair>,
): Array<DuplicateGroup> {
  const exact = new UnionFind();
  for (const pair of pairs) {
    if (pair.relation !== "exact") continue;
    exact.add(pair.ids[0]);
    exact.add(pair.ids[1]);
    exact.union(pair.ids[0], pair.ids[1]);
  }
  const exactComponents = new Map<string, Set<string>>();
  for (const pair of pairs) {
    if (pair.relation !== "exact") continue;
    for (const id of pair.ids) {
      const root = exact.find(id);
      const members = exactComponents.get(root) ?? new Set<string>();
      exactComponents.set(root, members);
      members.add(id);
    }
  }
  /** Exact copies share content, so near grouping treats each exact component as one node. */
  const node = (id: string) => (exact.has(id) ? exact.find(id) : id);
  const membersOf = (root: string) => exactComponents.get(root) ?? [root];

  const near = new Map<string, Set<string>>();
  const link = (left: string, right: string) => {
    const set = near.get(left) ?? new Set<string>();
    near.set(left, set);
    set.add(right);
  };
  for (const pair of pairs) {
    if (pair.relation !== "near") continue;
    const left = node(pair.ids[0]);
    const right = node(pair.ids[1]);
    if (left === right) continue;
    link(left, right);
    link(right, left);
  }

  const groups: Array<DuplicateGroup> = [];
  const nearGroupOf = new Map<string, number>();
  for (const pair of pairs) {
    if (pair.relation !== "near") continue;
    const left = node(pair.ids[0]);
    const right = node(pair.ids[1]);
    if (left === right || nearGroupOf.has(left) || nearGroupOf.has(right)) {
      continue;
    }
    const nodes = [left, right];
    const candidates = new Set([
      ...(near.get(left) ?? []),
      ...(near.get(right) ?? []),
    ]);
    for (const candidate of [...candidates].sort()) {
      if (nodes.includes(candidate) || nearGroupOf.has(candidate)) {
        continue;
      }
      if (nodes.every((member) => near.get(member)?.has(candidate))) {
        nodes.push(candidate);
      }
    }
    const position = groups.length;
    for (const member of nodes) nearGroupOf.set(member, position);
    const ids = nodes.flatMap((member) => [...membersOf(member)]).sort();
    groups.push({ relation: "near", ids, pairs: [] });
  }

  for (const [root, members] of exactComponents) {
    if (nearGroupOf.has(root)) continue;
    const ids = [...members].sort();
    groups.push({ relation: "exact", ids, pairs: [] });
  }
  fillGroupPairs(groups, pairs);

  pairs.forEach((pair, position) => {
    const left = node(pair.ids[0]);
    const right = node(pair.ids[1]);
    if (pair.relation === "exact" || left === right) return;
    const leftGroup = nearGroupOf.get(left);
    if (leftGroup !== undefined && leftGroup === nearGroupOf.get(right)) return;
    groups.push({
      relation: pair.relation,
      ids: [pair.ids[0], pair.ids[1]],
      pairs: [position],
    });
  });

  return groups.sort(
    (left, right) =>
      relationRank(left.relation) - relationRank(right.relation) ||
      right.ids.length - left.ids.length ||
      (left.ids[0] ?? "").localeCompare(right.ids[0] ?? ""),
  );
}
