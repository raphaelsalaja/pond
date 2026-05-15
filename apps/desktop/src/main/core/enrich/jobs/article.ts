import type { Save } from "@pond/schema/db";
import log from "electron-log/main.js";
import { chat, type ProviderClient } from "../provider";

export interface ArticleExtraction {
  html: string;
  text: string;
  readingMinutes: number;
}

export async function extractArticle(
  save: Save,
): Promise<ArticleExtraction | null> {
  if (!save.url) return null;
  const html = await fetchPageHtml(save.url);
  if (!html) return null;
  const article = readability(html);
  if (!article) return null;
  const text = article.text.trim();
  if (text.length < 200) return null;
  const words = text.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(words / 220));
  return {
    html: article.html,
    text,
    readingMinutes,
  };
}

export async function summariseArticle(
  client: ProviderClient,
  text: string,
): Promise<string | null> {
  try {
    const summary = await chat(
      client,
      [
        {
          role: "system",
          content:
            "You write three-sentence neutral summaries of articles. Stick to the facts. No emoji, no editorialising.",
        },
        {
          role: "user",
          content: `Summarise the following article in 2-3 sentences:\n\n${text.slice(0, 8000)}`,
        },
      ],
      { model: client.models.summary, maxTokens: 250 },
    );
    return summary.trim() || null;
  } catch (err) {
    log.warn("[pond enrich/article] summary failed", err);
    return null;
  }
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 Pond/0.1",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    log.warn("[pond enrich/article] fetch failed", url, err);
    return null;
  }
}

interface ReadResult {
  html: string;
  text: string;
}

const NOISE_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "input",
]);
const NOISE_CLASSES =
  /\b(?:nav|footer|sidebar|advert|sponsored|cookie|comments?|share|related|newsletter|subscribe|menu|breadcrumb|paywall|pop[ -]?up)\b/i;

function readability(html: string): ReadResult | null {
  let cleaned = html;
  for (const tag of NOISE_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    cleaned = cleaned.replace(re, "");
  }
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  const containerMatches = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div\b[^>]*\b(?:id|class)="(?:[^"]*\b(?:article|content|post|entry)\b[^"]*)"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  let bestHtml: string | null = null;
  let bestScore = 0;
  for (const re of containerMatches) {
    const m = cleaned.match(re);
    if (!m) continue;
    const candidate = stripNoiseClasses(m[1] ?? "");
    const score = scoreBlock(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestHtml = candidate;
    }
  }

  if (!bestHtml) {
    bestHtml = stripNoiseClasses(cleaned);
  }

  const text = htmlToText(bestHtml);
  if (text.length < 200) return null;
  return { html: bestHtml, text };
}

function stripNoiseClasses(html: string): string {
  return html.replace(
    /<(div|section|aside|footer|header|nav)\b[^>]*\b(?:class|id)="([^"]*)"[^>]*>[\s\S]*?<\/\1>/gi,
    (full, _tag, klass) => (NOISE_CLASSES.test(String(klass)) ? "" : full),
  );
}

function scoreBlock(html: string): number {
  const paragraphs = (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []).length;
  const text = htmlToText(html);
  return paragraphs * 4 + text.length / 100;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>(\s|\n)*/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div|section|article|main|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
