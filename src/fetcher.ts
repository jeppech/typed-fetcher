import { Semaphore, type Releaser } from '@jeppech/semaphore-ts';

import type { HttpResponseErr, HttpResult } from './response.js';
import { ParseError, SerializeError, http_response } from './response.js';
import type { FetchError } from './result.js';
import { err_result, ok_result } from './result.js';
import type { Endpoint, EndpointSpec, ExtractResponse } from './types.js';

type EndpointOk<R extends Endpoint> = R['response']['ok'];
type EndpointErr<R extends Endpoint> = R['response']['err'];

export type TypedFetcherOptions<TSpec extends EndpointSpec = EndpointSpec> = {
  /** Base URL used when building request URLs. */
  url: string;
  /** Optional shared path prefix. */
  path?: string;
  /** Maximum number of concurrent requests for this fetcher. */
  semaphore?: number;
  /** Endpoint definitions used for route type inference. */
  endpoints?: TSpec;
};

export type RequestError =
  | {
      /** The request reached the server but returned a non-2xx response. */
      type: 'http';
      /** URL that was requested. */
      url: URL;
      /** HTTP error response wrapper. */
      err: HttpResponseErr<unknown>;
    }
  | {
      /** The request failed before receiving an HTTP response. */
      type: 'fetch';
      /** URL that was requested. */
      url: URL;
      /** Normalized fetch failure. */
      err: FetchError;
    };

export type RetryPatch = {
  /** Replaces the fetcher's base URL before retrying. */
  base_url?: string;
  /** Replaces the route path before retrying. */
  route?: string;
  /** Sets a bearer token before retrying. */
  bearer?: string;
  /** Merges request headers before retrying. */
  headers?: Record<string, string>;
};

export type RequestContext<R extends Endpoint = Endpoint> = {
  /** URL for the current request attempt. */
  url: URL;
  /** Request builder for the current endpoint. */
  req: Fetcher<R>;
  /** Current retry attempt number, starting at 1. */
  attempt: number;
};

export type RetryDecision =
  | {
      /** Let the next retry handler decide. */
      action: 'skip';
    }
  | {
      /** Stop retrying and return the current error result. */
      action: 'fail';
    }
  | {
      /** Retry the request. */
      action: 'retry';
      /** Optional request changes to apply before retrying. */
      patch?: RetryPatch;
      /** Optional delay before the retry begins. */
      delay_ms?: number;
    };

export type RetryOptions = {
  /** Run the retry handler under the semaphore's blocking lock. */
  blocking?: boolean;
};

export type HttpJsonError<R extends Endpoint> =
  | {
      /** The request failed before an HTTP response was received. */
      type: 'fetch';
      /** Normalized fetch failure. */
      err: FetchError;
    }
  | {
      /** The server returned a non-2xx response. */
      type: 'http';
      /** HTTP error response wrapper. */
      response: HttpResponseErr<EndpointErr<R>>;
      /** Parsed error body, or null if parsing failed. */
      body: EndpointErr<R> | null;
    }
  | {
      /** The response body could not be parsed as JSON. */
      type: 'parse';
      /** Underlying fetch response object. */
      response: Response;
      /** Parse failure details. */
      err: ParseError;
    };

export type HttpJsonResult<R extends Endpoint> =
  | {
      /** Indicates the request and JSON parsing succeeded. */
      ok: true;
      /** Parsed success body. */
      http: EndpointOk<R>;
      /** Underlying fetch response object. */
      response: Response;
    }
  | {
      /** Indicates the request failed at the fetch, HTTP, or parse layer. */
      ok: false;
      /** Flattened error result from `exec_json()`. */
      error: HttpJsonError<R>;
    };

