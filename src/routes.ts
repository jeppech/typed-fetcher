export type EndpointMethods = 'get' | 'post' | 'put' | 'update' | 'patch' | 'delete' | 'head' | 'options'

export type EndpointResponse<TOkData = unknown, TErrData = unknown> = {
	ok: TOkData,
	err: TErrData
}

export type EndpointSpec = {
	[key: string]: EndpointMethodSpec
}

export type EndpointMethodSpec = {
	[Key in EndpointMethods]?: EndpointResponse
}

export type EndpointOfPath<TSpec extends EndpointSpec, TPath extends keyof TSpec> = {
	[M in keyof TSpec[TPath]]: TSpec[TPath][M] extends infer R extends EndpointResponse
	? { method: M, response: R }
	: never
}[keyof TSpec[TPath]]

// export type ExtractMethod<TSpec extends EndpointSpec> = {
// 	[P in keyof TSpec]: keyof TSpec[P] extends infer M extends EndpointMethods ? M : never
// }[keyof TSpec]

// export type ExtractPaths<TSpec extends EndpointSpec, TMethod extends EndpointMethods> = {
// 	[P in keyof TSpec]: TMethod extends keyof TSpec[P] ? P & string : never
// }[keyof TSpec]

// type EndpointOfMethod<TSpec extends EndpointSpec, TMethod extends EndpointMethods> = {
// 	[P in keyof TSpec]: TSpec[P][TMethod] extends infer R extends EndpointResponse
// 	? { path: P; resp: R }
// 	: never
// }[keyof TSpec]