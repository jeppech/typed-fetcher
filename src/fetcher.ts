import { Semaphore, type Releaser } from '@jeppech/semaphore-ts';

import type { HttpResponseErr, HttpResult } from './response.js';
import { ParseError, SerializeError, http_response } from './response.js';
import type { FetchError } from './result.js';
import { err_result, ok_result } from './result.js';
import type { Endpoint, EndpointSpec, ExtractResponse } from './types.js';

type EndpointOk<R extends Endpoint> = R['response']['ok'];
type EndpointErr<R extends Endpoint> = R['response']['err'];

export type TypedFetcherOptions<TSpec extends EndpointSpec = EndpointSpec> = {
  url: string;
  path?: string;
  semaphore?: number;
  endpoints?: TSpec;
};

export type RequestError =
  | { type: 'http'; url: URL; err: HttpResponseErr<unknown> }
  | { type: 'fetch'; url: URL; err: FetchError };

export type RequestPatch = {
  base_url?: string;
  route?: string;
  bearer?: string;
  headers?: Record<string, string>;
  retry: boolean;
};

export type HttpJsonError<R extends Endpoint> =
  | { type: 'fetch'; err: FetchError }
  | { type: 'http'; response: HttpResponseErr<EndpointErr<R>>; body: EndpointErr<R> | null }
  | { type: 'parse'; response: Response; err: ParseError };

export type HttpJsonResult<R extends Endpoint> =
  | { ok: true; http: EndpointOk<R>; response: Response }
  | { ok: false; error: HttpJsonError<R> };

export type NextHandler<R extends Endpoint = Endpoint> = () => Promise<HttpResult<R>>;
export type MiddlewareHandler<R extends Endpoint = Endpoint> = (options: {
  url: URL;
  req: Fetcher<R>;
  next: NextHandler<R>;
}) => Promise<HttpResult<R>>;
export type ErrorHandler = (
  err: RequestError,
  release?: Releaser,
) => Promise<[RequestPatch | null, Releaser | undefined]>;

export type Unsubscriber = () => void;

type RequestInitExtended = RequestInit & {
  fetch?: typeof fetch;
};

export class TypedFetcher<TSpec extends EndpointSpec = EndpointSpec> {
  error_handlers: [ErrorHandler, boolean][] = [];
  middleware_handlers: MiddlewareHandler[] = [];

  public semaphore: Semaphore;
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

  on_error(handler: ErrorHandler, blocking = false): Unsubscriber {
    this.error_handlers.push([handler, blocking]);

    return () => {
      const idx = this.error_handlers.findIndex((h) => h[0] == handler);
      if (idx !== -1) {
        this.error_handlers.splice(idx, 1);
      }
    };
  }

  log(value?: boolean) {
    if (value == undefined) {
      return this.log_exec;
    }
    return (this.log_exec = value);
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

  private async handle_error(err: RequestError): Promise<RequestPatch> {
    if (this.tf.error_handlers.length == 0) {
      return { retry: false };
    }

    for (const [handler, blocking] of this.tf.error_handlers) {
      let releaser: Releaser | undefined = undefined;
      let patch: RequestPatch | null = null;

      if (blocking) {
        releaser = this.tf.semaphore.block(err.url.toString());
        [patch, releaser] = await handler(err, releaser);
      } else {
        [patch] = await handler(err);
      }

      releaser?.();
      if (!patch) continue;

      return patch;
    }

    return { retry: false };
  }

  private apply_patch(patch: RequestPatch): boolean {
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

  private async exec_request(url: URL, previous_lock?: Releaser): Promise<HttpResult<R>> {
    const release = previous_lock || (await this.tf.semaphore.acquire(url.toString()));
    let should_release = true;

    try {
      const result = await this.fetch_response(url);

      let patch: RequestPatch;

      if (result.ok) {
        const http_result = result.http;
        if (http_result.ok) {
          return result;
        }

        patch = await this.handle_error({ type: 'http', url, err: http_result });

        const retry = this.apply_patch(patch);

        if (retry) {
          should_release = false;
          return this.exec_with_lock(release);
        }
      } else {
        patch = await this.handle_error({ type: 'fetch', url, err: result.error });

        const retry = this.apply_patch(patch);

        if (retry) {
          should_release = false;
          return this.exec_with_lock(release);
        }
      }

      return result;
    } finally {
      if (should_release) {
        release();
      }
    }
  }

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

  private async exec_with_lock(previous_lock?: Releaser): Promise<HttpResult<R>> {
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
    return this.run_middlewares(url, () => this.exec_request(url, previous_lock));
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
    return Buffer.from(value, 'utf8').toString('base64');
  } catch (error) {
    throw new SerializeError('BASE64_ENCODE', 'failed encoding credentials', { cause: error, context: value });
  }
}

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
