import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";

export type { Capture, RawJson } from "@pond/schema/raw";

export interface ExtractInput {
  url: URL;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

interface ExtractorTest {
  readonly url: string;
  readonly id?: string;
  readonly profile?: { readonly url: string; readonly handle: string };
}

export interface Extractor {
  readonly id: string;
  readonly source: Source;
  readonly validUrl: ReadonlyArray<RegExp>;
  readonly cookieDomain: string | null;
  authCookies(name: string, value?: string): boolean;
  handleFromPath?(segments: Array<string>): string | null;
  readonly probeExpression?: string;
  readonly tests?: ReadonlyArray<ExtractorTest>;
  suitable(url: URL): boolean;
  extract(input: ExtractInput): Promise<Capture>;
}
