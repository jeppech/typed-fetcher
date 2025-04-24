export type EndpointMethods = 'get' | 'post' | 'put' | 'update' | 'patch' | 'delete' | 'head' | 'options';

export type EndpointResponse<TOkData = unknown, TErrData = unknown> = {
  ok: TOkData;
  err: TErrData;
};

export type EndpointRequest<TRequestBody = unknown, TUrlParams = unknown, TPathParams = unknown> = {
  body: TRequestBody;
  url: TUrlParams;
  path: TPathParams;
};

export type Endpoint<
  TResponse extends EndpointResponse = EndpointResponse,
  TRequest extends EndpointRequest = EndpointRequest,
> = {
  response: TResponse;
  request?: TRequest;
};

export type EndpointMethodSpec = {
  [Key in EndpointMethods]?: Endpoint;
};

export type EndpointSpec = {
  [key: string]: EndpointMethodSpec;
};

export type EndpointsForPath<TSpec extends EndpointSpec, TPath extends keyof TSpec> = {
  [M in keyof TSpec[TPath]]: TSpec[TPath][M] extends infer R extends Endpoint ? { response: R; method: M } : void;
}[keyof TSpec[TPath]];

export type ExtractResponse<
  TSpec extends EndpointSpec,
  TPath extends keyof TSpec,
  TMethod extends keyof TSpec[TPath],
> = Extract<EndpointsForPath<TSpec, TPath>, { method: TMethod }>['response'];
