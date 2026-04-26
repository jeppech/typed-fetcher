export type FetchError =
  | {
      /** The request was aborted locally. */
      type: 'aborted';
      /** Human-readable error message. */
      message: string;
      /** Original thrown value from fetch. */
      cause: unknown;
    }
  | {
      /** The request failed due to a network-level error. */
      type: 'network';
      /** Human-readable error message. */
      message: string;
      /** Original thrown value from fetch. */
      cause: unknown;
    }
  | {
      /** The request failed for a reason that could not be classified further. */
      type: 'unknown';
      /** Human-readable error message. */
      message: string;
      /** Original thrown value from fetch. */
      cause: unknown;
    };

export type FetchResult<T, TError = FetchError> =
  | {
      /** Indicates the operation completed successfully. */
      ok: true;
      /** Successful result value. */
      http: T;
    }
  | {
      /** Indicates the operation failed. */
      ok: false;
      /** Error value for the failed operation. */
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