export type NextHandler<R extends Endpoint = Endpoint> = () => Promise<HttpResult<R>>;
export type MiddlewareHandler<R extends Endpoint = Endpoint> = (options: {
  url: URL;
  req: Fetcher<R>;
  next: NextHandler<R>;
}) => Promise<HttpResult<R>>;
export type ErrorObserver<R extends Endpoint = Endpoint> = (
  err: RequestError,
  ctx: RequestContext<R>,
) => Promise<void> | void;
export type RetryHandler<R extends Endpoint = Endpoint> = (
  err: RequestError,
  ctx: RequestContext<R>,
) => Promise<RetryDecision> | RetryDecision;

export type Unsubscriber = () => void;

type RequestInitExtended = RequestInit & {
  fetch?: typeof fetch;
};

export class TypedFetcher<TSpec extends EndpointSpec = EndpointSpec> {
  error_observers: ErrorObserver[] = [];
  retry_handlers: [RetryHandler, RetryOptions][] = [];
  middleware_handlers: MiddlewareHandler[] = [];

  public semaphore: Semaphore;
  private active_blocking_retry?: Promise<void>;
  private release_active_blocking_retry?: () => void;
  private blocking_retry_token = 0;
  private log_exec: boolean = false;

  constructor(private options: TypedFetcherOptions<TSpec>) {
    const url = new URL(options.url);

    this.semaphore = new Semaphore(options.semaphore || 0);

    if (url.pathname.match(/\/{2}/)) {
      console.warn(`URL path contains double slashes: ${options.url} `);
    }
  }

  set url(url: string) {
    if (new URL(url).pathname.match(/\/{2}/)) {
      console.warn(`URL path contains double slashes: ${url} `);
    }
    this.options.url = url;
  }

  route<TPath extends keyof TSpec, TMethod extends keyof TSpec[TPath]>(
    path: TPath,
    method: TMethod,
  ): Fetcher<ExtractResponse<TSpec, TPath, TMethod>> {
    return new Fetcher(this.options.url, path as string, { method: method as string }, this);
  }

  use(handler: MiddlewareHandler): Unsubscriber {
    this.middleware_handlers.push(handler);

    return () => {
      const idx = this.middleware_handlers.findIndex((h) => h == handler);
      if (idx !== -1) {
        this.middleware_handlers.splice(idx, 1);
      }
    };
  }

  on_error(handler: ErrorObserver): Unsubscriber {
    this.error_observers.push(handler);

    return () => {
      const idx = this.error_observers.findIndex((h) => h == handler);
      if (idx !== -1) {
        this.error_observers.splice(idx, 1);
      }
    };
  }

  retry(handler: RetryHandler, options: RetryOptions = {}): Unsubscriber {
    this.retry_handlers.push([handler, options]);

    return () => {
      const idx = this.retry_handlers.findIndex((h) => h[0] == handler);
      if (idx !== -1) {
        this.retry_handlers.splice(idx, 1);
      }
    };
  }

  log(value?: boolean) {
    if (value == undefined) {
      return this.log_exec;
    }
    return (this.log_exec = value);
  }

  /**
   * Claims the single active blocking-retry slot for this fetcher.
   * Returns undefined if another blocking retry handler is already running.
   */
  try_begin_blocking_retry(): Releaser | undefined {
    if (this.active_blocking_retry) {
      return undefined;
    }

    let released = false;
    const token = ++this.blocking_retry_token;

    this.active_blocking_retry = new Promise<void>((resolve) => {
      this.release_active_blocking_retry = () => {
        if (released) {
          return;
        }

        released = true;
        if (this.blocking_retry_token == token) {
          this.active_blocking_retry = undefined;
          this.release_active_blocking_retry = undefined;
        }
        resolve();
      };
    });

    return () => {
      this.release_active_blocking_retry?.();
    };
  }

  async wait_for_blocking_retry(): Promise<boolean> {
    if (!this.active_blocking_retry) {
      return false;
    }

    await this.active_blocking_retry;
    return true;
  }
}

export class Fetcher<R extends Endpoint> {
  fetch: typeof fetch;

