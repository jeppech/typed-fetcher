// 2xx Success
/** Standard response for successful HTTP requests */
export const HTTP_OK = 200;

/** The request has been fulfilled, resulting in the creation of a new resource */
export const HTTP_CREATED = 201;

/** The request has been accepted for processing, but the processing has not been completed */
export const HTTP_ACCEPTED = 202;

/** The server successfully processed the request, and is not returning any content */
export const HTTP_NO_CONTENT = 204;

/** The server successfully processed the request, asks that the requester reset its document view */
export const HTTP_RESET_CONTENT = 205;

/** The server is delivering only part of the resource due to a range header sent by the client */
export const HTTP_PARTIAL_CONTENT = 206;

// 3xx Redirection
/** Indicates multiple options for the resource from which the client may choose */
export const HTTP_MULTIPLE_CHOICES = 300;

/** This and all future requests should be directed to the given URI */
export const HTTP_MOVED_PERMANENTLY = 301;

/** Tells the client to look at (browse to) another URL */
export const HTTP_FOUND = 302;

/** The response to the request can be found under another URI using the GET method */
export const HTTP_SEE_OTHER = 303;

/** Indicates that the resource has not been modified since the version specified by the request headers */
export const HTTP_NOT_MODIFIED = 304;

/** The request should be repeated with another URI; however, future requests should still use the original URI */
export const HTTP_TEMPORARY_REDIRECT = 307;

/** The request and all future requests should be repeated using another URI */
export const HTTP_PERMANENT_REDIRECT = 308;

// 4xx Client Error
/** The server cannot or will not process the request due to an apparent client error */
export const HTTP_BAD_REQUEST = 400;

/** Similar to 403 Forbidden, but specifically for use when authentication is required and has failed or has not yet been provided */
export const HTTP_UNAUTHORIZED = 401;

/** Reserved for future use. The original intention was that this code might be used as part of some form of digital cash or micropayment scheme */
export const HTTP_PAYMENT_REQUIRED = 402;

/** The request contained valid data and was understood by the server, but the server is refusing action */
export const HTTP_FORBIDDEN = 403;

/** The requested resource could not be found but may be available in the future */
export const HTTP_NOT_FOUND = 404;

/** A request method is not supported for the requested resource */
export const HTTP_METHOD_NOT_ALLOWED = 405;

/** The requested resource is capable of generating only content not acceptable according to the Accept headers sent in the request */
export const HTTP_NOT_ACCEPTABLE = 406;

/** The client must first authenticate itself with the proxy */
export const HTTP_PROXY_AUTHENTICATION_REQUIRED = 407;

/** The server timed out waiting for the request */
export const HTTP_REQUEST_TIMEOUT = 408;

/** Indicates that the request could not be processed because of conflict in the current state of the resource */
export const HTTP_CONFLICT = 409;

/** Indicates that the resource requested is no longer available and will not be available again */
export const HTTP_GONE = 410;

/** The request did not specify the length of its content, which is required by the requested resource */
export const HTTP_LENGTH_REQUIRED = 411;

/** The server does not meet one of the preconditions that the requester put on the request header fields */
export const HTTP_PRECONDITION_FAILED = 412;

/** The request is larger than the server is willing or able to process */
export const HTTP_PAYLOAD_TOO_LARGE = 413;

/** The URI provided was too long for the server to process */
export const HTTP_URI_TOO_LONG = 414;

/** The request entity has a media type which the server or resource does not support */
export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

/** The client has asked for a portion of the file, but the server cannot supply that portion */
export const HTTP_RANGE_NOT_SATISFIABLE = 416;

/** The server cannot meet the requirements of the Expect request-header field */
export const HTTP_EXPECTATION_FAILED = 417;

/** This code was defined in 1998 as one of the traditional IETF April Fools' jokes */
export const HTTP_IM_A_TEAPOT = 418;

/** The request was directed at a server that is not able to produce a response */
export const HTTP_MISDIRECTED_REQUEST = 421;

/** The request was well-formed but was unable to be followed due to semantic errors */
export const HTTP_UNPROCESSABLE_ENTITY = 422;

/** The resource that is being accessed is locked */
export const HTTP_LOCKED = 423;

/** The request failed because it depended on another request and that request failed */
export const HTTP_FAILED_DEPENDENCY = 424;

/** Indicates that the server is unwilling to risk processing a request that might be replayed */
export const HTTP_TOO_EARLY = 425;

/** The client should switch to a different protocol such as TLS/1.3 */
export const HTTP_UPGRADE_REQUIRED = 426;

/** The origin server requires the request to be conditional */
export const HTTP_PRECONDITION_REQUIRED = 428;

/** The user has sent too many requests in a given amount of time */
export const HTTP_TOO_MANY_REQUESTS = 429;

/** The server is unwilling to process the request because either an individual header field, or all the header fields collectively, are too large */
export const HTTP_REQUEST_HEADER_FIELDS_TOO_LARGE = 431;

/** A server operator has received a legal demand to deny access to a resource or to a set of resources */
export const HTTP_UNAVAILABLE_FOR_LEGAL_REASONS = 451;

// 5xx Server Error
/** A generic error message, given when an unexpected condition was encountered and no more specific message is suitable */
export const HTTP_INTERNAL_SERVER_ERROR = 500;

/** The server either does not recognize the request method, or it lacks the ability to fulfil the request */
export const HTTP_NOT_IMPLEMENTED = 501;

/** The server was acting as a gateway or proxy and received an invalid response from the upstream server */
export const HTTP_BAD_GATEWAY = 502;

/** The server cannot handle the request (because it is overloaded or down for maintenance) */
export const HTTP_SERVICE_UNAVAILABLE = 503;

/** The server was acting as a gateway or proxy and did not receive a timely response from the upstream server */
export const HTTP_GATEWAY_TIMEOUT = 504;

/** The server does not support the HTTP protocol version used in the request */
export const HTTP_HTTP_VERSION_NOT_SUPPORTED = 505;

/** Transparent content negotiation for the request results in a circular reference */
export const HTTP_VARIANT_ALSO_NEGOTIATES = 506;

/** The server is unable to store the representation needed to complete the request */
export const HTTP_INSUFFICIENT_STORAGE = 507;

/** The server detected an infinite loop while processing the request */
export const HTTP_LOOP_DETECTED = 508;

/** Further extensions to the request are required for the server to fulfil it */
export const HTTP_NOT_EXTENDED = 510;

/** The client needs to authenticate to gain network access */
export const HTTP_NETWORK_AUTHENTICATION_REQUIRED = 511;
