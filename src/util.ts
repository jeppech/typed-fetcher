import type { Result } from '@jeppech/results-ts'
import { Ok, Err } from '@jeppech/results-ts'

export type BodyJson = Record<string, unknown> | Array<unknown> | null;

export function is_browser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function is_plain_object(obj: unknown): boolean {
	return obj?.constructor === Object;
}

export function is_array(val: unknown): boolean {
	return Array.isArray(val)
}

export function format_exception(msg: string, err: unknown): Result<never, string> {
	if (err instanceof Error) {
		return Err(`${msg}: ${err.message}`)
	}
	return Err(`${msg}: ${err}`) 
}

export function json_stringify(data: BodyJson): Result<string, string> {
	try {
		return Ok(JSON.stringify(data))
	} catch (err) {
		return format_exception('json_stringify error', err)
	}
}

export function json_parse<T>(text: string, reviver?: (this: any, key: string, value: any) => any): Result<T, string> {
	try {
		return Ok(JSON.parse(text, reviver))
	} catch (err) {
		return format_exception('json_parse error', err)
	}
}
