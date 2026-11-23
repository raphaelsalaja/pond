interface SearchEngine {
  label: string;
  host: RegExp;
  path: RegExp;
  param: string;
}

const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    label: "Google Search",
    host: /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/,
    path: /^\/search\/?$/,
    param: "q",
  },
  {
    label: "Bing",
    host: /(^|\.)bing\.com$/,
    path: /^\/search\/?$/,
    param: "q",
  },
  {
    label: "DuckDuckGo",
    host: /(^|\.)duckduckgo\.com$/,
    path: /^\/(html\/?)?$/,
    param: "q",
  },
  {
    label: "Brave Search",
    host: /^search\.brave\.com$/,
    path: /^\/search\/?$/,
    param: "q",
  },
  {
    label: "Kagi",
    host: /(^|\.)kagi\.com$/,
    path: /^\/search\/?$/,
    param: "q",
  },
  {
    label: "Ecosia",
    host: /(^|\.)ecosia\.org$/,
    path: /^\/search\/?$/,
    param: "q",
  },
  {
    label: "Yahoo Search",
    host: /(^|\.)search\.yahoo\.com$/,
    path: /^\/search\/?$/,
    param: "p",
  },
];

/** A search results page loaded without scripts names only the engine, so the query has to come from the URL. */
export function searchPageQuery(
  url: URL,
): { engine: string; query: string } | null {
  const host = url.hostname.toLowerCase();
  const engine = SEARCH_ENGINES.find(
    (candidate) =>
      candidate.host.test(host) && candidate.path.test(url.pathname),
  );
  const query = engine
    ? url.searchParams.get(engine.param)?.replace(/\s+/g, " ").trim()
    : undefined;
  return engine && query ? { engine: engine.label, query } : null;
}
