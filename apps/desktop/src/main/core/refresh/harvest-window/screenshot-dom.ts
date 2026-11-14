/// <reference lib="dom" />

const CAPTURE_ROOT_ATTRIBUTE = "data-pond-capture";

function markCaptureRoots(post: string, parent: string): string {
  const attribute = JSON.stringify(CAPTURE_ROOT_ATTRIBUTE);
  return `for (const el of document.querySelectorAll('[' + ${attribute} + ']')) el.removeAttribute(${attribute});
      ${post}.setAttribute(${attribute}, '');
      if (${parent}) ${parent}.setAttribute(${attribute}, '');`;
}

/** Resolves true once the marked post's images, video posters, and loading spinners have settled, or false at the deadline. */
export function buildCaptureMediaSettledExpression(timeoutMs: number): string {
  return `(${inPageCaptureMediaSettled.toString()})(${JSON.stringify(CAPTURE_ROOT_ATTRIBUTE)}, ${JSON.stringify(timeoutMs)})`;
}

async function inPageCaptureMediaSettled(
  attribute: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const posters = new Map<string, HTMLImageElement>();
  const loading = (img: HTMLImageElement): boolean =>
    Boolean(img.getAttribute("src")) && !img.complete;
  const poster = (src: string): HTMLImageElement => {
    const known = posters.get(src);
    if (known) return known;
    const image = new Image();
    image.src = src;
    posters.set(src, image);
    return image;
  };
  const pending = (): boolean =>
    Array.from(document.querySelectorAll(`[${attribute}]`)).some(
      (root) =>
        Array.from(root.querySelectorAll("img")).some(loading) ||
        Array.from(root.querySelectorAll("video[poster]")).some((video) =>
          loading(poster(video.getAttribute("poster") ?? "")),
        ) ||
        Array.from(root.querySelectorAll('[role="progressbar"]')).some(
          (bar) => {
            const rect = bar.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          },
        ),
    );
  while (pending()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

export function buildArticleRectExpression(
  tweetId: string,
  parentId?: string,
): string {
  /** Scroll to top, not center: centering yields a negative top that clips the article. */
  return `(async () => {
    try {
      const tweetId = ${JSON.stringify(tweetId)};
      const parentId = ${JSON.stringify(parentId ?? null)};
      const findArticle = () => {
        const anchor = document.querySelector('a[href*="/status/' + tweetId + '"]');
        return anchor && anchor.closest('article');
      };
      const articleDeadline = Date.now() + 10_000;
      let article = findArticle();
      while (!article && Date.now() < articleDeadline) {
        await new Promise(r => setTimeout(r, 200));
        article = findArticle();
      }
      if (!article) return null;

      const findParent = () => {
        if (!parentId) return null;
        const pattern = new RegExp('/status/' + parentId + '(?:/|$)');
        for (const a of document.querySelectorAll('a[href*="/status/' + parentId + '"]')) {
          let path = '';
          try { path = new URL(a.href, 'https://x.com').pathname; } catch (_) {}
          if (!pattern.test(path)) continue;
          const el = a.closest('article');
          if (el && el !== article && !article.contains(el) && !el.contains(article)) return el;
        }
        return null;
      };
      const parentDeadline = Date.now() + 3_000;
      let parent = findParent();
      while (parentId && !parent && Date.now() < parentDeadline) {
        await new Promise(r => setTimeout(r, 200));
        parent = findParent();
      }

      /** Hide every other timeline cell so replies, older ancestors, and the composer can't bleed into the clip. */
      try {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        const parentCell = parent && parent.closest('[data-testid="cellInnerDiv"]');
        if (cell) {
          for (const c of document.querySelectorAll('[data-testid="cellInnerDiv"]')) {
            if (c !== cell && c !== parentCell) c.style.setProperty('display', 'none', 'important');
          }
        }
      } catch (_) {}

      ${markCaptureRoots("article", "parent")}

      window.scrollTo(0, 0);
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await new Promise(r => setTimeout(r, 150));

      /** Hide footer chrome under the action bar with visibility:hidden; display:none would reflow the reply composer into the clip. */
      try {
        let barBottom = 0;
        for (const b of article.querySelectorAll('[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"],[data-testid="like"],[data-testid="unlike"],[data-testid="bookmark"]')) {
          if (b.closest('article') === article) barBottom = Math.max(barBottom, b.getBoundingClientRect().bottom);
        }
        if (barBottom === 0) {
          const g = Array.from(article.querySelectorAll('[role="group"]'))
            .filter((x) => x.closest('article') === article)
            .find((x) => x.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="unlike"]'));
          if (g) barBottom = g.getBoundingClientRect().bottom;
        }
        if (barBottom > 0) {
          const walker = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT);
          let node;
          while ((node = walker.nextNode())) {
            if (node.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="unlike"], [data-testid="bookmark"]')) continue;
            const nr = node.getBoundingClientRect();
            if (nr.width > 0 && nr.height > 0 && nr.top >= barBottom - 1) {
              node.style.setProperty('visibility', 'hidden', 'important');
            }
          }
        }
      } catch (_) {}

      const r = article.getBoundingClientRect();

      /** The raw article box includes the thread spine and footer chrome; derive a tight box from the tweet's own content, with the bottom at the action bar. */
      const inner = Array.from(article.querySelectorAll('article'))
        .find((a) => a !== article);
      const focal = (el) => !!el && el.closest('article') === article;
      const rects = [];
      const add = (el) => { if (focal(el)) rects.push(el.getBoundingClientRect()); };
      add(article.querySelector('[data-testid^="UserAvatar-Container"]'));
      add(article.querySelector('[data-testid="User-Name"]'));
      for (const sel of ['[data-testid="tweetText"]','[data-testid="tweetPhoto"]','[data-testid="card.wrapper"]','[data-testid="videoPlayer"]','[data-testid="videoComponent"]','video']) {
        for (const el of article.querySelectorAll(sel)) add(el);
      }
      if (inner) rects.push(inner.getBoundingClientRect());

      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      if (rects.length) {
        left = Math.max(r.left, Math.min(...rects.map((b) => b.left)));
        top = Math.max(r.top, Math.min(...rects.map((b) => b.top)));
        right = Math.min(r.right, Math.max(...rects.map((b) => b.right)));
      }

      if (parent) {
        const pr = parent.getBoundingClientRect();
        const tops = [];
        for (const sel of ['[data-testid^="UserAvatar-Container"]', '[data-testid="User-Name"]']) {
          const el = parent.querySelector(sel);
          if (el && el.closest('article') === parent) tops.push(el.getBoundingClientRect().top);
        }
        const parentTop = tops.length ? Math.max(pr.top, Math.min(...tops)) : pr.top;
        if (pr.height > 0 && parentTop < top) top = Math.max(0, parentTop);
      }

      /** Bottom edge: action-bar buttons, then their role="group" wrapper, then the content union, finally the article rect; each fallback is content-safe. */
      let actionBottom = 0;
      for (const b of article.querySelectorAll('[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"],[data-testid="like"],[data-testid="unlike"],[data-testid="bookmark"]')) {
        if (focal(b)) actionBottom = Math.max(actionBottom, b.getBoundingClientRect().bottom);
      }
      if (actionBottom === 0) {
        const group = Array.from(article.querySelectorAll('[role="group"]'))
          .filter((g) => g.closest('article') === article)
          .find((g) => g.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="unlike"]'));
        if (group) actionBottom = group.getBoundingClientRect().bottom;
      }
      if (actionBottom > top && actionBottom <= r.bottom) {
        bottom = actionBottom + 6;
      } else if (rects.length) {
        bottom = Math.max(...rects.map((b) => b.bottom));
      }

      /** Discover the quoted tweet (the inline nested <article>) so the caller can walk the quote chain by navigating to it. */
      let quotedUrl;
      try {
        const link = inner && inner.querySelector('a[href*="/status/"]');
        if (link) {
          const u = new URL(link.href, 'https://x.com');
          const m = u.pathname.match(/\\/status\\/(\\d+)/);
          if (m) quotedUrl = 'https://x.com' + u.pathname;
        }
      } catch (_) {}

      return {
        x: left,
        y: top,
        width: Math.max(8, right - left),
        height: Math.max(8, bottom - top),
        ...(quotedUrl ? { quotedUrl } : {}),
      };
    } catch (_) {
      return null;
    }
  })()`;
}

export function buildThreadsPostRectExpression(
  code: string,
  parentCode?: string,
): string {
  return `(async () => {
    try {
      const code = ${JSON.stringify(code)};
      const parentCode = ${JSON.stringify(parentCode ?? null)};
      const CARD = '[data-pressable-container], [role="article"], article';
      const findCard = () => {
        const anchor = document.querySelector('a[href*="/post/' + code + '"]');
        return anchor && (anchor.closest(CARD) || anchor.parentElement);
      };
      const deadline = Date.now() + 10_000;
      let card = findCard();
      while (!card && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        card = findCard();
      }
      if (!card) return null;

      const related = (a, b) => a === b || a.contains(b) || b.contains(a);
      const findParent = () => {
        if (!parentCode) return null;
        const pattern = new RegExp('/post/' + parentCode + '(?:/|$)');
        for (const a of document.querySelectorAll('a[href*="/post/' + parentCode + '"]')) {
          let path = '';
          try { path = new URL(a.href, 'https://www.threads.com').pathname; } catch (_) {}
          if (!pattern.test(path)) continue;
          const el = a.closest(CARD);
          if (el && !related(el, card)) return el;
        }
        return null;
      };
      const parentDeadline = Date.now() + 3_000;
      let parent = findParent();
      while (parentCode && !parent && Date.now() < parentDeadline) {
        await new Promise(r => setTimeout(r, 200));
        parent = findParent();
      }

      try {
        for (const s of document.querySelectorAll(CARD)) {
          if (!related(s, card) && !(parent && related(s, parent))) {
            s.style.setProperty('display', 'none', 'important');
          }
        }
      } catch (_) {}

      ${markCaptureRoots("card", "parent")}

      window.scrollTo(0, 0);
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await new Promise(r => setTimeout(r, 150));

      const c = card.getBoundingClientRect();
      const p = parent && parent.getBoundingClientRect();
      const top = p && p.height > 0 ? Math.max(0, Math.min(c.top, p.top)) : c.top;
      const left = p && p.height > 0 ? Math.min(c.left, p.left) : c.left;
      const right = p && p.height > 0 ? Math.max(c.right, p.right) : c.right;
      const r = { left, top, width: right - left, height: c.bottom - top };
      let quotedUrl;
      try {
        for (const link of card.querySelectorAll('a[href*="/post/"]')) {
          const u = new URL(link.href, 'https://www.threads.com');
          const m = u.pathname.match(/\\/post\\/([A-Za-z0-9_-]+)/);
          if (m && m[1] !== code && m[1] !== parentCode) {
            quotedUrl = 'https://www.threads.com' + u.pathname;
            break;
          }
        }
      } catch (_) {}

      return {
        x: r.left,
        y: r.top,
        width: Math.max(8, r.width),
        height: Math.max(8, r.height),
        ...(quotedUrl ? { quotedUrl } : {}),
      };
    } catch (_) {
      return null;
    }
  })()`;
}
