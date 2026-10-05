/**
 * HTTP status codes.
 *
 * Standard codes follow the IANA "Hypertext Transfer Protocol (HTTP) Status Code Registry"
 * (https://www.iana.org/assignments/http-status-codes), whose main reference is RFC 9110
 * (HTTP Semantics, June 2022), section 15. Other references are named per entry.
 *
 * "Heuristically cacheable" follows RFC 9110 section 15.1: 200, 203, 204, 206, 300, 301, 308,
 * 404, 405, 410, 414 and 501 may be stored by a cache without explicit freshness information.
 * Every other code needs explicit caching headers (Cache-Control, Expires) to be cached.
 *
 * Non-standard codes are not in the registry. Their sources are the vendor documentation:
 * nginx: https://nginx.org/en/docs/http/ngx_http_core_module.html and
 *        https://nginx.org/en/docs/http/ngx_http_ssl_module.html#errors (444, 494 to 499)
 * Cloudflare: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/
 */

export type Status = 'unused' | 'deprecated' | 'obsolete' | 'temporary';

export interface HttpStatus {
	code: number;
	name: string;
	/** Citation: RFC and section, or vendor. */
	ref: string;
	meaning: string;
	cause: string;
	cacheable: boolean;
	/** Set for codes outside the IANA registry. */
	vendor?: 'nginx' | 'Cloudflare' | 'Other';
	status?: Status;
}

const r = (s: string) => `RFC 9110 §${s}`;

