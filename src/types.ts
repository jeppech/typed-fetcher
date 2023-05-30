export type EndpointMethods = 'get' | 'post' | 'put' | 'update' | 'patch' | 'delete' | 'head' | 'options';

export type EndpointResponse<TOkData = unknown, TErrData = unknown> = {
  ok: TOkData,
  err: TErrData,
}

export type EndpointRequest<TRequestBody = any, TUrlParams = any, TPathParams = any> = {
  body: TRequestBody,
  url: TUrlParams,
  path: TPathParams,
}

export type Endpoint<
  TResponse extends EndpointResponse = EndpointResponse,
  TRequest extends EndpointRequest = EndpointRequest
> = {
  response: TResponse,
  request?: TRequest
}

export type EndpointSpec = {
  [key: string]: EndpointMethodSpec;
};

export type EndpointMethodSpec = {
  [Key in EndpointMethods]?: Endpoint;
};

export type EndpointOfMethod<TSpec extends EndpointSpec, TMethod extends EndpointMethods> = {
  [P in keyof TSpec]: TSpec[P][TMethod] extends infer R extends Endpoint
  ? { path: P; response: R }
  : never
}[keyof TSpec]

export type ExtractResponse<
  TSpec extends EndpointSpec,
  TPath extends keyof TSpec,
  TMethod extends EndpointMethods,
> = Extract<EndpointOfMethod<TSpec, TMethod>, { path: TPath }>['response'];

export type ExtractMethods<TSpec extends EndpointSpec> = {
  [P in keyof TSpec]: keyof TSpec[P] extends infer M extends EndpointMethods
  ? keyof TSpec[P]
  : never
}[keyof TSpec]

// export type ExtractMethod<TSpec extends EndpointSpec> = {
//  [P in keyof TSpec]: keyof TSpec[P] extends infer M extends EndpointMethods ? M : never
// }[keyof TSpec]

// export type ExtractPaths<TSpec extends EndpointSpec, TMethod extends EndpointMethods> = {
//  [P in keyof TSpec]: TMethod extends keyof TSpec[P] ? P & string : never
// }[keyof TSpec]
