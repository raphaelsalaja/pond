import cloudflare from "@cloudflare/oxlint-config";
import landmines from "@interfere/landmines/configs/recommended.json" with { type: "json" };
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [cloudflare, landmines],
  env: cloudflare.env,
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    /** Compound wrappers like `<a {...props} />` get children through props, which this rule reads as empty. */
    "jsx-a11y/anchor-has-content": "off",
    "jsx-a11y/anchor-is-valid": "error",
    "jsx-a11y/aria-activedescendant-has-tabindex": "error",
    "jsx-a11y/aria-props": "error",
    "jsx-a11y/aria-proptypes": "error",
    "jsx-a11y/aria-role": "error",
    "jsx-a11y/aria-unsupported-elements": "error",
    "jsx-a11y/autocomplete-valid": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    /** Compound wrappers like `<h1 {...props} />` get children through props, which this rule reads as empty. */
    "jsx-a11y/heading-has-content": "off",
    "jsx-a11y/html-has-lang": "error",
    "jsx-a11y/iframe-has-title": "error",
    "jsx-a11y/img-redundant-alt": "error",
    "jsx-a11y/interactive-supports-focus": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/lang": "error",
    "jsx-a11y/media-has-caption": "error",
    "jsx-a11y/mouse-events-have-key-events": "error",
    "jsx-a11y/no-access-key": "error",
    "jsx-a11y/no-aria-hidden-on-focusable": "error",
    "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
    "jsx-a11y/no-distracting-elements": "error",
    "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/no-noninteractive-tabindex": "error",
    "jsx-a11y/no-redundant-roles": "error",
    "jsx-a11y/no-static-element-interactions": "error",
    /** Maps every role to a native tag, including the custom listbox, status, and group roles Pond UI builds on purpose. */
    "jsx-a11y/prefer-tag-over-role": "off",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error",
    "jsx-a11y/scope": "error",
    "jsx-a11y/tabindex-no-positive": "error",
    "react/no-array-index-key": "error",
    "react/no-danger": "error",
    /** `anti-slop/no-unknown-parameters` only accepts an `unknown` parameter named `cause`. */
    "unicorn/catch-error-name": ["error", { ignore: ["^cause$"] }],
    /** Reads zod's `.catch(fallback)` schema defaults as promise chains; every finding was one. */
    "unicorn/prefer-top-level-await": "off",
  },
  ignorePatterns: [
    ...cloudflare.ignorePatterns,
    "**/dist/**",
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".impeccable/**",
    ".mobbin/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "apps/desktop/out/**",
    "apps/desktop/src/renderer/src/generated/**",
    "apps/extension/.output/**",
    "apps/extension/.wxt/**",
    "apps/website/.next/**",
    "branding/**",
    "packages/icons/next/**",
    "packages/icons/seed/**",
    "tools/oxlint/anti-slop/**",
  ],
  overrides: [
    {
      files: ["apps/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@base-ui/react", "@base-ui/react/*"],
                message:
                  "Use the @pond/ui component that wraps this Base UI primitive.",
              },
              {
                group: ["@ui-sdk/*"],
                message:
                  "Build the behavior in packages/ui and import it from @pond/ui.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "apps/extension/entrypoints/*-inject.content.ts",
        "apps/extension/sources/*/inject.ts",
        "apps/desktop/src/main/core/refresh/harvest/**/*.ts",
      ],
      rules: {
        "prefer-rest-params": "off",
        "typescript/no-explicit-any": "off",
      },
    },
    {
      files: [
        "packages/ui/src/data-table/**/*.{ts,tsx}",
        "apps/desktop/src/renderer/src/features/downloads/components/page/columns.tsx",
      ],
      rules: {
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/interactive-supports-focus": "off",
        "jsx-a11y/role-has-required-aria-props": "off",
      },
    },
    {
      files: [
        "**/scripts/**",
        "packages/theme/src/colors/gen.ts",
        "packages/video/cli/**",
      ],
      rules: {
        /** Command-line scripts report to the terminal. */
        "no-console": "off",
      },
    },
    {
      files: [
        "apps/desktop/src/main/core/refresh/harvest/**",
        "apps/desktop/src/main/core/refresh/harvest-window/**",
      ],
      rules: {
        /** In-page functions are serialized with `toString()`, so their helpers must stay nested. */
        "unicorn/consistent-function-scoping": "off",
      },
    },
    {
      files: ["**/*.cjs"],
      rules: {
        /** CommonJS modules have no other way to load a dependency. */
        "typescript/no-require-imports": "off",
      },
    },
    {
      files: ["**/*.tsx"],
      rules: {
        /** JSX handlers may be async; each one catches its own rejection. */
        "typescript/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ],
});
