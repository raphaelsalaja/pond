import { setTimeout as sleep } from "node:timers/promises";
import { session } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { partitionForIngest } from "../../../sync/accounts";
import { PARTITION } from "../../harvest-window/constants";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import {
  CosmosClusterConnectionsDataSchema,
  CosmosClustersDataSchema,
  type CosmosCollection,
  CosmosLibraryDataSchema,
  CosmosMeDataSchema,
  type CosmosViewer,
  type LibraryPage,
  pageFromClusterConnections,
  pageFromClusters,
  pageFromLibrary,
  viewerFromMeData,
} from "./listing";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const GRAPHQL_URL = "https://api.cosmos.so/graphql";
/** Cosmos GraphQL validates this client name and requires a Bearer access token. */
const COSMOS_CLIENT_NAME = "cosmos-web";
const PAGE_SIZE = 50;
const MAX_PAGES = 200;

const VIEWER_QUERY = `query PondViewer { me { id username avatarUrl } }`;
const LIBRARY_QUERY = `query PondLibrary($userId: UserId!, $pageSize: Int, $pageCursor: String) {
  allElementsV2(userId: $userId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { id shareUrl createdAt }
    meta { nextPageCursor count }
  }
}`;
const COLLECTION_QUERY = `query PondCollection($input: ClusterGetInput!, $pageSize: Int, $pageCursor: String) {
  clusterConnections(clusterInput: $input, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { element { id shareUrl createdAt } }
    meta { nextPageCursor count }
  }
}`;
const CLUSTERS_QUERY = `query PondClusters($userId: UserId!, $pageSize: Int, $pageCursor: String) {
  userClusters(userId: $userId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { id name slug owner { username } numberOfElements }
    meta { nextPageCursor }
  }
}`;

const GraphqlErrorSchema = z
  .object({
    message: z.string().optional().catch(undefined),
    extensions: z
      .object({ code: z.string().optional().catch(undefined) })
      .optional()
      .catch(undefined),
  })
  .catch({});

const GraphqlEnvelopeSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).nullish().catch(undefined),
    errors: z.array(GraphqlErrorSchema).optional().catch(undefined),
  })
  .catch({});

type JsonResult<T> = { ok: true; json: T } | { ok: false; status: number };

export async function probeCosmosHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const viewer = await fetchCosmosViewer(partition);
  if (!viewer) return null;
  log.info("[pond cosmos-api] probed handle", viewer.handle);
  return viewer.handle;
}

export async function fetchCosmosViewer(
  partition: string = PARTITION,
): Promise<CosmosViewer | null> {
  const result = await cosmosGraphql(
    partition,
    "PondViewer",
    VIEWER_QUERY,
    {},
    CosmosMeDataSchema,
  );
  if (!result.ok) return null;
  return viewerFromMeData(result.json);
}

interface CosmosSession {
  jar: string;
  userId: number;
  handle: string;
}

type FetchPage = (
  auth: CosmosSession,
  pageCursor: string | undefined,
) => Promise<JsonResult<LibraryPage>>;

export function harvestCosmosLibrary(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return harvestCosmosPages(args, partition, async (auth, pageCursor) => {
    const result = await cosmosGraphql(
      auth.jar,
      "PondLibrary",
      LIBRARY_QUERY,
      { userId: auth.userId, pageSize: PAGE_SIZE, pageCursor },
      CosmosLibraryDataSchema,
    );
    return result.ok
      ? { ok: true, json: pageFromLibrary(result.json) }
      : result;
  });
}

export function harvestCosmosCollection(
  args: ListHarvestArgs,
  partition: string | undefined,
  collection: CosmosCollection,
): Promise<ListHarvestResult> {
  return harvestCosmosPages(args, partition, async (auth, pageCursor) => {
    const result = await cosmosGraphql(
      auth.jar,
      "PondCollection",
      COLLECTION_QUERY,
      {
        pageSize: PAGE_SIZE,
        pageCursor,
        input: {
          slug: collection.slug,
          ownerUsername: collection.ownerUsername ?? auth.handle,
        },
      },
      CosmosClusterConnectionsDataSchema,
    );
    return result.ok
      ? { ok: true, json: pageFromClusterConnections(result.json) }
      : result;
  });
}

