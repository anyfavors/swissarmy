/**
 * Cloud resource identifiers.
 *
 * Sources:
 * - AWS: "Identify AWS resources with Amazon Resource Names (ARNs)" (IAM User Guide, reference-arns)
 *   and the service authorization reference for per-service resource formats.
 * - Azure: Azure Resource Manager "Resource ID" format (resourceId() template function docs) and
 *   "Naming rules and restrictions for Azure resources" for resource group names.
 * - Google Cloud: "Resource names" (API design guide, full and relative resource names) and
 *   "Creating and managing projects" for project ID rules.
 */

export type Cloud = 'aws' | 'azure' | 'gcp';

export interface Part {
	label: string;
	value: string;
}

export interface Parsed {
	cloud: Cloud;
	parts: Part[];
	/** Problems that make the id invalid */
	errors: string[];
	/** Things worth knowing but not wrong */
	notes: string[];
}

// ---------- AWS ----------

export const AWS_PARTITIONS: Record<string, string> = {
	aws: 'AWS commercial regions',
	'aws-cn': 'AWS China (Beijing, Ningxia)',
	'aws-us-gov': 'AWS GovCloud (US)',
	'aws-iso': 'AWS ISO (US secret regions)',
	'aws-iso-b': 'AWS ISOB',
	'aws-iso-e': 'AWS ISOE (Europe)',
	'aws-iso-f': 'AWS ISOF',
	'aws-eusc': 'AWS European Sovereign Cloud'
};

const AWS_REGION_RE = /^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/;
const GLOBAL = new Set([
	'iam',
	'route53',
	'cloudfront',
	'organizations',
	'waf',
	'globalaccelerator'
]);

function s3BucketProblems(b: string): string[] {
	const e: string[] = [];
	if (b.length < 3 || b.length > 63) e.push(`Bucket name "${b}" must be 3 to 63 characters`);
	if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(b))
		e.push(
			'Bucket names use lowercase letters, digits, dots and hyphens, and start and end with a letter or digit'
		);
	if (/^\d+\.\d+\.\d+\.\d+$/.test(b)) e.push('Bucket names cannot look like an IP address');
	if (b.includes('..')) e.push('Bucket names cannot contain two dots in a row');
	return e;
}

