import type { FetchResult } from './result.js';
import { err_result, ok_result } from './result.js';
import type { Endpoint, Jsonable } from './types.js';

export type HttpResult<R extends Endpoint> = FetchResult<HttpResponse<R['response']['ok'], R['response']['err']>>;

export type HttpResponseBase = {
  /** The underlying fetch response object. */
  response: Response;
  /** HTTP status code from the response. */
  status: number;
  /** Reads the response body as text. */
  text: () => Promise<FetchResult<string, ParseError>>;
};

export type HttpResponseOk<T> = HttpResponseBase & {
  /** True when the response has a 2xx status. */
  ok: true;
  /** Parses the response body as the endpoint's success payload. */
  json: () => Promise<FetchResult<T, ParseError>>;
};

export type HttpResponseErr<E> = HttpResponseBase & {
  /** False when the response has a non-2xx status. */
  ok: false;
  /** Parses the response body as the endpoint's error payload. */
  json: () => Promise<FetchResult<E, ParseError>>;
};

export type HttpResponse<T, E> = HttpResponseOk<T> | HttpResponseErr<E>;

export function http_response<R extends Endpoint>(
  response: Response,
): HttpResponse<R['response']['ok'], R['response']['err']> {
  const base = {
    response,
    status: response.status,
    text: async () => parse_text(response),
  };

  if (response.ok) {
    return {
      ...base,
      ok: true,
      json: async () => parse_json<R['response']['ok']>(response),
    };
  }

  return {
    ...base,
    ok: false,
    json: async () => parse_json<R['response']['err']>(response),
  };
}

async function parse_json<T>(response: Response): Promise<FetchResult<T, ParseError>> {
  try {
    const json: T = await response.json();
    return ok_result(json);
  } catch (error) {
    console.error('failed parsing json', error);
    return err_result(new ParseError('JSON', 'failed parsing json', { context: response.url, cause: error }));
  }
}

async function parse_text(response: Response): Promise<FetchResult<string, ParseError>> {
  try {
    const text: string = await response.text();
    return ok_result(text);
  } catch (error) {
    console.error('failed parsing text', error);
    return err_result(new ParseError('TEXT', 'failed parsing text', { context: response.url, cause: error }));
  }
}

export class BaseError<T extends string> extends Error {
  override name: T;
  override message: string;

  /** Additional structured context for the error. */
  readonly context?: Jsonable;

  constructor(name: T, message: string, options: { cause?: unknown; context?: Jsonable } = {}) {
    super(message, { cause: options.cause });

    this.name = name;
    this.message = message;
    this.context = options.context;
  }
}

type ParseTypes = 'JSON' | 'TEXT';
type SerializeTypes = 'JSON_STRINGIFY' | 'BASE64_ENCODE';

export class ParseError extends BaseError<ParseTypes> {}
export class SerializeError extends BaseError<SerializeTypes> {}