async function harvestCosmosPages(
  args: ListHarvestArgs,
  partition: string | undefined,
  fetchPage: FetchPage,
): Promise<ListHarvestResult> {
  const jar = partition ?? (await partitionForIngest("cosmos"));
  const viewer = await fetchCosmosViewer(jar);
  if (!viewer) return { ok: false, reason: "auth_required" };
  const userId = Number(viewer.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, reason: "auth_required" };
  }
  const auth: CosmosSession = { jar, userId, handle: viewer.handle };

  const known = new Set(args.knownIds.map(String));
  const earlyStopEnabled = args.earlyStop !== false && known.size > 0;
  const entries = [];
  let pageCursor: string | undefined;
  let knownPageStreak = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(auth, pageCursor);
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        return { ok: false, reason: "auth_required" };
      }
      if (result.status === 429) {
        return { ok: false, reason: "rate_limited" };
      }
      if (page === 0) return { ok: false, reason: "no_match" };
      break;
    }
    const pageData = result.json;
    if (
      page === 0 &&
      pageData.entries.length === 0 &&
      !pageData.nextPageCursor
    ) {
      log.info("[pond cosmos-api] library empty", viewer.handle);
      return { ok: true, entries: [], reachedEnd: true, seen: 0 };
    }
    let pageFresh = 0;
    for (const entry of pageData.entries) {
      if (!known.has(entry.sourceId)) pageFresh += 1;
      entries.push(entry);
    }
    if (earlyStopEnabled && pageData.entries.length > 0 && pageFresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownPageStreak = 0;
    }
    if (!pageData.nextPageCursor) {
      log.info(
        `[pond cosmos-api] library handle=${viewer.handle} entries=${entries.length}`,
      );
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    pageCursor = pageData.nextPageCursor;
    await sleep(400);
  }
  log.info(
    `[pond cosmos-api] library handle=${viewer.handle} entries=${entries.length} pages=${MAX_PAGES}`,
  );
  return { ok: true, entries, reachedEnd: false, seen: entries.length };
}

export async function listCosmosCollections(
  partition: string = PARTITION,
): Promise<
  { ok: true; collections: CosmosCollection[] } | { ok: false; status: number }
> {
  const viewer = await fetchCosmosViewer(partition);
  if (!viewer) return { ok: false, status: 401 };
  const userId = Number(viewer.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, status: 401 };
  }

  const collections: CosmosCollection[] = [];
  let pageCursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await cosmosGraphql(
      partition,
      "PondClusters",
      CLUSTERS_QUERY,
      { userId, pageSize: PAGE_SIZE, pageCursor },
      CosmosClustersDataSchema,
    );
    if (!result.ok) return result;
    const pageData = pageFromClusters(result.json);
    collections.push(...pageData.collections);
    if (!pageData.nextPageCursor) return { ok: true, collections };
    pageCursor = pageData.nextPageCursor;
    await sleep(250);
  }
  return { ok: true, collections };
}

async function cosmosGraphql<T>(
  partition: string,
  operationName: string,
  query: string,
  variables: {
    userId?: number;
    pageSize?: number;
    pageCursor?: string;
    input?: { slug: string; ownerUsername: string };
  },
  schema: z.ZodType<T>,
): Promise<JsonResult<T>> {
  const token = await accessToken(partition);
  if (!token) return { ok: false, status: 401 };
  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA);
  const url = `${GRAPHQL_URL}?q=${encodeURIComponent(operationName)}`;
  let res: Response;
  try {
    res = await ses.fetch(url, {
      method: "POST",
      headers: {
        accept: "application/graphql-response+json,application/json;q=0.9",
        "content-type": "application/json",
        "x-client-name": COSMOS_CLIENT_NAME,
        origin: "https://www.cosmos.so",
        referer: "https://www.cosmos.so/",
        authorization: `Bearer ${token}`,
        "user-agent": CHROME_UA,
      },
      body: JSON.stringify({ operationName, query, variables }),
    });
  } catch (err) {
    log.warn("[pond cosmos-api] fetch threw", operationName, err);
    return { ok: false, status: 0 };
  }
  if (res.status === 429) return { ok: false, status: 429 };
  const text = await res.text();
  let envelope: z.infer<typeof GraphqlEnvelopeSchema>;
  try {
    envelope = GraphqlEnvelopeSchema.parse(JSON.parse(text));
  } catch {
    return { ok: false, status: res.status || 0 };
  }
  if (
    envelope.errors?.some(
      (error) => error.extensions?.code === "AUTHENTICATION",
    )
  ) {
    return { ok: false, status: 401 };
  }
  if ((envelope.errors?.length ?? 0) > 0) {
    log.warn(
      "[pond cosmos-api] graphql errors",
      operationName,
      envelope.errors?.map((error) => ({
        message: error.message,
        code: error.extensions?.code,
      })),
    );
    return { ok: false, status: res.status || 400 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  try {
    return { ok: true, json: schema.parse(envelope.data ?? {}) };
  } catch {
    return { ok: false, status: res.status || 0 };
  }
}

async function accessToken(partition: string): Promise<string | null> {
  try {
    const cookies = await session.fromPartition(partition).cookies.get({});
    const hit = cookies.find((cookie) => cookie.name === "csms_accessToken");
    return hit && hit.value.length > 0 ? hit.value : null;
  } catch (err) {
    log.warn("[pond cosmos-api] cookies.get failed", err);
    return null;
  }
}