export function parseArn(raw: string): Parsed {
	const t = raw.trim();
	const out: Parsed = { cloud: 'aws', parts: [], errors: [], notes: [] };
	const f = t.split(':');
	if (f[0] !== 'arn') {
		out.errors.push('An ARN starts with "arn:"');
		return out;
	}
	if (f.length < 6) {
		out.errors.push(
			`An ARN has six colon-separated fields, arn:partition:service:region:account:resource. Found ${f.length}.`
		);
		return out;
	}
	const [, partition, service, region, account] = f;
	const resource = f.slice(5).join(':');
	const P = (label: string, value: string) => out.parts.push({ label, value });
	P('Partition', partition + (AWS_PARTITIONS[partition] ? `, ${AWS_PARTITIONS[partition]}` : ''));
	if (!AWS_PARTITIONS[partition]) out.errors.push(`Unknown partition "${partition}"`);
	P('Service', service);
	if (!/^[a-z0-9-]+$/.test(service))
		out.errors.push('Service is lowercase letters, digits and hyphens');
	P('Region', region || '(none)');
	if (region && !AWS_REGION_RE.test(region))
		out.errors.push(`"${region}" does not look like a region code such as eu-west-1`);
	P('Account', account || '(none)');
	if (account && !/^\d{12}$/.test(account) && account !== 'aws')
		out.errors.push('Account ID is 12 digits');
	if (account === 'aws')
		out.notes.push('Account "aws" marks an AWS managed resource, such as a managed IAM policy.');
	if (!resource) out.errors.push('Resource part is empty');
	if (GLOBAL.has(service) && region)
		out.notes.push(`${service} is a global service; its ARNs normally have no region.`);

	const generic = () => {
		const m = /^([^/:]+)([/:])(.*)$/.exec(resource);
		if (m) {
			P('Resource type', m[1]);
			P('Resource id', m[3]);
		} else P('Resource', resource);
	};

	switch (service) {
		case 's3': {
			if (!region && !account) {
				const i = resource.indexOf('/');
				const bucket = i < 0 ? resource : resource.slice(0, i);
				P('Bucket', bucket);
				if (i >= 0) P('Object key', resource.slice(i + 1) || '(empty)');
				out.errors.push(...s3BucketProblems(bucket));
				out.notes.push(
					'S3 bucket and object ARNs have no region or account: bucket names are global.'
				);
				if (resource.includes('*'))
					out.notes.push(
						'Contains a wildcard, so this is a policy pattern rather than one resource.'
					);
			} else generic();
			break;
		}
		case 'iam': {
			if (region) out.errors.push('IAM ARNs have no region');
			const m = /^([^/]+)\/(.*)$/.exec(resource);
			if (m) {
				const segs = m[2].split('/');
				P('Resource type', m[1]);
				if (segs.length > 1) P('Path', '/' + segs.slice(0, -1).join('/') + '/');
				P('Name', segs[segs.length - 1]);
				if (m[1] === 'role' && segs[0] === 'aws-service-role')
					out.notes.push('Service-linked role, created and managed by an AWS service.');
			} else {
				P('Resource', resource);
				if (resource === 'root')
					out.notes.push('root means the account itself in a policy principal.');
			}
			break;
		}
		case 'sts': {
			const m = /^(assumed-role|federated-user)\/([^/]+)(?:\/(.+))?$/.exec(resource);
			if (m) {
				P('Resource type', m[1]);
				P(m[1] === 'assumed-role' ? 'Role' : 'User', m[2]);
				if (m[3]) P('Session', m[3]);
				if (m[1] === 'assumed-role')
					out.notes.push(
						'The matching IAM role ARN is arn:' +
							partition +
							':iam::' +
							account +
							':role/' +
							m[2] +
							' (path not included in STS ARNs).'
					);
			} else generic();
			break;
		}
		case 'lambda': {
			const m = /^(function|layer):([^:]+)(?::(.+))?$/.exec(resource);
			if (m) {
				P('Resource type', m[1]);
				P('Name', m[2]);
				if (m[3]) P(m[1] === 'function' ? 'Qualifier (version or alias)' : 'Version', m[3]);
			} else generic();
			break;
		}
		case 'sns': {
			const [topic, sub] = resource.split(':');
			P('Topic', topic);
			if (sub) P('Subscription id', sub);
			break;
		}
		case 'sqs':
			P('Queue', resource);
			break;
		case 'logs': {
			const m = /^log-group:([^:]+)(?::log-stream:(.*)|:\*)?$/.exec(resource);
			if (m) {
				P('Log group', m[1]);
				if (m[2] !== undefined) P('Log stream', m[2] || '*');
				if (resource.endsWith(':*'))
					out.notes.push(
						'The :* suffix is what DescribeLogGroups returns; some APIs want the ARN without it.'
					);
			} else generic();
			break;
		}
		case 'dynamodb': {
			const m = /^table\/([^/]+)(?:\/(stream|index|backup|export|import)\/(.+))?$/.exec(resource);
			if (m) {
				P('Table', m[1]);
				if (m[2]) P(m[2][0].toUpperCase() + m[2].slice(1), m[3]);
			} else generic();
			break;
		}
		case 'secretsmanager': {
			const m = /^secret:(.+?)(-[A-Za-z0-9]{6})?$/.exec(resource);
			if (m) {
				P('Secret name', m[1]);
				if (m[2]) {
					P('Random suffix', m[2].slice(1));
					out.notes.push(
						'Secrets Manager appends a hyphen and 6 random characters to the name in the ARN.'
					);
				}
			} else generic();
			break;
		}
		default:
			generic();
	}
	return out;
}

