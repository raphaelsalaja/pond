import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const FAVICONS = {
  preview: "/favicon.preview.svg",
  development: "/favicon.development.svg",
} as const;

function isFaviconEnv(
  value: string | undefined,
): value is keyof typeof FAVICONS {
  return value !== undefined && value in FAVICONS;
}

const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
const favicon = isFaviconEnv(env) ? FAVICONS[env] : null;

const config: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  transpilePackages: ["@pond/ui", "@pond/icons", "@pond/schema"],
  poweredByHeader: false,
  /** TypeScript 7 drops the JS compiler API; next build must shell out to tsc. */
  experimental: {
    useTypeScriptCli: true,
  },
  async rewrites() {
    if (!favicon) return [];
    return {
      beforeFiles: [{ source: "/favicon.svg", destination: favicon }],
    };
  },
};

/** Turbopack takes remark plugins by package name, not by function reference. */
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(config);
