import { describe, expect, it } from 'vitest';
import { detectCloud, looksLikeCloudId, parseId } from './logic';

const part = (raw: string, label: string) =>
	parseId(raw).parts.find((p) => p.label === label)?.value;

describe('AWS ARNs', () => {
	it('parses an EC2 instance (AWS docs example form)', () => {
		const a = 'arn:aws:ec2:us-east-1:123456789012:instance/i-0abcd1234efgh5678';
		const p = parseId(a);
		expect(p.cloud).toBe('aws');
		expect(p.errors).toEqual([]);
		expect(part(a, 'Region')).toBe('us-east-1');
		expect(part(a, 'Account')).toBe('123456789012');
		expect(part(a, 'Resource type')).toBe('instance');
		expect(part(a, 'Resource id')).toBe('i-0abcd1234efgh5678');
	});

	it('handles S3 buckets and objects without region and account', () => {
		const o = 'arn:aws:s3:::my-bucket/photos/2026/cat.jpg';
		expect(part(o, 'Bucket')).toBe('my-bucket');
		expect(part(o, 'Object key')).toBe('photos/2026/cat.jpg');
		expect(parseId(o).errors).toEqual([]);
		expect(parseId('arn:aws:s3:::My_Bucket').errors.join(' ')).toMatch(/lowercase/);
		expect(parseId('arn:aws:s3:::bucket/*').notes.join(' ')).toMatch(/wildcard/);
	});

	it('splits IAM paths and knows managed policies', () => {
		const r = 'arn:aws:iam::123456789012:role/service/ops/deployer';
		expect(part(r, 'Resource type')).toBe('role');
		expect(part(r, 'Path')).toBe('/service/ops/');
		expect(part(r, 'Name')).toBe('deployer');
		const m = parseId('arn:aws:iam::aws:policy/AdministratorAccess');
		expect(m.errors).toEqual([]);
		expect(m.notes.join(' ')).toMatch(/managed/);
		expect(parseId('arn:aws:iam:us-east-1:123456789012:user/bob').errors).toContain(
			'IAM ARNs have no region'
		);
	});

	it('reads STS, Lambda, SNS, DynamoDB, logs and Secrets Manager quirks', () => {
		const s = 'arn:aws:sts::123456789012:assumed-role/Admin/alice@example.com';
		expect(part(s, 'Role')).toBe('Admin');
		expect(part(s, 'Session')).toBe('alice@example.com');
		expect(
			part(
				'arn:aws:lambda:eu-west-1:123456789012:function:resize:prod',
				'Qualifier (version or alias)'
			)
		).toBe('prod');
		expect(
			part(
				'arn:aws:sns:eu-west-1:123456789012:alerts:6f1b9c1e-1111-2222-3333-444455556666',
				'Subscription id'
			)
		).toBe('6f1b9c1e-1111-2222-3333-444455556666');
		expect(part('arn:aws:dynamodb:eu-west-1:123456789012:table/Orders/index/ByDate', 'Index')).toBe(
			'ByDate'
		);
		expect(
			part('arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/resize:*', 'Log group')
		).toBe('/aws/lambda/resize');
		const sec = 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:prod/db-AbC123';
		expect(part(sec, 'Secret name')).toBe('prod/db');
		expect(part(sec, 'Random suffix')).toBe('AbC123');
	});

	it('validates fields', () => {
		expect(parseId('arn:aws:s3').errors[0]).toMatch(/six colon-separated/);
		expect(parseId('arn:foo:ec2:us-east-1:123456789012:instance/i-1').errors).toContain(
			'Unknown partition "foo"'
		);
		expect(parseId('arn:aws:ec2:useast1:123456789012:instance/i-1').errors[0]).toMatch(
			/region code/
		);
		expect(parseId('arn:aws:ec2:us-east-1:12345:instance/i-1').errors).toContain(
			'Account ID is 12 digits'
		);
		expect(parseId('arn:aws-us-gov:ec2:us-gov-west-1:123456789012:vpc/vpc-1').errors).toEqual([]);
		expect(parseId('arn:aws-cn:ec2:cn-north-1:123456789012:vpc/vpc-1').errors).toEqual([]);
	});
});