// ---------- Azure ----------

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAzure(raw: string): Parsed {
	const t = raw.trim();
	const out: Parsed = { cloud: 'azure', parts: [], errors: [], notes: [] };
	if (!t.startsWith('/')) out.errors.push('An Azure resource ID starts with /');
	const segs = t.replace(/^\/+|\/+$/g, '').split('/');
	if (segs.some((s) => s === '')) out.errors.push('Empty segment (double slash)');
	const P = (label: string, value: string) => out.parts.push({ label, value });
	let i = 0;
	const types: string[] = [];
	const names: string[] = [];
	let ns = '';
	let scope = 'tenant';
	while (i < segs.length) {
		const key = segs[i].toLowerCase();
		const val = segs[i + 1];
		if (key === 'subscriptions') {
			if (val === undefined) {
				out.errors.push('subscriptions has no ID after it');
				break;
			}
			P('Subscription', val);
			if (!GUID_RE.test(val)) out.errors.push('Subscription ID must be a GUID');
			scope = 'subscription';
			i += 2;
		} else if (key === 'resourcegroups') {
			if (val === undefined) {
				out.errors.push('resourceGroups has no name after it');
				break;
			}
			P('Resource group', val);
			if (!/^[-\p{L}\p{N}_.()]{1,90}$/u.test(val) || val.endsWith('.'))
				out.errors.push(
					'Resource group names are 1 to 90 letters, digits, - _ . ( ), not ending in a dot'
				);
			if (segs[i].toLowerCase() === 'resourcegroups' && segs[i] !== 'resourceGroups')
				out.notes.push(
					`Written "${segs[i]}". Azure matches case-insensitively, but tools that compare strings may not.`
				);
			scope = 'resource group';
			i += 2;
		} else if (key === 'providers') {
			if (val === undefined) {
				out.errors.push('providers has no namespace after it');
				break;
			}
			if (ns) {
				out.notes.push(
					`Extension resource: a ${val} resource attached to ${ns}/${types.join('/')} ${names[names.length - 1]}.`
				);
				types.length = 0;
			}
			ns = val;
			P(
				types.length || out.parts.some((p) => p.label === 'Provider')
					? 'Extension provider'
					: 'Provider',
				val
			);
			if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(val))
				out.errors.push(
					`"${val}" does not look like a provider namespace such as Microsoft.Compute`
				);
			i += 2;
			while (i < segs.length && segs[i].toLowerCase() !== 'providers') {
				const ty = segs[i];
				const nm = segs[i + 1];
				if (nm === undefined) {
					out.errors.push(`Type "${ty}" has no name after it`);
					i++;
					break;
				}
				types.push(ty);
				names.push(nm);
				P(types.length === 1 ? 'Type' : 'Child type', ty);
				P('Name', nm);
				i += 2;
			}
			scope = 'resource';
		} else {
			out.errors.push(`Unexpected segment "${segs[i]}"`);
			break;
		}
	}
	if (ns && types.length) {
		out.parts.unshift({ label: 'Full type', value: `${ns}/${types.join('/')}` });
		out.parts.unshift({ label: 'Resource name', value: names[names.length - 1] });
	}
	out.parts.push({ label: 'Scope', value: scope });
	return out;
}

// ---------- Google Cloud ----------

