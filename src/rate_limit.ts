import type { Endpoint } from './types.js';
import type { MiddlewareHandler } from './fetcher.js';

export type RateLimitHeaders = {
  limit: string;
  remaining: string;
  reset: string;
};

export type RateLimitStrategy = 'pause' | 'throttle';

export type RateLimitBucket = ((url: URL) => string) | 'fetcher';

export type RateLimitOptions = {
  /**
   * Strategy to use for rate limiting. Defaults to 'throttle'.
   */
  strategy?: RateLimitStrategy;

  /**
   * Headers to use for rate limiting.
   *
   * Defaults are
   * limit: 'x-ratelimit-limit',
   * remaining: 'x-ratelimit-remaining',
   * reset: 'x-ratelimit-reset',
   */
  headers?: Partial<RateLimitHeaders>;

  /**
   * Bucket to use for rate limiting. Defaults to 'fetcher'.
   *
   * Use `(url: URL) => url.pathname` to key by pathname.
   */
  bucket?: RateLimitBucket;

  /**
   * Maximum delay in milliseconds to apply between requests.
   *
   * Defaults to 0.
   */
  max_delay_ms?: number;

  /**
   * Number of requests to allow immediately per observed window before throttling.
   *
   * Only applies to the 'throttle' strategy. Defaults to 7.
   */
  burst?: number;
};

type RateLimitState = {
  limit: number;
  remaining: number;
  reset_at: number;
  next_request_at: number;
  burst_used: number;
  burst_limit: number;
};

const DEFAULT_RATE_LIMIT_HEADERS: RateLimitHeaders = {
  limit: 'x-ratelimit-limit',
  remaining: 'x-ratelimit-remaining',
  reset: 'x-ratelimit-reset',
};

const RATE_LIMIT_FETCHER_BUCKET = '__typed_fetcher__';

class RateLimiter {
  private states = new Map<string, RateLimitState>();
  private headers: RateLimitHeaders = DEFAULT_RATE_LIMIT_HEADERS;
  private strategy: RateLimitStrategy = 'throttle';
  private bucket: RateLimitBucket = 'fetcher';
  private max_delay_ms?: number;
  private burst = 7;

  constructor(options: RateLimitOptions = {}) {
    this.configure(options);
  }

  configure(options: RateLimitOptions = {}): void {
    this.headers = {
      ...DEFAULT_RATE_LIMIT_HEADERS,
      ...options.headers,
    };
    this.strategy = options.strategy || 'pause';
    this.bucket = options.bucket || 'fetcher';
    this.max_delay_ms = options.max_delay_ms;
    this.burst = Math.max(0, options.burst || 0);
  }

  async before_request(url: URL): Promise<void> {
    const state = this.get_state(url);
    if (!state) {
      return;
    }

    const now = Date.now();
    if (state.reset_at <= now) {
      this.states.delete(this.get_bucket_key(url));
      return;
    }

    // Pause until reset when exhausted, otherwise spread requests across the remaining window.
    let wait_until = now;
    if (state.remaining <= 0) {
      wait_until = state.reset_at;
    } else if (this.strategy == 'throttle' && !this.consume_burst(state)) {
      wait_until = Math.max(now, state.next_request_at);
    }

    // Reserve this request's slot before waiting so concurrent calls schedule correctly.
    state.remaining = Math.max(0, state.remaining - 1);
    state.next_request_at = this.get_next_request_at(state, wait_until);

    const delay = this.get_delay(wait_until - now);
    if (delay > 0) {
      await this.sleep(delay);
    }
  }

  update(url: URL, headers: Headers): void {
    const limit = this.parse_number(headers.get(this.headers.limit));
    const remaining = this.parse_number(headers.get(this.headers.remaining));
    const reset = this.parse_number(headers.get(this.headers.reset));

    // Ignore responses that do not expose a complete rate limit window.
    if (limit == undefined || remaining == undefined || reset == undefined) {
      return;
    }

    const now = Date.now();
    const reset_at = now + reset * 1000;
    const state: RateLimitState = {
      limit,
      remaining,
      reset_at,
      next_request_at: now,
      burst_used: 0,
      burst_limit: Math.min(this.burst, limit),
    };

    state.next_request_at = this.get_next_request_at(state, now);
    this.states.set(this.get_bucket_key(url), state);
  }

  private get_state(url: URL): RateLimitState | undefined {
    return this.states.get(this.get_bucket_key(url));
  }

  private get_bucket_key(url: URL): string {
    if (typeof this.bucket == 'function') {
      return this.bucket(url);
    }
    return RATE_LIMIT_FETCHER_BUCKET;
  }

  private get_next_request_at(state: RateLimitState, scheduled_at: number): number {
    if (state.limit <= 0 || state.remaining <= 0) {
      return state.reset_at;
    }

    if (this.strategy == 'pause') {
      return scheduled_at;
    }

    // Evenly space the rest of the window over the remaining request budget.
    const remaining_window_ms = Math.max(state.reset_at - scheduled_at, 0);
    if (remaining_window_ms == 0) {
      return scheduled_at;
    }

    return scheduled_at + Math.ceil(remaining_window_ms / (state.remaining + 1));
  }

  private consume_burst(state: RateLimitState): boolean {
    if (state.burst_limit <= 0 || state.burst_used >= state.burst_limit) {
      return false;
    }

    state.burst_used += 1;
    return true;
  }

  private get_delay(delay: number): number {
    if (delay <= 0) {
      return 0;
    }

    if (this.max_delay_ms == undefined) {
      return delay;
    }

    return Math.min(delay, this.max_delay_ms);
  }

  private parse_number(value: string | null): number | undefined {
    if (value == undefined) {
      return undefined;
    }

    const num = Number.parseFloat(value);
    if (!Number.isFinite(num) || num < 0) {
      return undefined;
    }

    return num;
  }

  private async sleep(delay: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function rate_limiter(options: RateLimitOptions = {}): MiddlewareHandler<Endpoint> {
  const limiter = new RateLimiter(options);

  return async ({ url, next }) => {
    await limiter.before_request(url);

    const result = await next();
    if (result.ok) {
      limiter.update(url, result.http.response.headers);
    }

    return result;
  };
}
