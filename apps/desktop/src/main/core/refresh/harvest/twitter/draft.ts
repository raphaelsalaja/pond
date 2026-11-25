import type { RichPostDraft } from "../../../capture/tweet-draft";
import type { RichTweet } from "./graphql";

/** Builds a capture draft from a tweet read out of X's GraphQL; `fallbackHandle` names the author when the response left the handle out. */
export function draftFromRichTweet(
  rich: RichTweet,
  fallbackHandle = "",
): RichPostDraft {
  const draft = postDraft(rich, fallbackHandle);
  if (rich.replyTo) {
    draft.isReply = true;
    if (rich.replyTo.handle) draft.replyingTo = rich.replyTo.handle;
    draft.replyTo = {
      source: "twitter",
      id: rich.replyTo.tweetId,
      url: rich.replyTo.url,
      text: "",
      author: { handle: rich.replyTo.handle, name: rich.replyTo.handle },
      media: [],
    };
  }
  return draft;
}

/** A quoted tweet keeps its own quote but not its reply parent. */
function postDraft(rich: RichTweet, fallbackHandle = ""): RichPostDraft {
  const handle = rich.author.handle || fallbackHandle;
  const author: RichPostDraft["author"] = {
    handle,
    name: rich.author.name || handle,
  };
  if (rich.author.avatarUrl) author.avatarUrl = rich.author.avatarUrl;
  if (rich.author.verified) author.verified = true;

  const draft: RichPostDraft = {
    source: "twitter",
    id: rich.tweetId,
    url: rich.url,
    text: rich.fullText,
    author,
    media: rich.media,
    metrics: rich.metrics,
  };
  if (rich.quoted) draft.quoted = postDraft(rich.quoted);
  if (rich.card) draft.card = rich.card;
  if (rich.publishedAt) draft.publishedAt = rich.publishedAt;
  return draft;
}
