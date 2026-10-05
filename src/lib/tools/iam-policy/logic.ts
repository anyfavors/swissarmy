/*
 * AWS IAM policy and Azure RBAC role definition explainer.
 * AWS: IAM JSON policy element reference,
 *   https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html
 *   condition operators: .../reference_policies_elements_condition_operators.html
 *   evaluation logic: .../reference_policies_evaluation-logic.html
 * Azure: https://learn.microsoft.com/azure/role-based-access-control/role-definitions
 */
import { parseJson } from '../json/logic';

type J = null | boolean | number | string | J[] | { [k: string]: J };
const isObj = (v: unknown): v is { [k: string]: J } =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function readJson(text: string): J {
	try {
		return JSON.parse(text) as J;
	} catch {
		// The JSON tool's parser gives a message with line and column.
		parseJson(text);
		throw new Error('Not valid JSON');
	}
}

/* ---------- wildcards ---------- */

/** Glob with * (any run of characters) and ? (one character) to a RegExp. */
export function globToRegex(p: string, ignoreCase: boolean): RegExp {
	const src = p
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${src}$`, ignoreCase ? 'is' : 's');
}

export function globMatch(pattern: string, value: string, ignoreCase = false): boolean {
	return globToRegex(pattern, ignoreCase).test(value);
}

/** Describes an action pattern in words without listing actions. */
export function describeAction(a: string): string {
	if (a === '*') return 'every action in every service';
	const m = /^([^:]+):(.*)$/.exec(a);
	if (!m) return `"${a}" is not service:action, it will match nothing`;
	const [, svc, act] = m;
	if (act === '*') return `every ${svc} action`;
	if (!/[*?]/.test(act)) return `${svc} ${act}`;
	const star = act.indexOf('*');
	if (!act.includes('?') && star === act.length - 1)
		return `every ${svc} action starting with ${act.slice(0, -1)}`;
	if (!act.includes('?') && star === 0 && act.lastIndexOf('*') === 0)
		return `every ${svc} action ending with ${act.slice(1)}`;
	return `every ${svc} action matching ${act} (* any run of characters, ? one character)`;
}

/** Describes a resource ARN pattern. */
export function describeResource(r: string): string {
	if (r === '*') return 'every resource';
	const f = r.split(':');
	if (f[0] !== 'arn' || f.length < 6) return `${r} (not an ARN)`;
	const [, partition, service, region, account] = f;
	const res = f.slice(5).join(':');
	const parts = [`${service || 'any service'} resource "${res}"`];
	if (account) parts.push(account === '*' ? 'in any account' : `in account ${account}`);
	if (region) parts.push(region === '*' ? 'in any region' : `in ${region}`);
	if (partition !== 'aws') parts.push(`partition ${partition}`);
	if (res.includes('*') || res.includes('?')) parts.push('(wildcard)');
	return parts.join(' ');
}

/* ---------- AWS principals ---------- */

export function describePrincipal(p: J): string[] {
	if (p === '*') return ['Anyone, including anonymous callers'];
	if (!isObj(p)) return [`Unreadable principal ${JSON.stringify(p)}`];
	const out: string[] = [];
	for (const [kind, v] of Object.entries(p)) {
		for (const x of asList(v)) {
			if (kind === 'AWS') {
				if (x === '*') out.push('Any AWS principal in any account (and anonymous for S3)');
				else if (/^\d{12}$/.test(x) || /^arn:[^:]+:iam::\d{12}:root$/.test(x))
					out.push(
						`Account ${x.match(/\d{12}/)![0]}: any principal there that its own IAM policies allow`
					);
				else if (/:role\//.test(x)) out.push(`Role ${x}`);
				else if (/:user\//.test(x)) out.push(`User ${x}`);
				else if (/:assumed-role\//.test(x)) out.push(`Role session ${x}`);
				else out.push(`AWS principal ${x}`);
			} else if (kind === 'Service') out.push(`AWS service ${x}`);
			else if (kind === 'Federated') out.push(`Federated identity provider ${x}`);
			else if (kind === 'CanonicalUser') out.push(`S3 canonical user ${x}`);
			else out.push(`${kind} ${x}`);
		}
	}
	return out;
}

function asList(v: J | undefined): string[] {
	if (v === undefined || v === null) return [];
	if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
	return [typeof v === 'string' ? v : JSON.stringify(v)];
}

const isPublic = (p: J | undefined) => p === '*' || (isObj(p) && asList(p.AWS).includes('*'));

/* ---------- conditions ---------- */

const OPERATORS: Record<string, string> = {
	StringEquals: 'equals, case-sensitive',
	StringNotEquals: 'does not equal, case-sensitive',
	StringEqualsIgnoreCase: 'equals, ignoring case',
	StringNotEqualsIgnoreCase: 'does not equal, ignoring case',
	StringLike: 'matches the pattern (* and ? wildcards), case-sensitive',
	StringNotLike: 'does not match the pattern (* and ? wildcards)',
	NumericEquals: 'is numerically equal to',
	NumericNotEquals: 'is numerically not equal to',
	NumericLessThan: 'is less than',
	NumericLessThanEquals: 'is less than or equal to',
	NumericGreaterThan: 'is greater than',
	NumericGreaterThanEquals: 'is greater than or equal to',
	DateEquals: 'is the date',
	DateNotEquals: 'is not the date',
	DateLessThan: 'is before',
	DateLessThanEquals: 'is at or before',
	DateGreaterThan: 'is after',
	DateGreaterThanEquals: 'is at or after',
	Bool: 'is the boolean',
	BinaryEquals: 'equals the base64 value',
	IpAddress: 'is in the IP range',
	NotIpAddress: 'is not in the IP range',
	ArnEquals: 'equals the ARN',
	ArnLike: 'matches the ARN pattern',
	ArnNotEquals: 'does not equal the ARN',
	ArnNotLike: 'does not match the ARN pattern',
	Null: 'is absent (true) or present (false)'
};

/** Negated operators: with several values, the key must match none of them. */
const NEGATED = new Set([
	'StringNotEquals',
	'StringNotEqualsIgnoreCase',
	'StringNotLike',
	'NumericNotEquals',
	'DateNotEquals',
	'NotIpAddress',
	'ArnNotEquals',
	'ArnNotLike'
]);

/** Well-known global and service condition keys. */
const KEYS: Record<string, string> = {
	'aws:sourceip': 'the caller public IP address (not set for requests through a VPC endpoint)',
	'aws:sourcevpc': 'the VPC the request came through (VPC endpoint)',
	'aws:sourcevpce': 'the VPC endpoint the request came through',
	'aws:securetransport': 'whether the request used TLS',
	'aws:multifactorauthpresent': 'whether the credentials were obtained with MFA',
	'aws:multifactorauthage': 'seconds since MFA authentication',
	'aws:principalorgid': 'the AWS Organizations ID of the caller account',
	'aws:principalorgpaths': 'the Organizations path of the caller account',
	'aws:principalaccount': 'the account of the caller',
	'aws:principalarn': 'the ARN of the calling principal',
	'aws:principaltype': 'the kind of caller (User, AssumedRole, Account...)',
	'aws:sourcearn': 'the ARN of the resource that made a service-to-service request',
	'aws:sourceaccount': 'the account of the resource that made a service-to-service request',
	'aws:requestedregion': 'the region the request is sent to',
	'aws:currenttime': 'the time of the request',
	'aws:epochtime': 'the time of the request in epoch seconds',
	'aws:userid': 'the unique ID of the caller',
	'aws:username': 'the IAM user name of the caller',
	'aws:calledvia': 'the services that made the request on the caller behalf',
	'aws:viaawsservice': 'whether an AWS service made the request on the caller behalf',
	'aws:tagkeys': 'the tag keys in the request',
	'aws:resourceorgid': 'the Organizations ID of the account that owns the resource',
	'aws:resourceaccount': 'the account that owns the resource',
	's3:prefix': 'the key prefix in an S3 list request',
	's3:x-amz-acl': 'the canned ACL in the request',
	's3:x-amz-server-side-encryption': 'the server-side encryption header',
	'iam:passedtoservice': 'the service a role is passed to',
	'kms:viaservice': 'the AWS service that called KMS on the caller behalf',
	'sts:externalid': 'the external ID supplied when assuming the role'
};

function keyMeaning(key: string): string {
	const k = key.toLowerCase();
	if (KEYS[k]) return KEYS[k];
	if (k.startsWith('aws:principaltag/')) return `the caller tag ${key.slice(17)}`;
	if (k.startsWith('aws:resourcetag/')) return `the resource tag ${key.slice(16)}`;
	if (k.startsWith('aws:requesttag/')) return `the tag ${key.slice(15)} in the request`;
	return '';
}

export interface CondLine {
	operator: string;
	key: string;
	values: string[];
	text: string;
	unknown?: boolean;
}

export function explainCondition(c: J): CondLine[] {
	if (!isObj(c)) return [];
	const out: CondLine[] = [];
	for (const [rawOp, block] of Object.entries(c)) {
		let op = rawOp;
		let set = '';
		const sm = /^(ForAllValues|ForAnyValue):(.+)$/.exec(op);
		if (sm) {
			set = sm[1];
			op = sm[2];
		}
		const ifExists = op.endsWith('IfExists');
		const base = ifExists ? op.slice(0, -8) : op;
		const meaning = OPERATORS[base];
		if (!isObj(block)) continue;
		for (const [key, v] of Object.entries(block)) {
			const values = asList(v);
			const km = keyMeaning(key);
			const subject = km ? `${key} (${km})` : key;
			let text: string;
			if (!meaning) text = `${subject}: unknown operator ${rawOp}`;
			else {
				const vals =
					values.length > 1
						? NEGATED.has(base)
							? `none of ${values.join(', ')}`
							: `any of ${values.join(', ')}`
						: (values[0] ?? '');
				text = `${subject} ${meaning} ${vals}`;
				if (set === 'ForAllValues')
					text = `Every value of ${text}. Also true when the key is missing or empty`;
				if (set === 'ForAnyValue') text = `At least one value of ${text}`;
				if (ifExists) text += '. Ignored when the key is not in the request';
			}
			out.push({ operator: rawOp, key, values, text, unknown: !meaning });
		}
	}
	return out;
}

/* ---------- AWS statements ---------- */

export interface Finding {
	level: 'high' | 'medium' | 'info';
	text: string;
}

export interface Statement {
	index: number;
	sid?: string;
	effect: 'Allow' | 'Deny' | string;
	principal?: J;
	notPrincipal?: J;
	actions: string[];
	notActions: string[];
	resources: string[];
	notResources: string[];
	condition?: J;
	lines: string[];
	conditions: CondLine[];
	findings: Finding[];
}

export interface AwsPolicy {
	kind: 'aws';
	version?: string;
	statements: Statement[];
	findings: Finding[];
}

const matchesAny = (patterns: string[], value: string, ic: boolean) =>
	patterns.some((p) => globMatch(p, value, ic));

function explainStatement(s: J, index: number): Statement {
	if (!isObj(s)) throw new Error(`Statement ${index + 1} is not an object`);
	const st: Statement = {
		index,
		sid: typeof s.Sid === 'string' ? s.Sid : undefined,
		effect: typeof s.Effect === 'string' ? s.Effect : '',
		principal: s.Principal,
		notPrincipal: s.NotPrincipal,
		actions: asList(s.Action),
		notActions: asList(s.NotAction),
		resources: asList(s.Resource),
		notResources: asList(s.NotResource),
		condition: s.Condition,
		lines: [],
		conditions: explainCondition(s.Condition ?? null),
		findings: []
	};
	const f = st.findings;
	const allow = st.effect === 'Allow';
	if (st.effect !== 'Allow' && st.effect !== 'Deny')
		f.push({
			level: 'high',
			text: `Effect must be Allow or Deny, got ${JSON.stringify(s.Effect)}`
		});
	if (!st.actions.length && !st.notActions.length)
		f.push({ level: 'high', text: 'No Action or NotAction: the statement is invalid' });
	if (st.actions.length && st.notActions.length)
		f.push({ level: 'high', text: 'Action and NotAction cannot both be set' });
	if (st.resources.length && st.notResources.length)
		f.push({ level: 'high', text: 'Resource and NotResource cannot both be set' });
	for (const k of Object.keys(s))
		if (
			![
				'Sid',
				'Effect',
				'Principal',
				'NotPrincipal',
				'Action',
				'NotAction',
				'Resource',
				'NotResource',
				'Condition'
			].includes(k)
		)
			f.push({ level: 'high', text: `Unknown element ${k} (element names are case-sensitive)` });

	// Plain-language lines.
	const verb = allow ? 'Allows' : st.effect === 'Deny' ? 'Denies' : 'Applies to';
	if (st.principal !== undefined)
		st.lines.push(`Who: ${describePrincipal(st.principal).join('; ')}`);
	if (st.notPrincipal !== undefined)
		st.lines.push(`Who: everyone except ${describePrincipal(st.notPrincipal).join('; ')}`);
	if (st.actions.length) st.lines.push(`${verb}: ${st.actions.map(describeAction).join('; ')}`);
	if (st.notActions.length)
		st.lines.push(`${verb} every action except: ${st.notActions.map(describeAction).join('; ')}`);
	if (st.resources.length) st.lines.push(`On: ${st.resources.map(describeResource).join('; ')}`);
	if (st.notResources.length)
		st.lines.push(`On every resource except: ${st.notResources.map(describeResource).join('; ')}`);
	if (!st.resources.length && !st.notResources.length)
		st.lines.push('On: the resource this policy is attached to (resource-based policy)');
	if (st.conditions.length)
		st.lines.push(`Only when all of: ${st.conditions.map((c) => c.text).join('; ')}`);

	// Risky patterns.
	if (allow) {
		const allRes = st.resources.includes('*');
		const act = (a: string) => st.actions.length > 0 && matchesAny(st.actions, a, true);
		if (st.actions.includes('*') && allRes)
			f.push({ level: 'high', text: 'Action "*" on Resource "*": full administrator access' });
		else {
			if (allRes && st.actions.some((a) => /^s3:\*$/i.test(a)))
				f.push({ level: 'high', text: 's3:* on "*": every action on every bucket and object' });
			if (allRes && st.actions.some((a) => /^iam:\*$/i.test(a)))
				f.push({
					level: 'high',
					text: 'iam:* on "*": can create users and attach policies, which is admin in effect'
				});
		}
		if (act('iam:PassRole') && (allRes || st.resources.some((r) => /:role\/\*$/.test(r))))
			f.push({
				level: 'high',
				text: 'iam:PassRole on any role: lets the caller hand any role, including admin roles, to EC2, Lambda and other services (privilege escalation). Limit Resource to specific role ARNs and add iam:PassedToService'
			});
		if (st.notActions.length)
			f.push({
				level: 'medium',
				text: 'Allow with NotAction allows every action not listed, including actions added to AWS later'
			});
		if (st.notResources.length)
			f.push({
				level: 'medium',
				text: 'Allow with NotResource allows every resource not listed, including new ones'
			});
		if (isPublic(st.principal) && !st.conditions.length)
			f.push({
				level: 'high',
				text: 'Principal "*" without a Condition: anyone on the internet, in any account'
			});
		if (st.notPrincipal !== undefined)
			f.push({
				level: 'high',
				text: 'Allow with NotPrincipal grants access to everyone not listed, including anonymous users'
			});
		if (isPublic(st.principal) && st.conditions.length)
			f.push({
				level: 'info',
				text: 'Principal "*" limited by conditions: check that they really narrow it (aws:PrincipalOrgID, aws:SourceVpce, aws:SourceArn)'
			});
	}
	for (const a of st.actions)
		if (a !== '*' && !/^[A-Za-z0-9-]+:[A-Za-z0-9*?]+$/.test(a))
			f.push({ level: 'medium', text: `Action "${a}" is not written as service:Action` });
	for (const c of st.conditions)
		if (c.unknown) f.push({ level: 'medium', text: `Unknown condition operator ${c.operator}` });
	return st;
}

export function explainAws(doc: J): AwsPolicy {
	if (!isObj(doc)) throw new Error('A policy is a JSON object with a Statement');
	const raw = doc.Statement;
	if (raw === undefined) throw new Error('No Statement element found');
	const list = Array.isArray(raw) ? raw : [raw];
	const statements = list.map(explainStatement);
	const findings: Finding[] = [];
	const version = typeof doc.Version === 'string' ? doc.Version : undefined;
	if (version === undefined)
		findings.push({
			level: 'medium',
			text: 'No Version: policy variables such as ${aws:username} are then read as literal text. Use "2012-10-17"'
		});
	else if (version !== '2012-10-17' && version !== '2008-10-17')
		findings.push({ level: 'high', text: `Version ${version} is not a valid policy version` });
	else if (version === '2008-10-17')
		findings.push({
			level: 'medium',
			text: 'Version 2008-10-17 is the old language: policy variables are not supported'
		});
	const sids = statements.map((s) => s.sid).filter(Boolean);
	if (new Set(sids).size !== sids.length)
		findings.push({ level: 'medium', text: 'Sid values repeat; they must be unique in a policy' });
	return { kind: 'aws', version, statements, findings };
}

/* ---------- AWS evaluation ---------- */

export interface StatementMatch {
	index: number;
	sid?: string;
	effect: string;
	/** True when the statement has a Condition that this tool cannot evaluate. */
	conditional: boolean;
}

export interface Evaluation {
	decision: 'explicit-deny' | 'allow' | 'implicit-deny';
	/** Allow or deny that only holds if conditions are met. */
	conditional: boolean;
	matches: StatementMatch[];
	text: string;
}

/**
 * ARN matching for the Resource element: "*" alone matches everything, otherwise the first
 * five colon-separated parts are matched one by one and the resource part (which may itself
 * contain colons) as a whole. Case-sensitive.
 */
export function resourceMatch(pattern: string, arn: string): boolean {
	if (pattern === '*') return true;
	const p = pattern.split(':');
	const a = arn.split(':');
	if (p.length < 6 || a.length < 6) return globMatch(pattern, arn);
	for (let i = 0; i < 5; i++) if (!globMatch(p[i], a[i])) return false;
	return globMatch(p.slice(5).join(':'), a.slice(5).join(':'));
}

export function evaluate(policy: AwsPolicy, action: string, resource: string): Evaluation {
	const matches: StatementMatch[] = [];
	for (const s of policy.statements) {
		const actOk = s.actions.length
			? matchesAny(s.actions, action, true)
			: s.notActions.length
				? !matchesAny(s.notActions, action, true)
				: false;
		if (!actOk) continue;
		const resOk = s.resources.length
			? s.resources.some((r) => resourceMatch(r, resource))
			: s.notResources.length
				? !s.notResources.some((r) => resourceMatch(r, resource))
				: true;
		if (!resOk) continue;
		matches.push({
			index: s.index,
			sid: s.sid,
			effect: s.effect,
			conditional: s.conditions.length > 0
		});
	}
	const deny = matches.filter((m) => m.effect === 'Deny');
	const allow = matches.filter((m) => m.effect === 'Allow');
	const hardDeny = deny.some((m) => !m.conditional);
	if (hardDeny)
		return {
			decision: 'explicit-deny',
			conditional: false,
			matches,
			text: 'Explicit deny: a matching Deny statement always wins'
		};
	const hardAllow = allow.some((m) => !m.conditional);
	if (deny.length) {
		return {
			decision: 'explicit-deny',
			conditional: true,
			matches,
			text: `Denied when the Deny statement's conditions hold. Otherwise ${hardAllow ? 'allowed' : allow.length ? 'allowed only if an Allow statement conditions hold' : 'implicitly denied'}`
		};
	}
	if (allow.length)
		return {
			decision: 'allow',
			conditional: !hardAllow,
			matches,
			text: hardAllow
				? 'Allowed by this policy'
				: 'Allowed only when the Allow statement conditions hold, otherwise implicitly denied'
		};
	return {
		decision: 'implicit-deny',
		conditional: false,
		matches,
		text: 'Implicit deny: no statement allows it'
	};
}

