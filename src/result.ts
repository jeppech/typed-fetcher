export type FetchError =
  | {
      type: 'aborted';
      message: string;
      cause: unknown;
    }
  | {
      type: 'network';
      message: string;
      cause: unknown;
    }
  | {
      type: 'unknown';
      message: string;
      cause: unknown;
    };

export type FetchResult<T, TError = FetchError> =
  | {
      ok: true;
      http: T;
    }
  | {
      ok: false;
      error: TError;
    };

export function ok_result<T, TError = FetchError>(http: T): FetchResult<T, TError> {
  return {
    ok: true,
    http,
  };
}

export function err_result<T = unknown, TError = FetchError>(error: TError): FetchResult<T, TError> {
  return {
    ok: false,
    error,
  };
}
