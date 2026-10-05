/*
 * Core grok patterns, transcribed from the legacy (non-ECS) pattern files of
 * logstash-patterns-core (https://github.com/logstash-plugins/logstash-patterns-core,
 * patterns/legacy/grok-patterns and patterns/legacy/httpd). Only patterns we could transcribe
 * with confidence are included. Differences from upstream:
 * - IPV6 is a simplified pattern written here; the upstream one is a long exact alternation.
 * - MONTH is the English-only form (newer upstream versions also accept German spellings).
 * The regex dialect is Oniguruma; atomic groups (?>...) are emulated when compiling for JavaScript.
 */

export interface PatternDef {
	name: string;
	regex: string;
	group: string;
	note?: string;
}

const H = '[0-9A-Fa-f]{1,4}';

/** Simplified IPv6: full form, :: compression, embedded IPv4, optional zone. Not exhaustive. */
const IPV6_SIMPLE =
	`(?:(?:${H}:){7}${H}` +
	`|(?:${H}:){6}%{IPV4}` +
	`|(?:(?:${H}:){0,5}${H})?::(?:${H}:){0,4}%{IPV4}` +
	`|(?:${H}:){1,6}:(?:${H}:){0,5}${H}` +
	`|(?:${H}:){1,7}:` +
	`|::(?:${H}:){0,6}${H}` +
	`|::)(?:%[0-9A-Za-z._~-]+)?`;

