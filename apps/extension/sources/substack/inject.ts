import { capture, installInterceptor } from "@/utils/intercept";

declare global {
  interface Window {
    _preloads?: { post?: { id?: number; slug?: string } };
  }
}

const TOUCH_RE = /\/api\/v1\/(?:posts\/saved|post\/\d+\/reaction)/;
const SAVE_PATH_RE = /^\/api\/v1\/posts\/saved\/?$/;
const REACTION_PATH_RE = /^\/api\/v1\/post\/(\d+)\/reaction\/?$/;
const PUBLICATION_HOST_RE = /^(?!www\.|open\.)[a-z0-9-]+\.substack\.com$/i;

export interface SubstackAction {
  url: string;
  trigger: string;
}

/** The post a publication page renders, so a save there keys by the same address sync uses. */
export interface PagePost {
  id: string;
  url: string;
}

export function substackAction(
  method: string,
  requestUrl: string,
  body: string | null,
  pageUrl: string,
  page: PagePost | null = null,
): SubstackAction | null {
  if (method !== "POST") return null;
  let path: string;
  try {
    path = new URL(requestUrl, pageUrl).pathname;
  } catch {
    return null;
  }
  const liked = REACTION_PATH_RE.exec(path)?.[1];
  const saved = SAVE_PATH_RE.test(path)
    ? /"?post_?id"?\s*[:=]\s*"?(\d+)/i.exec(body ?? "")?.[1]
    : undefined;
  const id = liked ?? saved;
  if (!id) return null;
  return {
    url: page?.id === id ? page.url : `https://substack.com/home/post/p-${id}`,
    trigger: liked ? "substack:like" : "substack:save",
  };
}

function pagePost(): PagePost | null {
  const post = window._preloads?.post;
  if (!post?.id || !post.slug) return null;
  if (!PUBLICATION_HOST_RE.test(location.hostname)) return null;
  return {
    id: String(post.id),
    url: `https://${location.hostname.toLowerCase()}/p/${post.slug}`,
  };
}

export function inject(): void {
  installInterceptor({
    id: "substack",
    match: (req) => req.method === "POST" && TOUCH_RE.test(req.url),
    async onResponse(req, res) {
      if (!res.ok) return;
      const action = substackAction(
        req.method,
        req.url,
        await req.readBody(),
        location.href,
        pagePost(),
      );
      if (action) capture(action.url, action.trigger);
    },
  });
}
