#!/usr/bin/env node
/** Compiles the Finder Quick Action into `resources/FinderAction`; `sign-mac.cjs` re-signs it for release. */

import { buildAppex } from "./lib/build-appex.mjs";

buildAppex({
  tag: "finder action",
  kind: "Finder Quick Actions",
  module: "PondFinderAction",
  name: "Pond Finder Action",
  source: "finder-action",
  sources: ["ActionRequestHandler.swift"],
  entitlements: "action.entitlements",
  bundleSuffix: "FinderAction",
  output: "resources/FinderAction",
});
