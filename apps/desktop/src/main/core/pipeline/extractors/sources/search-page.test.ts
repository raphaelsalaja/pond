import { describe, expect, it } from "vitest";
import { searchPageQuery } from "./search-page";

describe("searchPageQuery", () => {
  it("reads the query from search results pages", () => {
    for (const [url, engine, query] of [
      ["https://www.google.com/search?q=malaga", "Google Search", "malaga"],
      ["https://www.google.co.uk/search?q=a+b&udm=2", "Google Search", "a b"],
      ["https://www.bing.com/search?q=malaga", "Bing", "malaga"],
      ["https://duckduckgo.com/?q=malaga&ia=web", "DuckDuckGo", "malaga"],
      ["https://search.brave.com/search?q=malaga", "Brave Search", "malaga"],
      ["https://kagi.com/search?q=malaga", "Kagi", "malaga"],
      ["https://www.ecosia.org/search?q=malaga", "Ecosia", "malaga"],
      ["https://search.yahoo.com/search?p=malaga", "Yahoo Search", "malaga"],
    ] as const) {
      expect(searchPageQuery(new URL(url))).toEqual({ engine, query });
    }
  });

  it("collapses whitespace in the query", () => {
    expect(
      searchPageQuery(
        new URL("https://www.google.com/search?q=%20a%0A%20b%20"),
      ),
    ).toEqual({ engine: "Google Search", query: "a b" });
  });

  it("ignores other pages on search hosts and searches without a query", () => {
    for (const url of [
      "https://www.google.com/",
      "https://www.google.com/maps/search/malaga",
      "https://www.google.com/search?q=%20",
      "https://duckduckgo.com/about",
      "https://example.com/search?q=malaga",
      "https://notgoogle.com/search?q=malaga",
    ]) {
      expect(searchPageQuery(new URL(url))).toBeNull();
    }
  });
});
