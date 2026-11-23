#!/usr/bin/env node
/** Compiles the Share extension into `resources/ShareExtension`; `sign-mac.cjs` re-signs it for release. */

import { buildAppex } from "./lib/build-appex.mjs";

buildAppex({
  tag: "share",
  kind: "Share extensions",
  module: "PondShare",
  name: "Pond Share",
  source: "share-extension",
  sources: ["PondSocket.swift", "ShareViewController.swift"],
  entitlements: "share.entitlements",
  bundleSuffix: "Share",
  output: "resources/ShareExtension",
});
