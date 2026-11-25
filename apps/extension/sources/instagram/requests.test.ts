import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../utils/json";
import {
  extractMediaIdFromBody,
  isLikeMutation,
  isSaveMutation,
  mediaIdToShortcode,
} from "./requests";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function mediaIdFor(shortcode: string): string {
  let n = 0n;
  for (const ch of shortcode) n = n * 64n + BigInt(ALPHABET.indexOf(ch));
  return n.toString();
}

const MEDIA_ID = mediaIdFor("Dej-BYWjXyx");

function graphqlBody(operation: string, variables: JsonValue): string {
  return new URLSearchParams({
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: operation,
    variables: JSON.stringify(variables),
    doc_id: "27365486596441074",
  }).toString();
}

const noHeaders = () => null;

function saveRootHeaders(name: string) {
  return name === "x-root-field-name" ? "xig_media_save" : null;
}

describe("isSaveMutation", () => {
  it.each([
    "usePolarisSaveMediaSaveMutation",
    "PolarisAPISavePostMutation",
    "usePolarisMediaSaveToCollectionAddMediaMutation",
  ])("accepts %s", (operation) => {
    const body = graphqlBody(operation, { input: { media_id: MEDIA_ID } });
    expect(isSaveMutation(noHeaders, body)).toBe(true);
    expect(isLikeMutation(noHeaders, "/graphql/query", body)).toBe(false);
  });

  it.each([
    "usePolarisSaveMediaUnsaveMutation",
    "usePolarisMediaSaveToCollectionRemoveMediaMutation",
  ])("rejects %s", (operation) => {
    const body = graphqlBody(operation, { input: { media_id: MEDIA_ID } });
    expect(isSaveMutation(noHeaders, body)).toBe(false);
  });

  it("accepts the save root field header", () => {
    expect(isSaveMutation(saveRootHeaders, null)).toBe(true);
  });
});

describe("extractMediaIdFromBody", () => {
  it("reads the media id from the mutation input", () => {
    const body = graphqlBody("usePolarisSaveMediaSaveMutation", {
      input: { media_id: MEDIA_ID },
    });
    expect(extractMediaIdFromBody(body)).toBe(MEDIA_ID);
  });

  it("reads a top-level media id", () => {
    const body = graphqlBody("usePolarisLikeMediaLikeMutation", {
      media_id: MEDIA_ID,
    });
    expect(extractMediaIdFromBody(body)).toBe(MEDIA_ID);
  });
});

it("turns a media id into its shortcode", () => {
  expect(mediaIdToShortcode(`${MEDIA_ID}_50527950908`)).toBe("Dej-BYWjXyx");
});
