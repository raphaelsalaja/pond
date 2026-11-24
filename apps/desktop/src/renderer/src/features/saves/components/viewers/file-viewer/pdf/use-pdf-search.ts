import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

export function usePdfSearch(
  document: PDFDocumentProxy | null,
  goToPage: (pageNumber: number) => void,
) {
  const searchRunRef = useRef(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<number>>([]);
  const [searchResultIndex, setSearchResultIndex] = useState(0);

  useEffect(
    () => () => {
      searchRunRef.current += 1;
    },
    [],
  );

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!document || !query) {
      setSearchResults([]);
      setSearchResultIndex(0);
      return;
    }
    const run = searchRunRef.current + 1;
    searchRunRef.current = run;
    setSearching(true);
    try {
      const matches: Array<number> = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .toLocaleLowerCase();
        if (text.includes(query)) {
          matches.push(pageNumber);
        }
        if (searchRunRef.current !== run) {
          return;
        }
      }
      setSearchResults(matches);
      setSearchResultIndex(0);
      const first = matches[0];
      if (first) {
        goToPage(first);
      }
    } catch {
      if (searchRunRef.current === run) {
        setSearchResults([]);
        setSearchResultIndex(0);
      }
    } finally {
      if (searchRunRef.current === run) {
        setSearching(false);
      }
    }
  }, [document, goToPage, searchQuery]);

  const stepSearchResult = useCallback(
    (direction: -1 | 1) => {
      if (!searchResults.length) {
        return;
      }
      const next =
        (searchResultIndex + direction + searchResults.length) %
        searchResults.length;
      setSearchResultIndex(next);
      const page = searchResults[next];
      if (page) {
        goToPage(page);
      }
    },
    [goToPage, searchResultIndex, searchResults],
  );

  return {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searching,
    searchResults,
    searchResultIndex,
    runSearch,
    stepSearchResult,
  };
}
