import type { Result } from '@jeppech/results-ts';
import { Ok, Err } from '@jeppech/results-ts';

import type { BodyJson } from './util';
import { is_browser, json_stringify } from './util';

import type { FetchResponse } from './response';
import { FetchResponseOk, FetchResponseErr } from './response';
import { EndpointResponse, EndpointSpec, ExtractResponse } from './types';

export class TypedFetcher<TSpec extends EndpointSpec> {
  constructor(public host: string) {}

  fetch<P extends keyof TSpec, M extends keyof TSpec[P]>(path: P, method: M): Fetcher<ExtractResponse<TSpec, P, M>> {
    return new Fetcher(this.url(path), { method: method as string });
  }

  url<P extends keyof TSpec>(path?: P): string {
    if (path == undefined) {
      return this.host;
    }

    return `${this.host}/${path as string}`;
  }
}

// url: RequestInfo | URL, options: RequestInit & { fetch?: typeof fetch } = {}): Fetcher<R> {
// export function fetcher<P extends EndpointMethods, R extends EndpointResponse>(url: P, method: string = 'get'): Fetcher<R> {
// 	return new Fetcher(url, { method })
// }

export class Fetcher<R extends EndpointResponse> {
  fetch: typeof fetch;

  constructor(public url: RequestInfo | URL, public options: RequestInit & { fetch?: typeof fetch } = {}) {
    // Use the fetch function passed in options, or default
    this.fetch = this.options.fetch || window.fetch;
  }

  /**
   * Set header "Authorization: base64(<username>:<password>)"
   */
  basic(username: string, password: string): this {
    let encoded: string;

    if (is_browser()) {
      encoded = window.btoa(`${username}:${password}`);
    } else {
      encoded = Buffer.from(`${username}:${password}`).toString('base64');
    }

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
    const url = new URL(this.url.toString());

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value.toString());
    }

    this.url = url;

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
   * Sets the request body.
   * Throws if data cannot be parsed as JSON
   */
  json(data?: BodyJson): this {
    const headers: Record<string, string> = {
      Accept: 'json',
    };

    if (data !== undefined) {
      this.options.body = json_stringify(data).expect('failed to stringify json body');
      headers['Content-Type'] = 'application/json';
    }

    this.headers(headers);

    return this;
  }

  async request(method?: string): Promise<Result<FetchResponse<R['ok'], R['err']>, FetchError>> {
    if (method !== undefined) {
      this.options.method = method;
    }

    return this.exec();
  }

  async exec(): Promise<Result<FetchResponse<R['ok'], R['err']>, FetchError>> {
    return await this.fetch(this.url, this.options)
      .then((r) => {
        return Ok(r.ok ? new FetchResponseOk<R['ok']>(r) : new FetchResponseErr<R['err']>(r));
      })
      .catch((e: Error | string) => Err(new FetchError(e)));
  }
}

class FetchError extends Error {
  constructor(err: Error | string) {
    super(`fetch error: ${err instanceof Error ? err.message : err}`);
  }
}
