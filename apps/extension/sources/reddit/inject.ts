import {
  capture,
  installInterceptor,
  log,
  type RequestLens,
} from "@/utils/intercept";
import {
  asText,
  isRecord,
  type JsonRecord,
  parseJsonRecord,
} from "@/utils/json";

declare global {
  interface Window {
    __pondRedditInjected?: boolean;
  }
}

const LEGACY_SAVE_RE = /\/api\/save\b/i;
const LEGACY_VOTE_RE = /\/api\/vote\b/i;
const GRAPHQL_SAVE_RE = /\/svc\/shreddit\/graphql\b|gql\.reddit\.com/i;
const POST_ID_RE = /t3_([a-z0-9]+)/i;
const COMMENT_ID_RE = /t1_[a-z0-9]+/i;

function composedNodes(ev: Event): EventTarget[] {
  return ev.composedPath ? ev.composedPath() : [];
}

function compactText(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikeSaveLabel(label: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase().trim();
  if (/unsave|remove/.test(l)) return false;
  return l === "save" || l === "save post";
}

function iconName(el: Element): string | null {
  return (
    el.getAttribute("icon-name") ??
    el.querySelector("svg[icon-name]")?.getAttribute("icon-name") ??
    null
  );
}

function isSavedIcon(icon: string | null): boolean {
  if (!icon) return false;
  const name = icon.toLowerCase();
  return (
    name === "save-fill" ||
    name === "saved" ||
    (name.includes("save") && name.includes("fill"))
  );
}

function isUnsaveClick(el: Element): boolean {
  const icon = iconName(el);
  if (isSavedIcon(icon)) return true;
  const text = compactText(el.textContent);
  if (el.getAttribute("aria-pressed") === "true") {
    const label = el.getAttribute("aria-label");
    if (
      looksLikeSaveLabel(label) ||
      icon?.toLowerCase().includes("save") ||
      text === "save" ||
      text === "save post" ||
      text === "bookmark"
    ) {
      return true;
    }
  }
  return (
    text === "unsave" || text === "remove from saved" || text === "unsave post"
  );
}

function postIsSaved(node: Element): boolean {
  if (node.localName !== "shreddit-post" || !node.hasAttribute("saved")) {
    return false;
  }
  return node.getAttribute("saved") !== "false";
}

function isSaveClickNode(el: Element): boolean {
  if (el.closest?.(".save-comment-menu-button")) return false;
  if (isUnsaveClick(el)) return false;
  const icon = iconName(el);
  if (icon === "save-outline" || icon === "save") return true;
  if (icon?.includes("save") && !icon.includes("fill")) return true;
  if (looksLikeSaveLabel(el.getAttribute("aria-label"))) return true;
  const text = compactText(el.textContent);
  return text === "save" || text === "save post" || text === "bookmark";
}

function eventElements(ev: Event): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  const add = (node: EventTarget | null) => {
    if (!(node instanceof Element) || seen.has(node)) return;
    seen.add(node);
    out.push(node);
  };
  for (const node of composedNodes(ev)) add(node);
  if (ev.target instanceof Element) {
    let cur: Element | null = ev.target;
    let depth = 0;
    while (cur && depth < 24) {
      add(cur);
      const root = cur.getRootNode();
      cur =
        cur.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      depth++;
    }
  }
  return out;
}

/** The "Save" label is often a child of the control that already shows the saved state. */
export function isSaveClick(ev: Event): boolean {
  const nodes = eventElements(ev);
  let save = false;
  for (const node of nodes) {
    if (postIsSaved(node)) return false;
    if (compactText(node.textContent).length >= 32) continue;
    if (isUnsaveClick(node)) return false;
    if (isSaveClickNode(node)) save = true;
  }
  return save;
}

function permalinkFromPost(post: Element): string | null {
  const permalink =
    post.getAttribute("permalink") ?? post.getAttribute("content-href");
  if (permalink?.includes("/comments/")) {
    return permalink.startsWith("http")
      ? permalink
      : `https://www.reddit.com${permalink}`;
  }
  const idAttr =
    post.getAttribute("id") ??
    post.getAttribute("post-id") ??
    post.getAttribute("content-id") ??
    "";
  const m = idAttr.match(POST_ID_RE);
  return m ? `https://redd.it/${m[1]}` : null;
}

function permalinkFromPath(path: EventTarget[]): string | null {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.localName === "shreddit-post") {
      const url = permalinkFromPost(node);
      if (url) return url;
    }
    const fullname = node.getAttribute("data-fullname");
    if (fullname?.startsWith("t3_")) return fullnameToUrl(fullname);
    if (node instanceof HTMLAnchorElement && node.href.includes("/comments/")) {
      return node.href;
    }
  }
  return null;
}

function permalinkFromLocation(): string | null {
  const m = location.pathname.match(/\/comments\/([a-z0-9]+)/i);
  return m ? `https://redd.it/${m[1]}` : null;
}

function fullnameToUrl(id: string | null): string | null {
  const m = id ? id.match(/^t3_([a-z0-9]+)$/i) : null;
  return m ? `https://redd.it/${m[1]}` : null;
}

function readLegacyFullname(url: string, body: string | null): string | null {
  try {
    const fromQuery = new URL(url, location.href).searchParams.get("id");
    if (fromQuery) return fromQuery;
  } catch {
    return bodyFullname(body);
  }
  return bodyFullname(body);
}

function bodyFullname(body: string | null): string | null {
  if (!body) return null;
  try {
    const v = new URLSearchParams(body).get("id");
    if (v) return v;
  } catch {
    return regexFullname(body);
  }
  return regexFullname(body);
}

function regexFullname(body: string): string | null {
  const m = body.match(/"?id"?\s*[:=]\s*"?(t3_[a-z0-9]+)"?/i);
  return m?.[1] ?? null;
}

