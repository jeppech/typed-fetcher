import type { RequestError } from './fetcher.js';
import type { FetchError } from './result.js';

const HOST_UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND']);

/**
 * Returns true when a normalized fetch failure maps to a host that cannot be reached.
 *
 * This primarily targets Node-style fetch failures where `TypeError.cause.code` carries
 * the underlying errno value.
 */
export function is_host_unreachable_error(error: RequestError | FetchError): boolean {
  const fetch_error = get_fetch_error(error);

  if (fetch_error == undefined || fetch_error.type != 'network') {
    return false;
  }

  const code = get_error_code(fetch_error.cause);
  return code != undefined && HOST_UNREACHABLE_CODES.has(code);
}

function get_fetch_error(error: RequestError | FetchError): FetchError | undefined {
  if ('err' in error) {
    if (error.type != 'fetch') {
      return undefined;
    }

    return error.err;
  }

  return error;
}

function get_error_code(value: unknown): string | undefined {
  if (!(value instanceof Error)) {
    return undefined;
  }

  const err = value as Error & { code?: unknown };
  return typeof err.code == 'string' ? err.code : undefined;
}
