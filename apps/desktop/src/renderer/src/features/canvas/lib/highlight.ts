import { useEffect, useState } from "react";

export interface CodeToken {
  content: string;
  light?: string;
  dark?: string;
}

function hasKey<Target extends object>(
  target: Target,
  key: PropertyKey,
): key is keyof Target {
  return Object.hasOwn(target, key);
}

/** Shiki and its grammars load on first use, so a board without code blocks never pays for them. */
export function useHighlight(
  code: string,
  language: string,
  enabled: boolean,
): Array<Array<CodeToken>> | null {
  const key = `${language}\n${code}`;
  const [result, setResult] = useState<{
    key: string;
    lines: Array<Array<CodeToken>>;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !code || language === "text") {
      return;
    }
    let live = true;
    void (async () => {
      const shiki = await import("shiki");
      if (!hasKey(shiki.bundledLanguages, language)) {
        return;
      }
      const lines = await shiki.codeToTokensWithThemes(code, {
        lang: language,
        themes: { light: "github-light", dark: "github-dark" },
      });
      if (!live) {
        return;
      }
      setResult({
        key,
        lines: lines.map((line) =>
          line.map((token) => ({
            content: token.content,
            light: token.variants.light?.color,
            dark: token.variants.dark?.color,
          })),
        ),
      });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [code, enabled, key, language]);

  return result?.key === key ? result.lines : null;
}
