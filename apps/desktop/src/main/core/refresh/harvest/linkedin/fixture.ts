import type { VoyagerClusterReply, VoyagerEntityResult } from "./normalize";

export const POST_ID = "7212345678901234567";

export const SAVED_QUERY =
  "/voyager/api/graphql?variables=(start:0,origin:OTHER,query:(flagshipSearchIntent:SEARCH_MY_ITEMS_SAVED_POSTS))&queryId=voyagerSearchDashClusters.0123456789abcdef";

const IMAGE_ROOT = "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-";

export function savedPost(id: string): VoyagerEntityResult {
  return {
    $type: "com.linkedin.voyager.dash.search.EntityResultViewModel",
    entityUrn: `urn:li:fsd_entityResultViewModel:(urn:li:activity:${id},SEARCH_MY_ITEMS_SAVED_POSTS,DEFAULT)`,
    trackingUrn: `urn:li:activity:${id}`,
    navigationUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
    title: { text: "Jane Doe" },
    primarySubtitle: { text: "Design Systems Lead at Acme" },
    summary: {
      text: "Shipping our new design system today.\nHere's what we learned.",
    },
    entityEmbeddedObject: {
      image: {
        attributes: [
          {
            detailData: {
              vectorImage: {
                rootUrl: IMAGE_ROOT,
                artifacts: [
                  { width: 160, fileIdentifyingUrlPathSegment: "shrink_160/0" },
                  { width: 800, fileIdentifyingUrlPathSegment: "shrink_800/0" },
                ],
              },
            },
          },
        ],
      },
    },
  };
}

export function textPost(id: string): VoyagerEntityResult {
  return {
    $type: "com.linkedin.voyager.dash.search.EntityResultViewModel",
    entityUrn: `urn:li:fsd_entityResultViewModel:(urn:li:ugcPost:${id},SEARCH_MY_ITEMS_SAVED_POSTS,DEFAULT)`,
    trackingUrn: `urn:li:ugcPost:${id}`,
    title: { text: "Acme" },
    summary: { text: "We're hiring." },
  };
}

export function clusterReply(
  posts: Array<VoyagerEntityResult>,
  paging: { start: number; count: number; total?: number },
): VoyagerClusterReply {
  return {
    data: {
      data: {
        searchDashClustersByAll: {
          elements: [
            {
              items: posts.map((post) => ({
                item: { "*entityResult": post.entityUrn },
              })),
            },
          ],
          paging,
        },
      },
    },
    included: [...posts].reverse(),
  };
}

export function renderedResult(id: string): string {
  return `<li>
  <div data-chameleon-result-urn="urn:li:activity:${id}">
    <div class="entity-result__content-actor">
      <span class="entity-result__title-text">
        <a href="https://www.linkedin.com/in/janedoe">
          <span aria-hidden="true">Jane Doe</span>
          <span class="visually-hidden">View Jane Doe's profile</span>
        </a>
      </span>
    </div>
    <p class="entity-result__content-summary">Shipping our new design system today.<br>Here's what we learned.<span class="visually-hidden">see more</span></p>
    <div class="entity-result__embedded-object">
      <img src="${IMAGE_ROOT}shrink_800/0">
    </div>
    <a href="https://www.linkedin.com/feed/update/urn:li:activity:${id}/">View post</a>
  </div>
</li>`;
}

export const POST_PAGE = `<div class="feed-shared-update-v2" data-urn="urn:li:activity:${POST_ID}">
  <div class="update-components-actor__container">
    <a class="update-components-actor__meta-link" href="https://www.linkedin.com/in/janedoe?miniProfileUrn=urn">
      <span class="update-components-actor__title">
        <span aria-hidden="true">Jane Doe</span>
        <span class="visually-hidden">Jane Doe</span>
      </span>
    </a>
    <img class="update-components-actor__avatar-image" src="https://media.licdn.com/dms/image/v2/C4D03AQ/profile-displayphoto-shrink_100_100/0">
  </div>
  <div class="update-components-update-v2__commentary">
    <span>Shipping our new design system today.<br>Here's what we learned.</span>
    <button>more</button>
  </div>
  <div class="update-components-image">
    <img src="${IMAGE_ROOT}shrink_2048_1536/1">
    <img src="${IMAGE_ROOT}shrink_2048_1536/2">
  </div>
</div>`;
