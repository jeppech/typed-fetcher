# @jeppech/typed-fetcher

A typed `fetch` wrapper for TypeScript.

Define your API once, then get typed routes, request builders, middleware, concurrency control, and typed response parsing.

## Install

```sh
pnpm add @jeppech/typed-fetcher
```

## Quick Start

```ts
import { TypedFetcher, define_endpoints, endpoint } from '@jeppech/typed-fetcher';

type UnitCreated = {
  id: string;
};

type UnitItem = {
  id: string;
  name: string;
};

type HttpOkBody = {
  ok: true;
};

type HttpErrorBody = {
  message: string;
};

const endpoints = define_endpoints({
  '/account/unit': {
    post: endpoint<{ ok: UnitCreated; err: HttpErrorBody }>(),
  },
  '/account/unit/:unit_id': {
    get: endpoint<{ ok: UnitItem; err: HttpErrorBody }>(),
    put: endpoint<{ ok: UnitItem; err: HttpErrorBody }>(),
    delete: endpoint<{ ok: HttpOkBody; err: HttpErrorBody }>(),
  },
});

const fetcher = new TypedFetcher({
  url: 'https://api.example.com',
  endpoints,
});

const result = await fetcher.route('/account/unit/:unit_id', 'get').path({ unit_id: '123' }).exec_json();

if (!result.ok) {
  switch (result.error.type) {
    case 'fetch':
      console.error('network error', result.error.err);
      break;
    case 'http':
      console.error('http error', result.error.response.status, result.error.body);
      break;
    case 'parse':
      console.error('parse error', result.error.err);
      break;
  }
} else {
  console.log(result.http);
}
```

## Defining Endpoints

`define_endpoints(...)` is a typed identity helper for defining endpoints

```ts
import { define_endpoints, endpoint } from '@jeppech/typed-fetcher';

const endpoints = define_endpoints({
  '/users': {
    get: endpoint<{ ok: { id: string }[]; err: { message: string } }>(),
    post: endpoint<
      { ok: { id: string }; err: { message: string } },
      { body: { name: string }; url: never; path: never }
    >(),
  },
});
```

## Making Requests

```ts
const result = await fetcher
  .route('/users', 'post')
  .bearer(token)
  .params({ include: 'roles' })
  .json({ name: 'Ada' })
  .exec_json();
```

Common request helpers:

- `headers(...)`
- `basic(username, password)`
- `bearer(token)`
- `params(...)`
- `path(...)`
- `body(...)`
- `json(...)`
- `cache(...)`
- `credentials(...)`
- `log()`
- `exec_json()`
- `exec()`
- `force_exec()`

## Result Shape

`exec()` returns a nested result shape:

- Outer layer: fetch/network success or failure
- Inner layer: HTTP success or failure

```ts
const result = await fetcher.route('/users', 'get').exec();

if (!result.ok) {
  // fetch failed
  console.error(result.error.type, result.error.message);
} else if (!result.http.ok) {
  // non-2xx HTTP response
  console.error(result.http.status);
} else {
  // 2xx HTTP response
  const body = await result.http.json();
  console.log(body);
}
```

`response.json()` and `response.text()` also return `FetchResult<T>` so parse failures are surfaced without throwing.

For the common JSON case, `exec_json()` flattens fetch, HTTP, and parse handling into one result:

```ts
const result = await fetcher.route('/users', 'get').exec_json();

if (!result.ok) {
  switch (result.error.type) {
    case 'fetch':
      console.error(result.error.err.type, result.error.err.message);
      break;
    case 'http':
      console.error(result.error.response.status, result.error.body);
      break;
    case 'parse':
      console.error(result.error.err);
      break;
  }
} else {
  console.log(result.http);
}
```

Fetch failures are currently normalized into the following shape

```ts
if (!result.ok) {
  switch (result.error.type) {
    case 'aborted':
      console.log('request was aborted');
      break;
    case 'network':
      console.log('network failure', result.error.message);
      break;
    case 'unknown':
      console.log('unexpected failure', result.error.cause);
      break;
  }
}
```

## Middleware

Middleware wraps request execution and can observe or delay requests before calling `next()`.

```ts
fetcher.use(async ({ url, req, next }) => {
  req.headers({ 'x-request-source': 'web' });
  console.log('requesting', url.toString());
  return next();
});
```

Middleware handlers receive:

- `url`: the built request URL
- `req`: the current `Fetcher` instance
- `next`: the next handler in the chain

## Error Handling

`on_error()` Use it for logging, metrics, and tracing.

```ts
fetcher.on_error(async (err, ctx) => {
  console.warn('request failed', err.type, ctx.url.toString(), ctx.attempt);
});
```

Use `retry()` to decide whether a request should be retried.

```ts
fetcher.retry(async (err, ctx) => {
  if (err.type === 'fetch' && err.err.type === 'network' && ctx.attempt < 3) {
    return {
      action: 'retry',
      delay_ms: 250,
    };
  }

  if (err.type === 'http' && err.err.status === 401) {
    const token = await refresh_token();

    return {
      action: 'retry',
      patch: {
        bearer: token,
      },
    };
  }

  return { action: 'fail' };
});
```

`retry()` accepts an optional second argument:

```ts
fetcher.retry(handler, { blocking: true });
```

When `blocking` is enabled, the retry handler runs under the fetcher semaphore's blocking lock.

## Rate Limiting

Use `rate_limiter(...)` as middleware when the upstream API exposes rate-limit headers.

```ts
import { rate_limiter } from '@jeppech/typed-fetcher';

fetcher.use(
  rate_limiter({
    strategy: 'throttle',
    bucket: (url) => url.pathname,
    burst: 5,
  }),
);
```

Options:

- `strategy`: `'pause'` or `'throttle'`
- `headers`: custom header names for `limit`, `remaining`, and `reset`
- `bucket`: rate-limit key. Use `(url) => url.pathname` to group by route.
- `max_delay_ms`: cap any calculated delay
- `burst`: number of immediate requests allowed per observed window before throttling starts

`burst` only affects the `'throttle'` strategy. It is capped to the observed server-side `limit` for the active window.

## Concurrency

`TypedFetcher` also supports a built-in semaphore:

```ts
const fetcher = new TypedFetcher({
  url: 'https://api.example.com',
  endpoints,
  semaphore: 4,
});
```

This limits the number of concurrent requests executed through that fetcher instance.

## Exports

Main exports:

- `TypedFetcher`
- `Fetcher`
- `define_endpoints`
- `endpoint`
- `rate_limiter`
- `BaseError`
- `ParseError`
- `SerializeError`

Type exports include:

- `Endpoint`
- `EndpointResponse`
- `EndpointSpec`
- `HttpResult`
- `RequestError`
- `RequestContext`
- `RetryDecision`
- `RetryPatch`
- `RateLimitOptions`

## Development

```sh
pnpm lint
pnpm build
```

There is currently no test runner configured in this repository.