  public url: string;
  public url_path: string;
  public url_path_params?: Record<string, string | number>;
  public url_search_params?: Record<string, string | number>;

  public options: RequestInitExtended;
  private tf: TypedFetcher;
  private log_exec = false;

  constructor(url: string, path: string, options: RequestInitExtended, tf: TypedFetcher) {
    this.url = url;
    this.url_path = path;
    this.options = options;

    this.fetch = this.options.fetch || globalThis.fetch;
    this.tf = tf;
    this.log_exec = tf.log();
  }

  /**
   * Set header "Authorization: base64(<username>:<password>)"
   */
  basic(username: string, password: string): this {
    const encoded = encode_base64(`${username}:${password}`);

    return this.headers({
      Authorization: `Basic ${encoded}`,
    });
  }

  /**
   * Set header "Authorization: Bearer <token>"
   */
  bearer(token: string): this {
    return this.headers({
      Authorization: `Bearer ${token}`,
    });
  }

  /**
   * Set the request headers.
   * Any matching headers set in options, will be overridden.
   */
  headers(headers: Record<string, string>): this {
    this.options.headers = {
      ...this.options.headers,
      ...headers,
    };

    return this;
  }

  /**
   * Add query string parameters to the URL.
   */
  params(params: Record<string, string | number>): this {
    this.url_search_params = {
      ...this.url_search_params,
      ...params,
    };
    return this;
  }

  /**
   * Set the request body.
   * If the data is an object or array, it will be stringified
   * and the Content-Type header will be set to application/json.
   */
  body(data: BodyInit): this {
    this.options.body = data;
    return this;
  }

  /**
   * Search and replace method, for path parameters
   */
  path(params: Record<string, string | number>): this {
    this.url_path_params = params;
    return this;
  }

  /**
   * Marks the request as JSON, meaning the `Accept/Content-type`-headers will be set to `application/json`
   *
   * Throws if `data` cannot be parsed as JSON
   */
  json(data?: unknown): this {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (data !== undefined) {
      this.options.body = stringify_json(data);
      headers['Content-Type'] = 'application/json';
    }

    this.cache('no-store');
    this.headers(headers);

    return this;
  }

  cache(value: RequestCache): this {
    this.options.cache = value;
    return this;
  }

  credentials(value: RequestCredentials): this {
    this.options.credentials = value;
    return this;
  }

  /**
   * Logs the request and response to the console
   */
  log(value?: boolean) {
    if (value == undefined) {
      this.log_exec = true;
      return this;
    }
    this.log_exec = value;
    return this;
  }

  async request(method?: string): Promise<HttpResult<R>> {
    if (method !== undefined) {
      this.options.method = method;
    }

    return this.exec();
  }

  async exec_json(): Promise<HttpJsonResult<R>> {
    const result = await this.exec();

    if (!result.ok) {
      return {
        ok: false,
        error: {
          type: 'fetch',
          err: result.error,
        },
      };
    }

    if (!result.http.ok) {
      const body_result = await result.http.json();
      if (!body_result.ok) {
        return {
          ok: false,
          error: {
            type: 'parse',
            response: result.http.response,
            err: body_result.error,
          },
        };
      }

      return {
        ok: false,
        error: {
          type: 'http',
          response: result.http,
          body: body_result.http,
        },
      };
    }

    const body_result = await result.http.json();
    if (!body_result.ok) {
      return {
        ok: false,
        error: {
          type: 'parse',
          response: result.http.response,
          err: body_result.error,
        },
      };
    }

    return {
      ok: true,
      http: body_result.http,
      response: result.http.response,
    };
  }

  /**
   * Runs all error observers without affecting retry decisions.
   */
  private async notify_error(err: RequestError, ctx: RequestContext<R>): Promise<void> {
    for (const handler of this.tf.error_observers) {
      await (handler as ErrorObserver<R>)(err, ctx);
    }
  }

