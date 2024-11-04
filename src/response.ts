import { Ok, Err, type Result } from '@jeppech/results-ts';
import type { Endpoint } from './types.js';

// Extract the `ok` and `err` types from an endpoint response
export type HttpResult<R extends Endpoint, E> = Result<HttpResponse<R['response']['ok'], R['response']['err']>, E>;

enum ResponseType {
  Ok,
  Err,
}

export function http_response<R extends Endpoint>(
  response: Response,
): HttpResponse<R['response']['ok'], R['response']['err']> {
  if (response.ok) {
    return new HttpResponseOk<R['response']['ok']>(response);
  } else {
    return new HttpResponseErr<R['response']['err']>(response);
  }
}

export type HttpResponse<T, E> = HttpResponseOk<T> | HttpResponseErr<E>;

abstract class BaseHttpResponse<T, E> {
  abstract readonly type: ResponseType;

  constructor(public readonly response: Response) {}

  /**
   * Response is OK if the HTTP status code is 2xx
   */
  ok(): this is HttpResponseOk<T> {
    return this.type === ResponseType.Ok;
  }

  /**
   * Response is Err if the HTTP status code is 4xx or 5xx
   */
  err(): this is HttpResponseErr<E> {
    return this.type === ResponseType.Err;
  }

  /**
   * Returns the HTTP status code
   */
  get status(): number {
    return this.response.status;
  }

  abstract json(): Promise<Result<T, string> | Result<E, string>>;
  abstract text(): Promise<Result<string, string> | Result<E, string>>;
}

export class HttpResponseOk<T> extends BaseHttpResponse<T, never> {
  readonly type = ResponseType.Ok;

  async json(): Promise<Result<T, string>> {
    try {
      const json: T = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing json', error);
      return Err('failed parsing json');
    }
  }

  async text(): Promise<Result<string, string>> {
    try {
      const text: string = await this.response.text();
      return Ok(text);
    } catch (error) {
      console.error('failed parsing text', error);
      return Err('failed parsing text');
    }
  }
}

export class HttpResponseErr<E> extends BaseHttpResponse<never, E> {
  readonly type = ResponseType.Err;

  async json(): Promise<Result<E, string>> {
    try {
      const json: E = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing json', error);
      return Err('failed parsing json');
    }
  }

  async text(): Promise<Result<E, string>> {
    try {
      const json: E = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing json', error);
      return Err('failed parsing json');
    }
  }
}