/* ---------- Azure RBAC ---------- */

export interface AzurePermission {
	actions: string[];
	notActions: string[];
	dataActions: string[];
	notDataActions: string[];
}

export interface AzureRole {
	kind: 'azure';
	name?: string;
	description?: string;
	custom?: boolean;
	permissions: AzurePermission[];
	scopes: string[];
	findings: Finding[];
}

function getCI(o: { [k: string]: J }, key: string): J | undefined {
	const k = Object.keys(o).find((x) => x.toLowerCase() === key.toLowerCase());
	return k === undefined ? undefined : o[k];
}

export function describeAzureAction(a: string): string {
	if (a === '*') return 'everything, in every resource provider';
	if (a === '*/read') return 'read everything';
	const parts = a.split('/');
	const provider = parts[0];
	const last = parts.at(-1);
	const type = parts.slice(1, -1).join('/');
	const op =
		last === 'read'
			? 'read'
			: last === 'write'
				? 'create or update'
				: last === 'delete'
					? 'delete'
					: last === 'action'
						? 'run the action'
						: last === '*'
							? 'do anything with'
							: last;
	if (provider === '*') return `${op} ${type || 'anything'} in any provider`;
	if (!type) return `${op} in ${provider}`;
	return `${op} ${type.replace(/\/\*$/, ' and everything under it').replace(/\*/g, 'any')} (${provider})`;
}