  /**
   * Resolves retry handlers once. Blocking handlers both pause new requests and
   * claim the single active blocking-retry slot while they run.
   */
  private async resolve_retry(err: RequestError, ctx: RequestContext<R>): Promise<RetryDecision> {
    for (const [handler, options] of this.tf.retry_handlers) {
      let semaphore_releaser: Releaser | undefined = undefined;
      let blocking_retry_releaser: Releaser | undefined = undefined;

      try {
        if (options.blocking) {
          semaphore_releaser = this.tf.semaphore.block();
          blocking_retry_releaser = this.tf.try_begin_blocking_retry();
          if (!blocking_retry_releaser) {
            continue;
          }
        }

        const decision = await (handler as RetryHandler<R>)(err, ctx);
        if (decision.action != 'skip') {
          return decision;
        }
      } finally {
        blocking_retry_releaser?.();
        semaphore_releaser?.();
      }
    }

    return { action: 'fail' };
  }

  /**
   * Keeps retry resolution stable while a blocking retry is active elsewhere.
   * If another request completes a blocking retry while we are deciding, wait
   * for it and then evaluate retry handlers again with the current request state.
   */
  private async resolve_retry_stable(err: RequestError, ctx: RequestContext<R>): Promise<RetryDecision> {
    while (true) {
      if (await this.tf.wait_for_blocking_retry()) {
        continue;
      }

      const decision = await this.resolve_retry(err, ctx);

      if (await this.tf.wait_for_blocking_retry()) {
        continue;
      }

      return decision;
    }
  }

  /**
   * Applies request changes returned by a retry handler before the next attempt.
   */
  private apply_patch(patch: RetryPatch): void {
    if (patch.base_url) {
      this.url = patch.base_url;
    }

    if (patch.route) {
      this.url_path = patch.route;
    }

    if (patch.bearer) {
      this.bearer(patch.bearer);
    }

    if (patch.headers) {
      this.headers(patch.headers);
    }
  }

  /**
   * Executes the underlying fetch call and normalizes fetch-layer failures.
   */
  private async fetch_response(url: URL): Promise<HttpResult<R>> {
    try {
      const response = await this.fetch(url, this.options);

      if (this.log_exec) {
        console.log('--- response');
        for (const [key, value] of response.headers.entries()) {
          console.log(`${key}: ${value}`);
        }
      }

      return ok_result(http_response<R>(response));
    } catch (error) {
      return err_result(normalize_fetch_error(error));
    }
  }

  /**
   * Runs one request attempt under the semaphore lock, then notifies observers
   * and resolves retry behavior for fetch and HTTP failures.
   */
  private async exec_request(url: URL, previous_lock?: Releaser, attempt = 1): Promise<HttpResult<R>> {
    const release = previous_lock || (await this.tf.semaphore.acquire());
    let should_release = true;

    try {
      const result = await this.fetch_response(url);
      const ctx: RequestContext<R> = {
        url,
        req: this,
        attempt,
      };

      if (result.ok) {
        const http_result = result.http;
        if (http_result.ok) {
          return result;
        }

        const err: RequestError = { type: 'http', url, err: http_result };
        await this.notify_error(err, ctx);

        const decision = await this.resolve_retry_stable(err, ctx);
        if (decision.action == 'retry') {
          if (decision.patch) {
            this.apply_patch(decision.patch);
          }
          if ((decision.delay_ms || 0) > 0) {
            await sleep(decision.delay_ms || 0);
          }
          should_release = false;
          return this.exec_with_lock(release, attempt + 1);
        }
      } else {
        const err: RequestError = { type: 'fetch', url, err: result.error };
        await this.notify_error(err, ctx);

        const decision = await this.resolve_retry_stable(err, ctx);
        if (decision.action == 'retry') {
          if (decision.patch) {
            this.apply_patch(decision.patch);
          }
          if ((decision.delay_ms || 0) > 0) {
            await sleep(decision.delay_ms || 0);
          }
          should_release = false;
          return this.exec_with_lock(release, attempt + 1);
        }
      }

      return result;
    } finally {
      if (should_release) {
        release();
      }
    }
  }