export const CORE: PatternDef[] = [
	{ group: 'Basic', name: 'USERNAME', regex: '[a-zA-Z0-9._-]+' },
	{ group: 'Basic', name: 'USER', regex: '%{USERNAME}' },
	{ group: 'Basic', name: 'EMAILLOCALPART', regex: '[a-zA-Z][a-zA-Z0-9_.+-=:]+' },
	{ group: 'Basic', name: 'EMAILADDRESS', regex: '%{EMAILLOCALPART}@%{HOSTNAME}' },
	{ group: 'Basic', name: 'INT', regex: '(?:[+-]?(?:[0-9]+))' },
	{
		group: 'Basic',
		name: 'BASE10NUM',
		regex: '(?<![0-9.+-])(?>[+-]?(?:(?:[0-9]+(?:\\.[0-9]+)?)|(?:\\.[0-9]+)))'
	},
	{ group: 'Basic', name: 'NUMBER', regex: '(?:%{BASE10NUM})' },
	{ group: 'Basic', name: 'BASE16NUM', regex: '(?<![0-9A-Fa-f])(?:[+-]?(?:0x)?(?:[0-9A-Fa-f]+))' },
	{
		group: 'Basic',
		name: 'BASE16FLOAT',
		regex:
			'\\b(?<![0-9A-Fa-f.])(?:[+-]?(?:0x)?(?:(?:[0-9A-Fa-f]+(?:\\.[0-9A-Fa-f]*)?)|(?:\\.[0-9A-Fa-f]+)))\\b'
	},
	{ group: 'Basic', name: 'POSINT', regex: '\\b(?:[1-9][0-9]*)\\b' },
	{ group: 'Basic', name: 'NONNEGINT', regex: '\\b(?:[0-9]+)\\b' },
	{ group: 'Basic', name: 'WORD', regex: '\\b\\w+\\b' },
	{ group: 'Basic', name: 'NOTSPACE', regex: '\\S+' },
	{ group: 'Basic', name: 'SPACE', regex: '\\s*' },
	{ group: 'Basic', name: 'DATA', regex: '.*?' },
	{ group: 'Basic', name: 'GREEDYDATA', regex: '.*' },
	{
		group: 'Basic',
		name: 'QUOTEDSTRING',
		regex:
			'(?>(?<!\\\\)(?>"(?>\\\\.|[^\\\\"]+)+"|""|(?>\'(?>\\\\.|[^\\\\\']+)+\')|\'\'|(?>`(?>\\\\.|[^\\\\`]+)+`)|``))'
	},
	{ group: 'Basic', name: 'QS', regex: '%{QUOTEDSTRING}' },
	{ group: 'Basic', name: 'UUID', regex: '[A-Fa-f0-9]{8}-(?:[A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}' },

	{ group: 'Network', name: 'MAC', regex: '(?:%{CISCOMAC}|%{WINDOWSMAC}|%{COMMONMAC})' },
	{ group: 'Network', name: 'CISCOMAC', regex: '(?:(?:[A-Fa-f0-9]{4}\\.){2}[A-Fa-f0-9]{4})' },
	{ group: 'Network', name: 'WINDOWSMAC', regex: '(?:(?:[A-Fa-f0-9]{2}-){5}[A-Fa-f0-9]{2})' },
	{ group: 'Network', name: 'COMMONMAC', regex: '(?:(?:[A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2})' },
	{
		group: 'Network',
		name: 'IPV6',
		regex: IPV6_SIMPLE,
		note: 'Simplified here: accepts the usual forms but also some malformed ones. Upstream uses an exact, much longer pattern'
	},
	{
		group: 'Network',
		name: 'IPV4',
		regex:
			'(?<![0-9])(?:(?:[0-1]?[0-9]{1,2}|2[0-4][0-9]|25[0-5])[.](?:[0-1]?[0-9]{1,2}|2[0-4][0-9]|25[0-5])[.](?:[0-1]?[0-9]{1,2}|2[0-4][0-9]|25[0-5])[.](?:[0-1]?[0-9]{1,2}|2[0-4][0-9]|25[0-5]))(?![0-9])'
	},
	{ group: 'Network', name: 'IP', regex: '(?:%{IPV6}|%{IPV4})' },
	{
		group: 'Network',
		name: 'HOSTNAME',
		regex: '\\b(?:[0-9A-Za-z][0-9A-Za-z-]{0,62})(?:\\.(?:[0-9A-Za-z][0-9A-Za-z-]{0,62}))*(\\.?|\\b)'
	},
	{ group: 'Network', name: 'IPORHOST', regex: '(?:%{IP}|%{HOSTNAME})' },
	{ group: 'Network', name: 'HOSTPORT', regex: '%{IPORHOST}:%{POSINT}' },

	{ group: 'Paths and URIs', name: 'PATH', regex: '(?:%{UNIXPATH}|%{WINPATH})' },
	{ group: 'Paths and URIs', name: 'UNIXPATH', regex: '(/([\\w_%!$@:.,+~-]+|\\\\.)*)+' },
	{ group: 'Paths and URIs', name: 'TTY', regex: '(?:/dev/(pts|tty([pq])?)(\\w+)?/?(?:[0-9]+))' },
	{ group: 'Paths and URIs', name: 'WINPATH', regex: '(?>[A-Za-z]+:|\\\\)(?:\\\\[^\\\\?*]*)+' },
	{ group: 'Paths and URIs', name: 'URIPROTO', regex: '[A-Za-z]([A-Za-z0-9+\\-.]+)+' },
	{ group: 'Paths and URIs', name: 'URIHOST', regex: '%{IPORHOST}(?::%{POSINT:port})?' },
	{
		group: 'Paths and URIs',
		name: 'URIPATH',
		regex: "(?:/[A-Za-z0-9$.+!*'(){},~:;=@#%&_\\-]*)+"
	},
	{
		group: 'Paths and URIs',
		name: 'URIPARAM',
		regex: "\\?[A-Za-z0-9$.+!*'|(){},~@#%&/=:;_?\\-\\[\\]<>]*"
	},
	{ group: 'Paths and URIs', name: 'URIPATHPARAM', regex: '%{URIPATH}(?:%{URIPARAM})?' },
	{
		group: 'Paths and URIs',
		name: 'URI',
		regex: '%{URIPROTO}://(?:%{USER}(?::[^@]*)?@)?(?:%{URIHOST})?(?:%{URIPATHPARAM})?'
	},

	{
		group: 'Dates and times',
		name: 'MONTH',
		regex:
			'\\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\b',
		note: 'English month names; newer upstream versions also accept German spellings'
	},
	{ group: 'Dates and times', name: 'MONTHNUM', regex: '(?:0?[1-9]|1[0-2])' },
	{ group: 'Dates and times', name: 'MONTHNUM2', regex: '(?:0[1-9]|1[0-2])' },
	{
		group: 'Dates and times',
		name: 'MONTHDAY',
		regex: '(?:(?:0[1-9])|(?:[12][0-9])|(?:3[01])|[1-9])'
	},
	{
		group: 'Dates and times',
		name: 'DAY',
		regex:
			'(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)'
	},
	{ group: 'Dates and times', name: 'YEAR', regex: '(?>\\d\\d){1,2}' },
	{ group: 'Dates and times', name: 'HOUR', regex: '(?:2[0123]|[01]?[0-9])' },
	{ group: 'Dates and times', name: 'MINUTE', regex: '(?:[0-5][0-9])' },
	{ group: 'Dates and times', name: 'SECOND', regex: '(?:(?:[0-5]?[0-9]|60)(?:[:.,][0-9]+)?)' },
	{
		group: 'Dates and times',
		name: 'TIME',
		regex: '(?!<[0-9])%{HOUR}:%{MINUTE}(?::%{SECOND})(?![0-9])'
	},
	{ group: 'Dates and times', name: 'DATE_US', regex: '%{MONTHNUM}[/-]%{MONTHDAY}[/-]%{YEAR}' },
	{ group: 'Dates and times', name: 'DATE_EU', regex: '%{MONTHDAY}[./-]%{MONTHNUM}[./-]%{YEAR}' },
	{ group: 'Dates and times', name: 'ISO8601_TIMEZONE', regex: '(?:Z|[+-]%{HOUR}(?::?%{MINUTE}))' },
	{ group: 'Dates and times', name: 'ISO8601_SECOND', regex: '(?:%{SECOND}|60)' },
	{
		group: 'Dates and times',
		name: 'TIMESTAMP_ISO8601',
		regex:
			'%{YEAR}-%{MONTHNUM}-%{MONTHDAY}[T ]%{HOUR}:?%{MINUTE}(?::?%{SECOND})?%{ISO8601_TIMEZONE}?'
	},
	{ group: 'Dates and times', name: 'DATE', regex: '%{DATE_US}|%{DATE_EU}' },
	{ group: 'Dates and times', name: 'DATESTAMP', regex: '%{DATE}[- ]%{TIME}' },
	{ group: 'Dates and times', name: 'TZ', regex: '(?:[APMCE][SD]T|UTC)' },
	{
		group: 'Dates and times',
		name: 'DATESTAMP_RFC822',
		regex: '%{DAY} %{MONTH} %{MONTHDAY} %{YEAR} %{TIME} %{TZ}'
	},
	{
		group: 'Dates and times',
		name: 'DATESTAMP_RFC2822',
		regex: '%{DAY}, %{MONTHDAY} %{MONTH} %{YEAR} %{TIME} %{ISO8601_TIMEZONE}'
	},
	{
		group: 'Dates and times',
		name: 'DATESTAMP_OTHER',
		regex: '%{DAY} %{MONTH} %{MONTHDAY} %{TIME} %{TZ} %{YEAR}'
	},
	{
		group: 'Dates and times',
		name: 'DATESTAMP_EVENTLOG',
		regex: '%{YEAR}%{MONTHNUM2}%{MONTHDAY}%{HOUR}%{MINUTE}%{SECOND}'
	},
	{
		group: 'Dates and times',
		name: 'HTTPDATE',
		regex: '%{MONTHDAY}/%{MONTH}/%{YEAR}:%{TIME} %{INT}'
	},

	{ group: 'Syslog', name: 'SYSLOGTIMESTAMP', regex: '%{MONTH} +%{MONTHDAY} %{TIME}' },
	{ group: 'Syslog', name: 'PROG', regex: '[\\x21-\\x5a\\x5c\\x5e-\\x7e]+' },
	{ group: 'Syslog', name: 'SYSLOGPROG', regex: '%{PROG:program}(?:\\[%{POSINT:pid}\\])?' },
	{ group: 'Syslog', name: 'SYSLOGHOST', regex: '%{IPORHOST}' },
	{
		group: 'Syslog',
		name: 'SYSLOGFACILITY',
		regex: '<%{NONNEGINT:facility}.%{NONNEGINT:priority}>'
	},
	{
		group: 'Syslog',
		name: 'SYSLOGBASE',
		regex:
			'%{SYSLOGTIMESTAMP:timestamp} (?:%{SYSLOGFACILITY} )?%{SYSLOGHOST:logsource} %{SYSLOGPROG}:'
	},
	{
		group: 'Syslog',
		name: 'LOGLEVEL',
		regex:
			'([Aa]lert|ALERT|[Tt]race|TRACE|[Dd]ebug|DEBUG|[Nn]otice|NOTICE|[Ii]nfo|INFO|[Ww]arn?(?:ing)?|WARN?(?:ING)?|[Ee]rr?(?:or)?|ERR?(?:OR)?|[Cc]rit?(?:ical)?|CRIT?(?:ICAL)?|[Ff]atal|FATAL|[Ss]evere|SEVERE|EMERG(?:ENCY)?|[Ee]merg(?:ency)?)'
	},

	{ group: 'Web servers', name: 'HTTPDUSER', regex: '%{EMAILADDRESS}|%{USER}' },
	{
		group: 'Web servers',
		name: 'HTTPDERROR_DATE',
		regex: '%{DAY} %{MONTH} %{MONTHDAY} %{TIME} %{YEAR}'
	},
	{
		group: 'Web servers',
		name: 'HTTPD_COMMONLOG',
		regex:
			'%{IPORHOST:clientip} %{HTTPDUSER:ident} %{HTTPDUSER:auth} \\[%{HTTPDATE:timestamp}\\] "(?:%{WORD:verb} %{NOTSPACE:request}(?: HTTP/%{NUMBER:httpversion})?|%{DATA:rawrequest})" (?:-|%{NUMBER:response}) (?:-|%{NUMBER:bytes})'
	},
	{
		group: 'Web servers',
		name: 'HTTPD_COMBINEDLOG',
		regex: '%{HTTPD_COMMONLOG} %{QS:referrer} %{QS:agent}'
	},
	{ group: 'Web servers', name: 'COMMONAPACHELOG', regex: '%{HTTPD_COMMONLOG}' },
	{ group: 'Web servers', name: 'COMBINEDAPACHELOG', regex: '%{HTTPD_COMBINEDLOG}' }
];

export const CORE_MAP: Record<string, string> = Object.fromEntries(
	CORE.map((p) => [p.name, p.regex])
);
