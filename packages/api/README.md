# pond-api

Typed client for [Pond](https://pond.raphaelsalaja.com)'s Local API. Pond runs the API on your Mac while the app is open, and this client validates every response against the published schemas.

```sh
npm install pond-api
```

Copy the Local API Token from **Pond Settings → General → Raycast**, then pass it to the client:

```ts
import { PondApi } from "pond-api";

const pond = new PondApi({ token: process.env.POND_TOKEN });

const page = await pond.query({ keywords: "posters", include: ["saves"] });
for (const save of page.saves ?? []) console.log(save.title ?? save.url);
```

Every write takes an optional `libraryId`. Pass the one a Save came with, and Pond refuses the edit if you've switched libraries since.

```ts
await pond.setRating([save.id], 5, save.libraryId);
await pond.setFavorite([save.id], true, save.libraryId);
```

`SOURCES`, `sourceLabel`, and `hostToSource` name the platforms Pond saves from, so you can label `save.source` the way Pond does.

Failures throw `PondApiError`. Branch on `error.code` (for example `save_not_found` or `library_mismatch`), or on `error.kind` for connection and authentication problems.

See the [Local API reference](https://github.com/raphaelsalaja/pond/blob/main/docs/api.md) for every endpoint, error code, and the versioning promise.