export const statuses: HttpStatus[] = [
	// 1xx Informational
	{
		code: 100,
		name: 'Continue',
		ref: r('15.2.1'),
		meaning: 'The request headers were accepted, the client should send the body.',
		cause: 'Client sent Expect: 100-continue before a large upload.',
		cacheable: false
	},
	{
		code: 101,
		name: 'Switching Protocols',
		ref: r('15.2.2'),
		meaning: 'The server switches to the protocol named in the Upgrade header.',
		cause: 'WebSocket handshake or h2c upgrade.',
		cacheable: false
	},
	{
		code: 102,
		name: 'Processing',
		ref: 'RFC 2518 (WebDAV)',
		meaning: 'Interim response: the server is still working on the request.',
		cause: 'Long-running WebDAV operation. Removed from RFC 4918, kept in the registry.',
		cacheable: false,
		status: 'deprecated'
	},
	{
		code: 103,
		name: 'Early Hints',
		ref: 'RFC 8297',
		meaning: 'Interim response carrying Link headers so the client can preload resources.',
		cause: 'Server or CDN sends preload hints while the final response is generated.',
		cacheable: false
	},
	{
		code: 104,
		name: 'Upload Resumption Supported',
		ref: 'draft-ietf-httpbis-resumable-upload (temporary registration)',
		meaning: 'Interim response telling the client that the upload can be resumed.',
		cause: 'Resumable upload protocol, still a draft.',
		cacheable: false,
		status: 'temporary'
	},
	// 2xx Successful
	{
		code: 200,
		name: 'OK',
		ref: r('15.3.1'),
		meaning: 'The request succeeded.',
		cause: 'Normal response.',
		cacheable: true
	},
	{
		code: 201,
		name: 'Created',
		ref: r('15.3.2'),
		meaning: 'A new resource was created, usually named in the Location header.',
		cause: 'Successful POST or PUT that created something.',
		cacheable: false
	},
	{
		code: 202,
		name: 'Accepted',
		ref: r('15.3.3'),
		meaning: 'Accepted for processing, but not finished.',
		cause: 'Queued or asynchronous job.',
		cacheable: false
	},
	{
		code: 203,
		name: 'Non-Authoritative Information',
		ref: r('15.3.4'),
		meaning: 'Success, but a transforming proxy changed the content.',
		cause: 'Intermediary rewrote the origin response.',
		cacheable: true
	},
	{
		code: 204,
		name: 'No Content',
		ref: r('15.3.5'),
		meaning: 'Success with no body.',
		cause: 'DELETE, PUT or a beacon endpoint with nothing to return.',
		cacheable: true
	},
	{
		code: 205,
		name: 'Reset Content',
		ref: r('15.3.6'),
		meaning: 'Success, the client should reset the form or view that sent the request.',
		cause: 'Rarely used form submission response.',
		cacheable: false
	},
	{
		code: 206,
		name: 'Partial Content',
		ref: r('15.3.7'),
		meaning: 'Only the requested byte ranges are sent.',
		cause: 'Range request: resumed download, video seeking.',
		cacheable: true
	},
	{
		code: 207,
		name: 'Multi-Status',
		ref: 'RFC 4918 §11.1',
		meaning: 'XML body with a separate status for each of several resources.',
		cause: 'WebDAV PROPFIND and similar batch operations.',
		cacheable: false
	},
	{
		code: 208,
		name: 'Already Reported',
		ref: 'RFC 5842 §7.1',
		meaning: 'Members of a binding were already listed earlier in the same Multi-Status.',
		cause: 'WebDAV binding extensions.',
		cacheable: false
	},
	{
		code: 226,
		name: 'IM Used',
		ref: 'RFC 3229 §10.4.1',
		meaning: 'The body is the result of instance manipulations (delta encoding) on the resource.',
		cause: 'Delta encoding with A-IM, rarely seen.',
		cacheable: false
	},
	// 3xx Redirection
	{
		code: 300,
		name: 'Multiple Choices',
		ref: r('15.4.1'),
		meaning: 'Several representations exist, the client may pick one.',
		cause: 'Content negotiation without a single best match. Rare.',
		cacheable: true
	},
	{
		code: 301,
		name: 'Moved Permanently',
		ref: r('15.4.2'),
		meaning: 'The resource has a new permanent URI in Location.',
		cause: 'Site moved, http to https, trailing slash rules. Clients may change POST to GET.',
		cacheable: true
	},
	{
		code: 302,
		name: 'Found',
		ref: r('15.4.3'),
		meaning: 'The resource is temporarily at the URI in Location.',
		cause: 'Login redirects and temporary moves. Clients may change POST to GET.',
		cacheable: false
	},
	{
		code: 303,
		name: 'See Other',
		ref: r('15.4.4'),
		meaning: 'Fetch the result from Location with GET.',
		cause: 'Post/Redirect/Get after a form submission.',
		cacheable: false
	},
	{
		code: 304,
		name: 'Not Modified',
		ref: r('15.4.5'),
		meaning: 'The cached copy is still valid, no body sent.',
		cause: 'Conditional GET with If-None-Match or If-Modified-Since that matched.',
		cacheable: false
	},
	{
		code: 305,
		name: 'Use Proxy',
		ref: r('15.4.6'),
		meaning: 'Deprecated. Was meant to tell the client to use a proxy.',
		cause: 'Not used by clients for security reasons.',
		cacheable: false,
		status: 'deprecated'
	},
	{
		code: 306,
		name: '(Unused)',
		ref: r('15.4.7'),
		meaning: 'Reserved. Was used in an earlier draft (Switch Proxy).',
		cause: 'Not sent.',
		cacheable: false,
		status: 'unused'
	},
	{
		code: 307,
		name: 'Temporary Redirect',
		ref: r('15.4.8'),
		meaning: 'Temporarily at Location. The method and body must not change.',
		cause: 'Temporary move that keeps POST as POST. Also HSTS internal redirects in browsers.',
		cacheable: false
	},
	{
		code: 308,
		name: 'Permanent Redirect',
		ref: r('15.4.9'),
		meaning: 'Permanently at Location. The method and body must not change.',
		cause: 'Permanent move of an API endpoint that receives POST.',
		cacheable: true
	},
	// 4xx Client error
	{
		code: 400,
		name: 'Bad Request',
		ref: r('15.5.1'),
		meaning: 'The server cannot process the request because it is malformed.',
		cause: 'Invalid syntax, bad JSON, oversized or broken headers or cookies.',
		cacheable: false
	},
	{
		code: 401,
		name: 'Unauthorized',
		ref: r('15.5.2'),
		meaning: 'Authentication is missing or failed. Must include WWW-Authenticate.',
		cause: 'No or expired token, wrong credentials.',
		cacheable: false
	},
	{
		code: 402,
		name: 'Payment Required',
		ref: r('15.5.3'),
		meaning: 'Reserved for future use.',
		cause: 'Some APIs use it for billing or quota problems.',
		cacheable: false
	},
	{
		code: 403,
		name: 'Forbidden',
		ref: r('15.5.4'),
		meaning: 'The server understood the request but refuses it.',
		cause: 'Authenticated but not permitted, WAF block, directory listing off, file permissions.',
		cacheable: false
	},
	{
		code: 404,
		name: 'Not Found',
		ref: r('15.5.5'),
		meaning: 'No current representation for the target resource, or the server will not say.',
		cause: 'Wrong URL, deleted page, routing error. Also used to hide a 403.',
		cacheable: true
	},
	{
		code: 405,
		name: 'Method Not Allowed',
		ref: r('15.5.6'),
		meaning: 'The method is not supported for this resource. Must include Allow.',
		cause: 'POST to a static file, DELETE on a read-only endpoint.',
		cacheable: true
	},
	{
		code: 406,
		name: 'Not Acceptable',
		ref: r('15.5.7'),
		meaning: 'No representation matches the Accept headers.',
		cause: 'Strict content negotiation, for example Accept: application/xml on a JSON API.',
		cacheable: false
	},
	{
		code: 407,
		name: 'Proxy Authentication Required',
		ref: r('15.5.8'),
		meaning: 'Like 401, but the proxy wants credentials (Proxy-Authenticate).',
		cause: 'Corporate proxy without credentials.',
		cacheable: false
	},
	{
		code: 408,
		name: 'Request Timeout',
		ref: r('15.5.9'),
		meaning: 'The server did not receive a complete request in time.',
		cause: 'Slow client or idle keep-alive connection being closed.',
		cacheable: false
	},
	{
		code: 409,
		name: 'Conflict',
		ref: r('15.5.10'),
		meaning: 'The request conflicts with the current state of the resource.',
		cause: 'Edit conflict, version mismatch, duplicate create.',
		cacheable: false
	},
	{
		code: 410,
		name: 'Gone',
		ref: r('15.5.11'),
		meaning: 'The resource is gone permanently and will not return.',
		cause: 'Deliberately removed content.',
		cacheable: true
	},
	{
		code: 411,
		name: 'Length Required',
		ref: r('15.5.12'),
		meaning: 'The server requires a Content-Length header.',
		cause: 'Chunked upload to a server that does not accept it.',
		cacheable: false
	},
	{
		code: 412,
		name: 'Precondition Failed',
		ref: r('15.5.13'),
		meaning: 'A conditional header (If-Match, If-Unmodified-Since) evaluated to false.',
		cause: 'Optimistic locking: the resource changed since the client read it.',
		cacheable: false
	},
	{
		code: 413,
		name: 'Content Too Large',
		ref: r('15.5.14'),
		meaning: 'The request body is larger than the server allows. Formerly Payload Too Large.',
		cause: 'Upload over the limit, for example nginx client_max_body_size.',
		cacheable: false
	},
	{
		code: 414,
		name: 'URI Too Long',
		ref: r('15.5.15'),
		meaning: 'The target URI is longer than the server will interpret.',
		cause: 'Huge query string, redirect loop that keeps appending parameters.',
		cacheable: true
	},
	{
		code: 415,
		name: 'Unsupported Media Type',
		ref: r('15.5.16'),
		meaning: 'The body format (Content-Type or Content-Encoding) is not supported.',
		cause: 'Missing or wrong Content-Type on a POST.',
		cacheable: false
	},
	{
		code: 416,
		name: 'Range Not Satisfiable',
		ref: r('15.5.17'),
		meaning: 'None of the requested ranges overlap the resource.',
		cause: 'Resuming a download past the end of a file that shrank.',
		cacheable: false
	},
	{
		code: 417,
		name: 'Expectation Failed',
		ref: r('15.5.18'),
		meaning: 'The Expect header cannot be met.',
		cause: 'Expect: 100-continue through a server or proxy that refuses it.',
		cacheable: false
	},
	{
		code: 418,
		name: '(Unused)',
		ref: r('15.5.19'),
		meaning: "Reserved. Known from the April Fools' RFC 2324 as I'm a teapot.",
		cause: 'Joke responses, some bot blockers. Not a real status.',
		cacheable: false,
		status: 'unused'
	},
	{
		code: 421,
		name: 'Misdirected Request',
		ref: r('15.5.20'),
		meaning: 'The request reached a server that cannot answer for this origin.',
		cause: 'HTTP/2 connection reuse across hosts with a shared certificate, SNI mismatch.',
		cacheable: false
	},
	{
		code: 422,
		name: 'Unprocessable Content',
		ref: r('15.5.21'),
		meaning: 'Well-formed request, but the content fails semantic validation.',
		cause: 'API validation errors. Formerly Unprocessable Entity (WebDAV).',
		cacheable: false
	},
	{
		code: 423,
		name: 'Locked',
		ref: 'RFC 4918 §11.3',
		meaning: 'The resource is locked.',
		cause: 'WebDAV lock held by another client.',
		cacheable: false
	},
	{
		code: 424,
		name: 'Failed Dependency',
		ref: 'RFC 4918 §11.4',
		meaning: 'The action failed because another action it depended on failed.',
		cause: 'WebDAV batch where an earlier step failed.',
		cacheable: false
	},
	{
		code: 425,
		name: 'Too Early',
		ref: 'RFC 8470 §5.2',
		meaning: 'The server will not process a request that might be replayed.',
		cause: 'TLS 1.3 early data (0-RTT) with a non-idempotent request.',
		cacheable: false
	},
	{
		code: 426,
		name: 'Upgrade Required',
		ref: r('15.5.22'),
		meaning: 'The client must switch to another protocol, named in Upgrade.',
		cause: 'Endpoint only speaks a newer protocol version.',
		cacheable: false
	},
	{
		code: 428,
		name: 'Precondition Required',
		ref: 'RFC 6585 §3',
		meaning: 'The server requires a conditional request.',
		cause: 'API demands If-Match to prevent lost updates.',
		cacheable: false
	},
	{
		code: 429,
		name: 'Too Many Requests',
		ref: 'RFC 6585 §4',
		meaning: 'Rate limit exceeded. May include Retry-After.',
		cause: 'Too many calls in a time window, scraping, retry storms.',
		cacheable: false
	},
	{
		code: 431,
		name: 'Request Header Fields Too Large',
		ref: 'RFC 6585 §5',
		meaning: 'One header or all headers together are too large.',
		cause: 'Too many or too large cookies, very long Referer or Authorization.',
		cacheable: false
	},
	{
		code: 451,
		name: 'Unavailable For Legal Reasons',
		ref: 'RFC 7725 §3',
		meaning: 'Access denied because of a legal demand.',
		cause: 'Court order, sanctions or geoblocking for legal reasons.',
		cacheable: false
	},
	// 5xx Server error
	{
		code: 500,
		name: 'Internal Server Error',
		ref: r('15.6.1'),
		meaning: 'The server hit an unexpected condition.',
		cause: 'Unhandled exception, misconfiguration, broken deploy.',
		cacheable: false
	},
	{
		code: 501,
		name: 'Not Implemented',
		ref: r('15.6.2'),
		meaning: 'The server does not support the functionality needed, such as the method.',
		cause: 'Unknown method like PATCH on an old server.',
		cacheable: true
	},
	{
		code: 502,
		name: 'Bad Gateway',
		ref: r('15.6.3'),
		meaning: 'A gateway or proxy got an invalid response from the upstream server.',
		cause: 'Upstream crashed, closed the connection or sent garbage. App server down behind nginx.',
		cacheable: false
	},
	{
		code: 503,
		name: 'Service Unavailable',
		ref: r('15.6.4'),
		meaning: 'Temporarily unable to handle the request. May include Retry-After.',
		cause: 'Overload, maintenance, no healthy backends.',
		cacheable: false
	},
	{
		code: 504,
		name: 'Gateway Timeout',
		ref: r('15.6.5'),
		meaning: 'A gateway or proxy did not get a response from upstream in time.',
		cause: 'Slow backend query, proxy_read_timeout reached.',
		cacheable: false
	},
	{
		code: 505,
		name: 'HTTP Version Not Supported',
		ref: r('15.6.6'),
		meaning: 'The major HTTP version of the request is not supported.',
		cause: 'Malformed request line or very old server.',
		cacheable: false
	},
	{
		code: 506,
		name: 'Variant Also Negotiates',
		ref: 'RFC 2295 §8.1',
		meaning: 'Transparent content negotiation configuration error: circular reference.',
		cause: 'Misconfigured content negotiation. Rare.',
		cacheable: false
	},
	{
		code: 507,
		name: 'Insufficient Storage',
		ref: 'RFC 4918 §11.5',
		meaning: 'The server cannot store what is needed to complete the request.',
		cause: 'WebDAV upload to a full disk or quota.',
		cacheable: false
	},
	{
		code: 508,
		name: 'Loop Detected',
		ref: 'RFC 5842 §7.2',
		meaning: 'An infinite loop was found while processing the request.',
		cause: 'WebDAV binding loop with Depth: infinity.',
		cacheable: false
	},
	{
		code: 510,
		name: 'Not Extended (obsoleted)',
		ref: 'RFC 2774 §7, status changed to Historic',
		meaning: 'Further extensions to the request are required.',
		cause: 'HTTP Extension Framework, never widely used.',
		cacheable: false,
		status: 'obsolete'
	},
	{
		code: 511,
		name: 'Network Authentication Required',
		ref: 'RFC 6585 §6',
		meaning: 'The client must authenticate to gain network access.',
		cause: 'Captive portal on hotel or airport Wi-Fi.',
		cacheable: false
	},

	// Non-standard codes, not in the IANA registry.
	{
		code: 444,
		name: 'No Response',
		ref: 'nginx',
		meaning: 'nginx closes the connection without sending anything. The client never sees 444.',
		cause: 'return 444 in nginx config, used to drop unwanted or malicious requests.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 494,
		name: 'Request Header Too Large',
		ref: 'nginx',
		meaning: 'nginx-internal code for headers over large_client_header_buffers.',
		cause: 'Oversized cookies or headers. Shown in logs, sent as 400.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 495,
		name: 'SSL Certificate Error',
		ref: 'nginx',
		meaning: 'The client certificate failed verification.',
		cause: 'mTLS with ssl_verify_client and an invalid certificate. Sent as 400.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 496,
		name: 'SSL Certificate Required',
		ref: 'nginx',
		meaning: 'A client certificate was required but none was sent.',
		cause: 'mTLS without a client certificate. Sent as 400.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 497,
		name: 'HTTP Request Sent to HTTPS Port',
		ref: 'nginx',
		meaning: 'A plain HTTP request arrived on a TLS port.',
		cause: 'http:// URL with the https port. Sent as 400.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 499,
		name: 'Client Closed Request',
		ref: 'nginx',
		meaning: 'The client closed the connection before nginx answered. Logged only.',
		cause:
			'User navigated away, client timeout shorter than the backend time, health check gave up.',
		cacheable: false,
		vendor: 'nginx'
	},
	{
		code: 520,
		name: 'Web Server Returned an Unknown Error',
		ref: 'Cloudflare',
		meaning: 'The origin returned an empty, unknown or unexpected response.',
		cause: 'Origin crashed, reset the connection, or sent headers that are too large.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 521,
		name: 'Web Server Is Down',
		ref: 'Cloudflare',
		meaning: 'The origin refused the connection.',
		cause: 'Origin web server stopped, or a firewall blocks Cloudflare IP ranges.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 522,
		name: 'Connection Timed Out',
		ref: 'Cloudflare',
		meaning: 'The TCP connection to the origin timed out.',
		cause: 'Origin overloaded, unreachable, or packets dropped by a firewall.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 523,
		name: 'Origin Is Unreachable',
		ref: 'Cloudflare',
		meaning: 'Cloudflare could not reach the origin at all.',
		cause: 'Wrong DNS record for the origin, routing problem.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 524,
		name: 'A Timeout Occurred',
		ref: 'Cloudflare',
		meaning: 'The connection was made but the origin did not answer in time (100 s by default).',
		cause: 'Long-running request on the origin.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 525,
		name: 'SSL Handshake Failed',
		ref: 'Cloudflare',
		meaning: 'The TLS handshake between Cloudflare and the origin failed.',
		cause: 'Origin has no certificate, no matching cipher, or SNI is not supported.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 526,
		name: 'Invalid SSL Certificate',
		ref: 'Cloudflare',
		meaning: 'The origin certificate could not be validated (Full strict mode).',
		cause: 'Expired, self-signed or wrong hostname certificate on the origin.',
		cacheable: false,
		vendor: 'Cloudflare'
	},
	{
		code: 530,
		name: 'Origin DNS or access error',
		ref: 'Cloudflare',
		meaning: 'Returned together with a Cloudflare 1xxx error, which names the actual problem.',
		cause: 'Look up the 1xxx error shown on the page, often an origin DNS error.',
		cacheable: false,
		vendor: 'Cloudflare'
	}
];

export const classes: Record<number, { name: string; text: string }> = {
	1: { name: 'Informational', text: 'Interim response, the request continues.' },
	2: { name: 'Successful', text: 'The request was received, understood and accepted.' },
	3: { name: 'Redirection', text: 'Further action is needed to complete the request.' },
	4: { name: 'Client error', text: 'The request is wrong or cannot be fulfilled.' },
	5: { name: 'Server error', text: 'The server failed to fulfil a valid request.' }
};