describe('Azure resource IDs', () => {
	const vm =
		'/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg-web/providers/Microsoft.Compute/virtualMachines/vm01';

	it('parses a VM', () => {
		const p = parseId(vm);
		expect(p.cloud).toBe('azure');
		expect(p.errors).toEqual([]);
		expect(part(vm, 'Subscription')).toBe('00000000-1111-2222-3333-444444444444');
		expect(part(vm, 'Resource group')).toBe('rg-web');
		expect(part(vm, 'Full type')).toBe('Microsoft.Compute/virtualMachines');
		expect(part(vm, 'Resource name')).toBe('vm01');
		expect(part(vm, 'Scope')).toBe('resource');
	});

	it('handles nested types', () => {
		const db =
			'/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg/providers/Microsoft.Sql/servers/sql1/databases/db1';
		expect(part(db, 'Full type')).toBe('Microsoft.Sql/servers/databases');
		expect(part(db, 'Resource name')).toBe('db1');
	});

	it('handles extension resources and scopes', () => {
		const ra = vm + '/providers/Microsoft.Authorization/roleAssignments/abc';
		const p = parseId(ra);
		expect(p.errors).toEqual([]);
		expect(part(ra, 'Full type')).toBe('Microsoft.Authorization/roleAssignments');
		expect(p.notes.join(' ')).toMatch(/Extension resource/);
		expect(
			part('/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg', 'Scope')
		).toBe('resource group');
		expect(part('/providers/Microsoft.Management/managementGroups/mg1', 'Name')).toBe('mg1');
	});

	it('validates', () => {
		expect(parseId('/subscriptions/not-a-guid').errors).toContain('Subscription ID must be a GUID');
		expect(
			parseId(
				'/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg./x'
			).errors.join(' ')
		).toMatch(/not ending in a dot/);
		expect(parseId(vm.replace('/vm01', '')).errors[0]).toMatch(/has no name/);
		expect(parseId(vm.replace('resourceGroups', 'resourcegroups')).notes[0]).toMatch(
			/case-insensitively/
		);
	});
});

describe('Google Cloud resource names', () => {
	it('parses a full resource name', () => {
		const n =
			'//compute.googleapis.com/projects/my-project-123/zones/europe-west1-b/instances/vm-1';
		const p = parseId(n);
		expect(p.cloud).toBe('gcp');
		expect(p.errors).toEqual([]);
		expect(part(n, 'Service')).toBe('compute.googleapis.com');
		expect(part(n, 'Project')).toBe('my-project-123');
		expect(part(n, 'Zone')).toBe('europe-west1-b');
		expect(part(n, 'Resource')).toBe('instances/vm-1');
	});

	it('parses relative names and self links', () => {
		expect(part('projects/p-123456/locations/global/keyRings/ring', 'Location')).toBe('global');
		const s = 'https://www.googleapis.com/compute/v1/projects/my-project-123/regions/us-central1';
		expect(part(s, 'Service')).toBe('compute.googleapis.com');
		expect(part(s, 'Region')).toBe('us-central1');
		expect(parseId('projects/123456789012').notes.join(' ')).toMatch(/project number/);
	});

	it('validates', () => {
		expect(parseId('projects/Bad_Project').errors.join(' ')).toMatch(/6 to 30/);
		expect(parseId('projects/my-project-1/zones').errors.join(' ')).toMatch(/pairs/);
	});
});

describe('detection', () => {
	it('routes by prefix', () => {
		expect(detectCloud('arn:aws:s3:::b')).toBe('aws');
		expect(detectCloud('/subscriptions/x')).toBe('azure');
		expect(detectCloud('hello')).toBeNull();
		expect(() => parseId('hello')).toThrow(/Not recognised/);
		expect(() => parseId(' ')).toThrow(/Enter/);
	});

	it('scores pasted ids', () => {
		expect(looksLikeCloudId('arn:aws:s3:::b')).toBe(0.95);
		expect(looksLikeCloudId('/subscriptions/abc/resourceGroups/rg')).toBe(0.9);
		expect(looksLikeCloudId('//compute.googleapis.com/projects/p')).toBe(0.9);
		expect(looksLikeCloudId('https://example.com')).toBe(0);
	});
});