export function describeScope(s: string): string {
	if (s === '/') return 'the root scope: every management group and subscription in the tenant';
	let m = /^\/providers\/Microsoft\.Management\/managementGroups\/([^/]+)$/i.exec(s);
	if (m) return `management group ${m[1]}`;
	m = /^\/subscriptions\/([^/]+)$/i.exec(s);
	if (m) return `subscription ${m[1]}`;
	m = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)$/i.exec(s);
	if (m) return `resource group ${m[2]} in subscription ${m[1]}`;
	m = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/(.+)$/i.exec(s);
	if (m) return `resource ${m[3]} in resource group ${m[2]}`;
	return s;
}

export function explainAzure(doc: J): AzureRole {
	if (!isObj(doc)) throw new Error('A role definition is a JSON object');
	const props = isObj(getCI(doc, 'properties'))
		? (getCI(doc, 'properties') as { [k: string]: J })
		: doc;
	const strOf = (v: J | undefined) => (typeof v === 'string' ? v : undefined);
	const perms: AzurePermission[] = [];
	const permList = getCI(props, 'permissions');
	if (Array.isArray(permList)) {
		for (const p of permList)
			if (isObj(p))
				perms.push({
					actions: asList(getCI(p, 'actions')),
					notActions: asList(getCI(p, 'notActions')),
					dataActions: asList(getCI(p, 'dataActions')),
					notDataActions: asList(getCI(p, 'notDataActions'))
				});
	} else
		perms.push({
			actions: asList(getCI(props, 'Actions')),
			notActions: asList(getCI(props, 'NotActions')),
			dataActions: asList(getCI(props, 'DataActions')),
			notDataActions: asList(getCI(props, 'NotDataActions'))
		});
	const role: AzureRole = {
		kind: 'azure',
		name: strOf(getCI(props, 'roleName')) ?? strOf(getCI(props, 'Name')),
		description: strOf(getCI(props, 'description')),
		custom:
			typeof getCI(props, 'IsCustom') === 'boolean'
				? (getCI(props, 'IsCustom') as boolean)
				: (strOf(getCI(props, 'roleType')) ?? strOf(getCI(props, 'type'))) === 'CustomRole'
					? true
					: strOf(getCI(props, 'roleType')) === 'BuiltInRole'
						? false
						: undefined,
		permissions: perms,
		scopes: asList(getCI(props, 'assignableScopes')),
		findings: []
	};
	const f = role.findings;
	const all = perms.flatMap((p) => p.actions);
	const allData = perms.flatMap((p) => p.dataActions);
	const notAll = perms.flatMap((p) => p.notActions);
	const can = (a: string) => azureAllows(role, a, false);
	if (all.includes('*'))
		f.push({
			level: 'high',
			text: notAll.length
				? 'Actions "*" minus NotActions: everything else in every provider, like the built-in Contributor role'
				: 'Actions "*": full control of everything in scope, like Owner'
		});
	if (can('Microsoft.Authorization/roleAssignments/write'))
		f.push({
			level: 'high',
			text: 'Can write role assignments (Microsoft.Authorization/roleAssignments/write): holders can grant themselves or others any role in scope'
		});
	if (can('Microsoft.Authorization/roleDefinitions/write'))
		f.push({
			level: 'high',
			text: 'Can write role definitions: holders can widen roles, including this one'
		});
	if (allData.includes('*'))
		f.push({
			level: 'high',
			text: 'DataActions "*": every data plane action (blobs, keys, secrets...)'
		});
	if (role.scopes.includes('/'))
		f.push({
			level: 'medium',
			text: 'Assignable at "/" (root): can be assigned anywhere in the tenant'
		});
	if (!role.scopes.length && role.custom)
		f.push({ level: 'medium', text: 'A custom role needs at least one assignable scope' });
	if (notAll.length)
		f.push({
			level: 'info',
			text: 'NotActions only subtract from Actions in this role. They are not a deny: another role assignment can still grant those actions'
		});
	return role;
}