const POST_ID_FIELDS = ["postId", "post_id", "id", "thingId", "thing_id"];

function operationName(request: JsonRecord | null, body: string): string {
  const op = asText(request?.operation ?? request?.operationName);
  if (op !== undefined) return op;
  return /"operation(?:Name)?"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? "";
}

function graphqlInput(request: JsonRecord | null): JsonRecord {
  const vars = request?.variables;
  if (!isRecord(vars)) return {};
  return isRecord(vars.input) ? vars.input : vars;
}

function readSaveState(input: JsonRecord, body: string): string | null {
  const value = input.saveState ?? input.save_state;
  if (value === true) return "true";
  if (value === false) return "false";
  const text =
    asText(value) ?? /"save_?[Ss]tate"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  return text?.trim().toLowerCase() ?? null;
}

function isSavedState(state: string): boolean {
  return state === "saved" || state === "save" || state === "true";
}

export function isGraphqlSave(body: string | null): boolean {
  if (!body || !/save/i.test(body)) return false;
  if (COMMENT_ID_RE.test(body) && !POST_ID_RE.test(body)) return false;
  const request = parseJsonRecord(body);
  const op = operationName(request, body);
  if (/comment/i.test(op) && /save/i.test(op)) return false;
  if (/unsave/i.test(op)) return false;
  const input = graphqlInput(request);
  if (input.saved === false || input.save === false) return false;
  const action = String(input.action ?? "").toLowerCase();
  if (action === "unsave") return false;
  // UpdatePostSaveState is both directions; saveState says which one.
  const state = readSaveState(input, body);
  if (state) return isSavedState(state);
  if (/postsave|savepost|save.?state/i.test(op)) return true;
  if (/updatePostSaveState/i.test(body) && !/unsave/i.test(body)) return true;
  return action === "save" || input.saved === true || input.save === true;
}

function voteDir(url: string, body: string | null): string | null {
  try {
    const fromQuery = new URL(url, location.href).searchParams.get("dir");
    if (fromQuery != null) return fromQuery;
  } catch {
    /* fall through to body */
  }
  if (!body) return null;
  try {
    const v = new URLSearchParams(body).get("dir");
    if (v != null) return v;
  } catch {
    /* not form-encoded */
  }
  const m = body.match(/"?dir"?\s*[:=]\s*"?(-?1|0)"?/i);
  return m?.[1] ?? null;
}

function isGraphqlUpvote(body: string | null): boolean {
  if (!body || !/vote/i.test(body)) return false;
  if (COMMENT_ID_RE.test(body) && !POST_ID_RE.test(body)) return false;
  const json = parseJsonRecord(body);
  const op = operationName(json, body);
  if (/comment/i.test(op) && /vote/i.test(op)) return false;
  if (!/vote/i.test(op) && !/updatePostVoteState/i.test(body)) return false;
  const input = graphqlInput(json);
  const state = String(
    input.voteState ?? input.vote_state ?? input.vote ?? input.direction ?? "",
  ).toLowerCase();
  if (/down|none|unvote/.test(state) || state === "-1" || state === "0") {
    return false;
  }
  if (state === "up" || state === "upvote" || state === "1") return true;
  const dir = String(input.dir ?? "");
  return dir === "1";
}

function postIdFromGraphql(body: string | null): string | null {
  if (!body) return null;
  const input = graphqlInput(parseJsonRecord(body));
  for (const key of POST_ID_FIELDS) {
    const m = asText(input[key])?.match(POST_ID_RE);
    const id = m?.[1];
    if (id) return id;
  }
  const m = body.match(POST_ID_RE);
  return m?.[1] ?? null;
}

export function inject(): void {
  if (window.__pondRedditInjected) return;
  window.__pondRedditInjected = true;

  /** Overflow Save is inside a shadow menu; keep the permalink from the last in-post click. */
  let pendingPermalink: string | null = null;

  document.addEventListener(
    "click",
    (ev) => {
      try {
        const nearby = permalinkFromPath(composedNodes(ev));
        if (nearby) pendingPermalink = nearby;
        if (!isSaveClick(ev)) return;
        const url = nearby ?? pendingPermalink ?? permalinkFromLocation();
        if (url) capture(url, "reddit:save");
      } catch (e) {
        log("warn", "reddit dom-click hook error", String(e));
      }
    },
    true,
  );

  installInterceptor({
    id: "reddit",
    match: (req: RequestLens) =>
      req.method === "POST" &&
      (LEGACY_SAVE_RE.test(req.url) ||
        LEGACY_VOTE_RE.test(req.url) ||
        GRAPHQL_SAVE_RE.test(req.url)),
    async onResponse(req, res) {
      if (!res.ok) return;
      const body = await req.readBody();
      if (LEGACY_VOTE_RE.test(req.url)) {
        if (voteDir(req.url, body) !== "1") return;
        const url = fullnameToUrl(readLegacyFullname(req.url, body));
        if (url) capture(url, "reddit:upvote");
        return;
      }
      if (LEGACY_SAVE_RE.test(req.url)) {
        const url = fullnameToUrl(readLegacyFullname(req.url, body));
        if (url) capture(url, "reddit:save");
        return;
      }
      if (isGraphqlUpvote(body)) {
        const id = postIdFromGraphql(body);
        const url = id ? `https://redd.it/${id}` : pendingPermalink;
        if (url) capture(url, "reddit:upvote");
        return;
      }
      if (!isGraphqlSave(body)) return;
      const id = postIdFromGraphql(body);
      const url = id ? `https://redd.it/${id}` : pendingPermalink;
      if (url) capture(url, "reddit:graphql-save");
    },
  });
}
