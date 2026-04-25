export type EndpointMethods = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

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

type EndpointMethodInput = Endpoint | EndpointResponse;

type NormalizeEndpoint<TEndpoint extends EndpointMethodInput> = TEndpoint extends EndpointResponse
  ? Endpoint<TEndpoint>
  : TEndpoint;

type NormalizeEndpointMethodSpec<TMethods extends Record<string, EndpointMethodInput>> = {
  [TMethod in keyof TMethods]: NormalizeEndpoint<TMethods[TMethod]>;
};

export type EndpointBuilderSpec = Record<string, Record<string, EndpointMethodInput>>;

export type EndpointsForPath<TSpec extends EndpointSpec, TPath extends keyof TSpec> = {
  [M in keyof TSpec[TPath]]: TSpec[TPath][M] extends infer R extends Endpoint ? { response: R; method: M } : void;
}[keyof TSpec[TPath]];

export type ExtractResponse<
  TSpec extends EndpointSpec,
  TPath extends keyof TSpec,
  TMethod extends keyof TSpec[TPath],
> = Extract<EndpointsForPath<TSpec, TPath>, { method: TMethod }>['response'];

export type Jsonable =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Jsonable[]
  | { readonly [key: string]: Jsonable }
  | { toJSON(): Jsonable };

export function endpoint<
  TResponse extends EndpointResponse = EndpointResponse,
  TRequest extends EndpointRequest = EndpointRequest,
>(): Endpoint<TResponse, TRequest> {
  return {} as Endpoint<TResponse, TRequest>;
}

export function define_endpoints<TSpec extends EndpointBuilderSpec>(spec: {
  [TPath in keyof TSpec]: NormalizeEndpointMethodSpec<TSpec[TPath]>;
}): {
  [TPath in keyof TSpec]: NormalizeEndpointMethodSpec<TSpec[TPath]>;
} {
  return spec;
}