const GCP_PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export function parseGcp(raw: string): Parsed {
	let t = raw.trim();
	const out: Parsed = { cloud: 'gcp', parts: [], errors: [], notes: [] };
	const P = (label: string, value: string) => out.parts.push({ label, value });
	let service = '';
	const full = /^\/\/([a-z0-9.-]+)\/(.*)$/.exec(t);
	const url = /^https:\/\/([a-z0-9.-]+)\/(.*)$/.exec(t);
	if (full) {
		service = full[1];
		t = full[2];
		P('Form', 'Full resource name');
	} else if (url) {
		service = url[1] === 'www.googleapis.com' ? url[2].split('/')[0] + '.googleapis.com' : url[1];
		t = url[2].replace(/^([a-z]+\/)?(v\d[a-z0-9]*)\//, '');
		P('Form', 'Self link (URL)');
	} else P('Form', 'Relative resource name');
	if (service) {
		P('Service', service);
		if (!service.endsWith('.googleapis.com'))
			out.errors.push('Service host should end in .googleapis.com');
	}
	const segs = t.replace(/\/+$/, '').split('/');
	if (segs.length % 2) {
		out.errors.push('Collections and IDs come in pairs; this has an odd number of segments');
	}
	let lastColl = '';
	let lastId = '';
	for (let i = 0; i + 1 < segs.length; i += 2) {
		const coll = segs[i];
		const id = segs[i + 1];
		lastColl = coll;
		lastId = id;
		if (coll === 'projects') {
			P('Project', id);
			if (!GCP_PROJECT_RE.test(id) && !/^\d+$/.test(id))
				out.errors.push(
					'Project IDs are 6 to 30 lowercase letters, digits and hyphens, starting with a letter'
				);
			else if (/^\d+$/.test(id))
				out.notes.push('Numeric project: this is the project number, not the project ID.');
		} else if (coll === 'zones') {
			P('Zone', id);
			if (!/^[a-z]+-[a-z]+\d+-[a-z]$/.test(id))
				out.errors.push(`"${id}" does not look like a zone such as europe-west1-b`);
		} else if (coll === 'regions') {
			P('Region', id);
			if (!/^[a-z]+-[a-z]+\d+$/.test(id))
				out.errors.push(`"${id}" does not look like a region such as europe-west1`);
		} else if (coll === 'locations') P('Location', id);
		else if (coll === 'organizations' || coll === 'folders')
			P(coll === 'folders' ? 'Folder' : 'Organization', id);
		else P(coll, id);
	}
	if (lastColl)
		out.parts.splice(service ? 2 : 1, 0, { label: 'Resource', value: `${lastColl}/${lastId}` });
	if (
		!segs[0] ||
		!['projects', 'organizations', 'folders', 'billingAccounts', 'locations'].includes(segs[0])
	)
		out.notes.push('Most names start at projects/, organizations/, folders/ or billingAccounts/.');
	return out;
}

// ---------- dispatch ----------

export function detectCloud(s: string): Cloud | null {
	const t = s.trim();
	if (/^arn:/i.test(t)) return 'aws';
	if (/^\/(subscriptions|providers)\//i.test(t)) return 'azure';
	if (
		/^\/\/[a-z0-9.-]+\.googleapis\.com\//.test(t) ||
		/^https:\/\/[a-z0-9.-]*googleapis\.com\//.test(t)
	)
		return 'gcp';
	if (/^(projects|organizations|folders)\/[^/]+/.test(t)) return 'gcp';
	return null;
}

export function parseId(raw: string): Parsed {
	const t = raw.trim();
	if (!t) throw new Error('Enter an ARN, Azure resource ID or Google Cloud resource name');
	const c = detectCloud(t);
	if (c === 'aws') return parseArn(t);
	if (c === 'azure') return parseAzure(t);
	if (c === 'gcp') return parseGcp(t);
	throw new Error(
		'Not recognised. ARNs start with arn:, Azure IDs with /subscriptions/, Google names with //service.googleapis.com/ or projects/.'
	);
}

export function looksLikeCloudId(s: string): number {
	const t = s.trim();
	if (/\s/.test(t)) return 0;
	if (/^arn:/.test(t)) return 0.95;
	if (/^\/subscriptions\//i.test(t)) return 0.9;
	if (/^\/\/[a-z0-9.-]+\.googleapis\.com\//.test(t)) return 0.9;
	return 0;
}
