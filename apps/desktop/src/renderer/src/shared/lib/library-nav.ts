import type { InboxState } from "@pond/schema/inbox";

export type LibraryNav =
  | { kind: "inbox"; snoozed?: boolean }
  | { kind: "all" }
  | { kind: "recentlyAdded" }
  | { kind: "recents" }
  | { kind: "random" }
  | { kind: "uncategorized" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; name: string }
  | { kind: "trash" }
  | { kind: "downloads" }
  | { kind: "sources" }
  | { kind: "tags" }
  | { kind: "untagged" }
  | { kind: "splitPosts" }
  | { kind: "post"; key: string };

export function pathForLibraryNav(nav: LibraryNav): string {
  switch (nav.kind) {
    case "inbox":
      return nav.snoozed ? "/inbox/snoozed" : "/inbox";
    case "all":
      return "/";
    case "recentlyAdded":
      return "/recently-added";
    case "recents":
      return "/recents";
    case "random":
      return "/random";
    case "uncategorized":
      return "/uncategorized";
    case "folder":
      return `/folders/${encodeURIComponent(nav.id)}`;
    case "tag":
      return `/tags/${encodeURIComponent(nav.name)}`;
    case "trash":
      return "/trash";
    case "downloads":
      return "/downloads";
    case "sources":
      return "/sources";
    case "tags":
      return "/tags";
    case "untagged":
      return "/untagged";
    case "splitPosts":
      return "/split-posts";
    case "post":
      return `/split-posts/${encodeURIComponent(nav.key)}`;
  }
}

export function savedViewPath(viewId: string): string {
  return `/views/${encodeURIComponent(viewId)}`;
}

/** The Inbox lists the Saves waiting for review, or the snoozed ones on their own. */
export function inboxScope(
  nav: Extract<LibraryNav, { kind: "inbox" }>,
): Exclude<InboxState, "processed"> {
  return nav.snoozed ? "snoozed" : "review";
}