/** Whether the role's Actions (or DataActions) minus NotActions cover an operation. Case-insensitive. */
export function azureAllows(role: AzureRole, op: string, data: boolean): boolean {
	return role.permissions.some((p) => {
		const yes = data ? p.dataActions : p.actions;
		const no = data ? p.notDataActions : p.notActions;
		return matchesAny(yes, op, true) && !matchesAny(no, op, true);
	});
}

/* ---------- entry ---------- */

export type Explained = AwsPolicy | AzureRole;

export function explain(text: string): Explained {
	const doc = readJson(text);
	if (isObj(doc) && 'Statement' in doc) return explainAws(doc);
	if (isObj(doc)) {
		const props = isObj(getCI(doc, 'properties'))
			? (getCI(doc, 'properties') as { [k: string]: J })
			: doc;
		if (
			getCI(props, 'assignableScopes') !== undefined ||
			getCI(props, 'permissions') !== undefined ||
			getCI(props, 'Actions') !== undefined
		)
			return explainAzure(doc);
	}
	throw new Error(
		'Not recognised: expected an AWS IAM policy (with Statement) or an Azure role definition (with Actions or permissions)'
	);
}

/** Front page intake: an AWS policy or Azure role definition in JSON. */
export function looksLikePolicy(s: string): number {
	const t = s.trim();
	if (!t.startsWith('{') || t.length > 100_000) return 0;
	const aws = /"Statement"\s*:/.test(t) && /"Effect"\s*:/.test(t);
	const azure = /"assignableScopes"\s*:/i.test(t) && /"(?:actions|permissions)"\s*:/i.test(t);
	if (!aws && !azure) return 0;
	try {
		JSON.parse(t);
		return 0.9;
	} catch {
		return 0;
	}
}