  /**
   * Dispatches middleware in registration order and ends at the final handler.
   */
  private async run_middlewares(url: URL, final_handler: NextHandler<R>): Promise<HttpResult<R>> {
    const dispatch = async (index: number): Promise<HttpResult<R>> => {
      const handler = this.tf.middleware_handlers[index] as unknown as MiddlewareHandler<R> | undefined;
      if (!handler) {
        return final_handler();
      }

      return handler({ url, req: this, next: () => dispatch(index + 1) });
    };

    return dispatch(0);
  }

  /**
   * Builds the current request URL, logs if enabled, and executes the request
   * while preserving the current semaphore lock across retries.
   */
  private async exec_with_lock(previous_lock?: Releaser, attempt = 1): Promise<HttpResult<R>> {
    const do_log = this.log_exec;
    this.log_exec = false;

    const url = this.build_url();

    if (do_log) {
      console.log('--- request');
      console.log(`${this.options.method?.toUpperCase()} ${url}`);
      console.log('Headers', JSON.stringify(this.options.headers, null, 2));
      console.log('Body', JSON.stringify(this.options.body, null, 2));
    }

    this.log_exec = do_log;
    return this.run_middlewares(url, () => this.exec_request(url, previous_lock, attempt));
  }

  /**
   * Forcing the request to execute, ignoring any locks that might be blocking the queue.
   * This is useful if you need to re-authenticate.
   *
   * This will not trigger any error handlers.
   */
  async force_exec(): Promise<HttpResult<R>> {
    const url = this.build_url();

    return this.run_middlewares(url, () => this.fetch_response(url));
  }

  async exec(): Promise<HttpResult<R>> {
    return this.exec_with_lock();
  }

  /**
   * Expands path parameters and query parameters into the final request URL.
   */
  private build_url(): URL {
    let path = this.url_path;

    if (this.url_path_params) {
      for (const [key, value] of Object.entries(this.url_path_params)) {
        path = path.replace(`:${key}`, value.toString());
      }
    }

    const url = new URL(this.url + path);

    if (this.url_search_params) {
      for (const [key, value] of Object.entries(this.url_search_params)) {
        url.searchParams.append(key, value.toString());
      }
    }

    return url;
  }
}

function encode_base64(value: string): string {
  try {
    if (typeof window !== 'undefined' && typeof btoa !== 'undefined') {
      return btoa(value);
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'utf8').toString('base64');
    }
  } catch (error) {
    throw new SerializeError('BASE64_ENCODE', 'failed encoding credentials', { cause: error, context: value });
  }
  throw new SerializeError('BASE64_ENCODE', 'environment does not support base64 encoding', { context: value });
}

/**
 * Serializes JSON bodies and converts serialization failures to library errors.
 */
function stringify_json(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json == undefined) {
      throw new TypeError('json body resolved to undefined');
    }
    return json;
  } catch (error) {
    throw new SerializeError('JSON_STRINGIFY', 'failed to stringify json body', { cause: error });
  }
}

/**
 * Maps raw fetch throws into the public `FetchError` union.
 */
function normalize_fetch_error(error: unknown): FetchError {
  if (error instanceof DOMException && error.name == 'AbortError') {
    return {
      type: 'aborted',
      message: 'request was aborted',
      cause: error,
    };
  }

  if (error instanceof TypeError) {
    return {
      type: 'network',
      message: error.message,
      cause: error,
    };
  }

  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message,
      cause: error,
    };
  }

  return {
    type: 'unknown',
    message: 'request failed',
    cause: error,
  };
}

/**
 * Shared delay helper for retry backoff.
 */
async function sleep(delay_ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delay_ms));
}
