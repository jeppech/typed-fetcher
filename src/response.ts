import { Err, Ok, type Result } from '@jeppech/results-ts';

import { type Endpoint, Jsonable } from './types.js';

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

  abstract json(): Promise<Result<T, ParseError> | Result<E, ParseError>>;
  abstract text(): Promise<Result<string, ParseError> | Result<E, ParseError>>;
}

export class HttpResponseOk<T> extends BaseHttpResponse<T, never> {
  readonly type = ResponseType.Ok;

  async json(): Promise<Result<T, ParseError>> {
    try {
      const json: T = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing json', error);
      return Err(new ParseError('JSON', 'failed parsing json', { context: this.response.url, cause: error }));
    }
  }

  async text(): Promise<Result<string, ParseError>> {
    try {
      const text: string = await this.response.text();
      return Ok(text);
    } catch (error) {
      console.error('failed parsing text', error);
      return Err(new ParseError('TEXT', 'failed parsing text', { context: this.response.url, cause: error }));
    }
  }
}

export class HttpResponseErr<E> extends BaseHttpResponse<never, E> {
  readonly type = ResponseType.Err;

  async json(): Promise<Result<E, ParseError>> {
    try {
      const json: E = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing json', error);
      return Err(new ParseError('JSON', 'failed parsing json', { context: this.response.url, cause: error }));
    }
  }

  async text(): Promise<Result<E, ParseError>> {
    try {
      const json: E = await this.response.json();
      return Ok(json);
    } catch (error) {
      console.error('failed parsing text', error);
      return Err(new ParseError('JSON', 'failed parsing json', { context: this.response.url, cause: error }));
    }
  }
}

export class BaseError<T extends string> extends Error {
  name: T;
  message: string;

  readonly context?: Jsonable;

  constructor(name: T, message: string, options: { cause?: unknown; context?: Jsonable } = {}) {
    super();

    this.name = name;
    this.message = message;
    this.context = options.context;
    this.cause = options.cause;
  }
}

type ParseTypes = 'JSON' | 'TEXT';

export class ParseError extends BaseError<ParseTypes> {}
