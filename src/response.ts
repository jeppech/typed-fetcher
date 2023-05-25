import type { Result } from '@jeppech/results-ts'
import { Ok } from '@jeppech/results-ts'

import { format_exception } from './util'

enum FetchResponseType {
	Ok,
	Err
}

export type FetchResponse<T, E> = FetchResponseOk<T> | FetchResponseErr<E>

abstract class BaseFetchResponse<T> {
	abstract readonly type: FetchResponseType

	constructor(public response: Response) {}

	/**
	 * Returns true if HTTP code is 2xx
	 */
	is_ok(): this is FetchResponseOk<T> {
		return this.response.ok
	}

	/**
	 * Returns the HTTP status code
	 */
	code(): number {
		return this.response.status
	}

	async json(): Promise<Result<T, string>> {
		return await this.response
			.json()
			.then((v: T) => Ok(v))
			.catch((err) => format_exception('fetcher json parse error', err))
	}

	async text(): Promise<Result<string, string>> {
		return await this.response
			.text()
			.then((v) => Ok(v))
			.catch((err) => format_exception('fetcher text parse error', err))
	}
}

export class FetchResponseOk<T> extends BaseFetchResponse<T> {
	readonly type = FetchResponseType.Ok
	constructor(response: Response) {
		super(response)
	}
}

export class FetchResponseErr<E> extends BaseFetchResponse<E> {
	readonly type = FetchResponseType.Err
	constructor(response: Response) {
		super(response)
	}
}