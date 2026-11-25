import { describe, expect, it } from "vitest";
import { inPageTwitterSsr } from "./ssr";

const { ssrResponseBodies } = inPageTwitterSsr();

/** A JSON body as x-web writes it inside a JS string literal. */
const literal = (json: string) => JSON.stringify(json).slice(1, -1);

describe("ssrResponseBodies", () => {
  it("reads the GraphQL results x-web streams into a post page", () => {
    const tweet = {
      data: {
        tweet_result_by_rest_id: {
          rest_id: "100",
          result: { details: { full_text: "Line one\nline <two>" } },
        },
      },
    };
    const html = `<script>$R[44]={kind:1,requestId:2,key:"k",result:$R[45]={kind:"Result.Ok",value:"${literal(JSON.stringify(tweet))}"}};</script><script>$R[39]={kind:"Result.Ok",value:"${literal('{"data":{"can_access_payments":false}}')}"}</script>`;

    const bodies = ssrResponseBodies(html);

    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0] ?? "")).toEqual(tweet);
  });

  it(String.raw`decodes \x escapes`, () => {
    const html = String.raw`kind:"Result.Ok",value:"{\"t\":\"\x3Cb\x3E\"}"`;
    expect(ssrResponseBodies(html)).toEqual(['{"t":"<b>"}']);
  });

  it("finds nothing in a page without results", () => {
    expect(ssrResponseBodies("<html></html>")).toEqual([]);
  });
});
