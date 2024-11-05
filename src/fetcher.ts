import { Ok, Err } from '@jeppech/results-ts';
import { type Jsonable, json_stringify, base64_encode } from '@jeppech/results-ts/utils';

import type { Endpoint, EndpointSpec, ExtractResponse } from './types.js';
import type { HttpResponseErr, HttpResult } from './response.js';
import { http_response } from './response.js';
import { Semaphore, type Releaser } from './semaphore.js';
// import { create } from '$pkg/logger/index.js';

type FetcherOpts = {
  url: string;
  path?: string;
  semaphore?: number;
};

// export const logf = create('fetcher');

export type RequestError =
  | { type: 'http'; url: URL; err: HttpResponseErr<unknown> }
  | { type: 'fetch'; url: URL; err: Error };

export type PatchedRequest = {
  base_url?: string;
  route?: string;
  bearer?: string;
  headers?: HeadersInit;
  retry: boolean;
};

export type InterceptHandler = (url: URL, req: Fetcher<Endpoint>) => Promise<void> | void;
export type ErrorHandler = (err: RequestError, release?: Releaser) => Promise<PatchedRequest | null>;

export type Unsubscriber = () => void;

export class TypedFetcher<TSpec extends EndpointSpec = EndpointSpec> {
  error_handlers: [ErrorHandler, boolean][] = [];
  intercept_handlers: InterceptHandler[] = [];
  public semaphore: Semaphore;

  constructor(private options: FetcherOpts) {
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

  intercept(handler: InterceptHandler): Unsubscriber {
    this.intercept_handlers.push(handler);

    return () => {
      const idx = this.intercept_handlers.findIndex((h) => h == handler);
      this.intercept_handlers.splice(idx, 1);
    };
  }

  on_error(handler: ErrorHandler, blocking = false): Unsubscriber {
    this.error_handlers.push([handler, blocking]);

    return () => {
      const idx = this.error_handlers.findIndex((h) => h[0] == handler);
      this.error_handlers.splice(idx, 1);
    };
  }
}

type RequestInitExtended = RequestInit & {
  fetch?: typeof fetch;
};

export class Fetcher<R extends Endpoint> {
  fetch: typeof fetch;

  public url: string;
  public url_path: string;
  public url_path_params?: Record<string, string | number>;
  public url_search_params?: Record<string, string | number>;

  public options: RequestInitExtended;
  private tf: TypedFetcher;

  constructor(url: string, path: string, options: RequestInitExtended, tf: TypedFetcher) {
    this.url = url;
    this.url_path = path;
    this.options = options;

    // Use the fetch function passed in options, or default
    this.fetch = this.options.fetch || globalThis.fetch;
    this.tf = tf;
  }

  /**
   * Set header "Authorization: base64(<username>:<password>)"
   */
  basic(username: string, password: string): this {
    const encoded = base64_encode(`${username}:${password}`).expect('failed encoding credentials');

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
   * Any matching headers set in options, will be overidden.
   *
   * @TODO This needs to handle both head
   */
  headers(headers: HeadersInit): this {
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
    this.url_search_params = params;
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
  json(data?: Jsonable): this {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (data !== undefined) {
      this.options.body = json_stringify(data).expect('failed to stringify json body');
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

  async request(method?: string): Promise<HttpResult<R, Error>> {
    if (method !== undefined) {
      this.options.method = method;
    }

    return this.exec();
  }

  private async handle_error(err: RequestError, skip = false): Promise<PatchedRequest> {
    if (this.tf.error_handlers.length == 0) {
      return { retry: false };
    }

    for (const [handler, blocking] of this.tf.error_handlers) {
      let release: Releaser | undefined = undefined;
      let patch: PatchedRequest | null = null;

      if (blocking) {
        release = await this.tf.semaphore.block(err.url.toString());
        patch = await handler(err, release);
      } else {
        patch = await handler(err);
      }

      if (!patch) continue;

      return patch;
    }

    return { retry: false };
  }

  private apply_patch(patch: PatchedRequest): boolean {
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

    return patch.retry;
  }

  private intercept(url: URL): void {
    for (const handler of this.tf.intercept_handlers) {
      handler(url, this);
    }
  }

  private async exec_with_lock(previous_lock?: Releaser): Promise<HttpResult<R, Error>> {
    const url = this.build_url();

    this.intercept(url);

    const release = previous_lock || (await this.tf.semaphore.acquire(url.toString()));

    const result: HttpResult<R, Error> = await this.fetch(url, this.options)
      .then((r) => {
        return Ok(http_response<R>(r));
      })
      .catch((e: Error | string) => {
        return Err(typeof e == 'string' ? new Error(e) : e);
      });

    let patch: PatchedRequest;

    if (result.is_ok()) {
      const http_result = result.unwrap();
      if (http_result.ok()) {
        release();
        return result;
      }

      patch = await this.handle_error({ type: 'http', url, err: http_result });

      const retry = this.apply_patch(patch);

      if (retry) {
        return this.exec_with_lock(release);
      }
    } else {
      patch = await this.handle_error({ type: 'fetch', url, err: result.unwrap_err() });

      const retry = this.apply_patch(patch);

      if (retry) {
        return this.exec_with_lock(release);
      }
    }
    release();
    return result;
  }

  /**
   * Forcing the request to execute, ignoring any locks that might be blocking the queue.
   * This is useful if you need to re-authenticate.
   *
   * This will not trigger any error handlers.
   */
  async force_exec(): Promise<HttpResult<R, Error>> {
    const url = this.build_url();

    this.intercept(url);

    const result: HttpResult<R, Error> = await this.fetch(url, this.options)
      .then((r) => {
        return Ok(http_response<R>(r));
      })
      .catch((e: Error | string) => {
        return Err(typeof e == 'string' ? new Error(e) : e);
      });

    return result;
  }

  async exec(): Promise<HttpResult<R, Error>> {
    return this.exec_with_lock();
  }

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
