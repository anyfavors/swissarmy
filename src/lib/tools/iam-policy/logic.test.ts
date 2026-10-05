import { describe, expect, it } from 'vitest';
import {
	azureAllows,
	describeAction,
	describeResource,
	evaluate,
	explain,
	explainAws,
	explainCondition,
	globMatch,
	looksLikePolicy,
	resourceMatch,
	type AwsPolicy,
	type AzureRole
} from './logic';

const aws = (o: unknown) => explain(JSON.stringify(o)) as AwsPolicy;

describe('wildcards', () => {
	it('globs with * and ?', () => {
		expect(globMatch('s3:Get*', 's3:GetObject')).toBe(true);
		expect(globMatch('s3:Get*', 's3:getobject', true)).toBe(true);
		expect(globMatch('s3:Get*', 's3:getobject')).toBe(false);
		expect(globMatch('ec2:?escribe*', 'ec2:DescribeInstances')).toBe(true);
		expect(globMatch('a.b', 'aXb')).toBe(false);
	});

	it('describes actions in words without expanding them', () => {
		expect(describeAction('*')).toBe('every action in every service');
		expect(describeAction('s3:*')).toBe('every s3 action');
		expect(describeAction('s3:Get*')).toBe('every s3 action starting with Get');
		expect(describeAction('iam:*AccessKey')).toBe('every iam action ending with AccessKey');
		expect(describeAction('ec2:Describe?nstances')).toMatch(/matching/);
		expect(describeAction('s3:GetObject')).toBe('s3 GetObject');
		expect(describeAction('GetObject')).toMatch(/not service:action/);
	});

	it('describes resources', () => {
		expect(describeResource('*')).toBe('every resource');
		expect(describeResource('arn:aws:s3:::my-bucket/*')).toBe(
			's3 resource "my-bucket/*" (wildcard)'
		);
		expect(describeResource('arn:aws:iam::123456789012:role/admin')).toBe(
			'iam resource "role/admin" in account 123456789012'
		);
	});

	it('matches ARNs part by part', () => {
		expect(resourceMatch('arn:aws:s3:::bucket/*', 'arn:aws:s3:::bucket/a/b.txt')).toBe(true);
		expect(resourceMatch('arn:aws:s3:::bucket/*', 'arn:aws:s3:::bucket')).toBe(false);
		expect(
			resourceMatch('arn:aws:ec2:*:*:instance/*', 'arn:aws:ec2:eu-west-1:1:instance/i-1')
		).toBe(true);
		expect(
			resourceMatch(
				'arn:aws:logs:*:*:log-group:app:*',
				'arn:aws:logs:us-east-1:1:log-group:app:log-stream:x'
			)
		).toBe(true);
		expect(resourceMatch('arn:aws:s3:::Bucket', 'arn:aws:s3:::bucket')).toBe(false);
	});
});

describe('conditions', () => {
	it('explains operators, set qualifiers and IfExists', () => {
		const c = explainCondition({
			IpAddress: { 'aws:SourceIp': ['192.0.2.0/24', '203.0.113.0/24'] },
			StringNotEquals: { 'aws:PrincipalOrgID': ['o-a', 'o-b'] },
			'ForAllValues:StringLike': { 'aws:TagKeys': 'env*' },
			BoolIfExists: { 'aws:MultiFactorAuthPresent': 'true' },
			StringEqualz: { x: 'y' }
		});
		expect(c[0].text).toMatch(
			/aws:SourceIp \(the caller public IP address.*is in the IP range any of 192.0.2.0\/24, 203.0.113.0\/24/
		);
		expect(c[1].text).toMatch(/does not equal, case-sensitive none of o-a, o-b/);
		expect(c[2].text).toMatch(/^Every value of aws:TagKeys .*missing or empty/);
		expect(c[3].text).toMatch(/Ignored when the key is not in the request$/);
		expect(c[4].unknown).toBe(true);
	});
});

describe('AWS findings', () => {
	it('flags admin access', () => {
		const p = aws({
			Version: '2012-10-17',
			Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }]
		});
		expect(p.statements[0].findings.map((f) => f.text)).toContain(
			'Action "*" on Resource "*": full administrator access'
		);
	});

	it('flags iam:PassRole on *, also through wildcards', () => {
		for (const a of ['iam:PassRole', 'iam:Pass*', 'iam:*']) {
			const p = aws({
				Version: '2012-10-17',
				Statement: { Effect: 'Allow', Action: a, Resource: '*' }
			});
			expect(p.statements[0].findings.some((f) => /PassRole/.test(f.text))).toBe(true);
		}
		const ok = aws({
			Version: '2012-10-17',
			Statement: { Effect: 'Allow', Action: 'iam:PassRole', Resource: 'arn:aws:iam::1:role/app' }
		});
		expect(ok.statements[0].findings).toEqual([]);
	});

	it('flags s3:* on *, public principals and NotAction with Allow', () => {
		const p = aws({
			Version: '2012-10-17',
			Statement: [
				{ Effect: 'Allow', Action: 's3:*', Resource: '*' },
				{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::b/*' },
				{ Effect: 'Allow', NotAction: 'iam:*', Resource: '*' },
				{ Effect: 'Deny', NotAction: 'iam:*', Resource: '*' },
				{
					Effect: 'Allow',
					Principal: { AWS: '*' },
					Action: 's3:GetObject',
					Resource: 'arn:aws:s3:::b/*',
					Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-1' } }
				}
			]
		});
		const t = p.statements.map((s) => s.findings.map((f) => f.level + ' ' + f.text).join('|'));
		expect(t[0]).toMatch(/^high s3:\* on "\*"/);
		expect(t[1]).toMatch(/^high Principal "\*" without a Condition/);
		expect(t[2]).toMatch(/^medium Allow with NotAction/);
		expect(t[3]).toBe('');
		expect(t[4]).toMatch(/^info Principal "\*" limited by conditions/);
	});

	it('reports structural mistakes', () => {
		const p = aws({
			Statement: [
				{ Sid: 'a', Effect: 'allow', Action: 's3:x', Resources: '*' },
				{ Sid: 'a', Effect: 'Deny' }
			]
		});
		expect(p.findings.map((f) => f.text).join('|')).toMatch(/No Version.*\|Sid values repeat/);
		expect(p.statements[0].findings.map((f) => f.text)).toEqual([
			'Effect must be Allow or Deny, got "allow"',
			'Unknown element Resources (element names are case-sensitive)'
		]);
		expect(p.statements[1].findings[0].text).toMatch(/No Action or NotAction/);
		expect(() => explainAws([])).toThrow(/JSON object/);
		expect(() => explain('{"a":1}')).toThrow(/Not recognised/);
		expect(() => explain('{"Statement": [}')).toThrow();
	});

	it('writes plain-language lines', () => {
		const p = aws({
			Version: '2012-10-17',
			Statement: {
				Effect: 'Allow',
				Principal: { AWS: '123456789012', Service: 'lambda.amazonaws.com' },
				Action: ['s3:Get*', 's3:ListBucket'],
				Resource: ['arn:aws:s3:::b', 'arn:aws:s3:::b/*']
			}
		});
		expect(p.statements[0].lines[0]).toBe(
			'Who: Account 123456789012: any principal there that its own IAM policies allow; AWS service lambda.amazonaws.com'
		);
		expect(p.statements[0].lines[1]).toBe(
			'Allows: every s3 action starting with Get; s3 ListBucket'
		);
	});
});

describe('evaluation', () => {
	const p = aws({
		Version: '2012-10-17',
		Statement: [
			{ Sid: 'Read', Effect: 'Allow', Action: 's3:Get*', Resource: 'arn:aws:s3:::data/*' },
			{ Sid: 'NoSecrets', Effect: 'Deny', Action: 's3:*', Resource: 'arn:aws:s3:::data/secret/*' },
			{
				Sid: 'TlsOnly',
				Effect: 'Deny',
				Action: '*',
				Resource: '*',
				Condition: { Bool: { 'aws:SecureTransport': 'false' } }
			},
			{
				Sid: 'Ec2',
				Effect: 'Allow',
				NotAction: 'ec2:Terminate*',
				Resource: 'arn:aws:ec2:*:*:instance/*'
			}
		]
	});

	it('explicit deny wins over allow', () => {
		const e = evaluate(p, 's3:GetObject', 'arn:aws:s3:::data/secret/key');
		expect(e.decision).toBe('explicit-deny');
		expect(e.conditional).toBe(false);
		expect(e.matches.map((m) => m.sid)).toEqual(['Read', 'NoSecrets', 'TlsOnly']);
	});

	it('reports a conditional deny', () => {
		const e = evaluate(p, 's3:getobject', 'arn:aws:s3:::data/report.csv');
		expect(e.decision).toBe('explicit-deny');
		expect(e.conditional).toBe(true);
		expect(e.text).toMatch(/Otherwise allowed/);
	});

	it('honours NotAction', () => {
		const pol = aws({
			Version: '2012-10-17',
			Statement: [{ Effect: 'Allow', NotAction: 'ec2:Terminate*', Resource: '*' }]
		});
		expect(
			evaluate(pol, 'ec2:StartInstances', 'arn:aws:ec2:eu-west-1:1:instance/i-1').decision
		).toBe('allow');
		expect(
			evaluate(pol, 'ec2:TerminateInstances', 'arn:aws:ec2:eu-west-1:1:instance/i-1').decision
		).toBe('implicit-deny');
	});

	it('honours NotResource', () => {
		const pol = aws({
			Version: '2012-10-17',
			Statement: [{ Effect: 'Allow', Action: 's3:*', NotResource: 'arn:aws:s3:::private/*' }]
		});
		expect(evaluate(pol, 's3:GetObject', 'arn:aws:s3:::private/x').decision).toBe('implicit-deny');
		expect(evaluate(pol, 's3:GetObject', 'arn:aws:s3:::public/x').decision).toBe('allow');
	});
});

describe('Azure', () => {
	const contributor = {
		Name: 'Contributor',
		IsCustom: false,
		Description: 'Grants full access to manage all resources',
		Actions: ['*'],
		NotActions: [
			'Microsoft.Authorization/*/Delete',
			'Microsoft.Authorization/*/Write',
			'Microsoft.Authorization/elevateAccess/Action'
		],
		DataActions: [],
		NotDataActions: [],
		AssignableScopes: ['/']
	};

	it('explains a PowerShell-style definition', () => {
		const r = explain(JSON.stringify(contributor)) as AzureRole;
		expect(r.kind).toBe('azure');
		expect(r.name).toBe('Contributor');
		expect(r.custom).toBe(false);
		expect(azureAllows(r, 'Microsoft.Compute/virtualMachines/write', false)).toBe(true);
		expect(azureAllows(r, 'Microsoft.Authorization/roleAssignments/write', false)).toBe(false);
		const t = r.findings.map((f) => f.text).join('|');
		expect(t).toMatch(/minus NotActions/);
		expect(t).not.toMatch(/role assignments/);
		expect(t).toMatch(/Assignable at "\/"/);
		expect(t).toMatch(/not a deny/);
	});

	it('explains the ARM / az CLI shape and flags role assignment rights', () => {
		const r = explain(
			JSON.stringify({
				properties: {
					roleName: 'Helpdesk',
					type: 'CustomRole',
					permissions: [
						{
							actions: ['Microsoft.Authorization/roleAssignments/*', '*/read'],
							notActions: [],
							dataActions: ['*'],
							notDataActions: []
						}
					],
					assignableScopes: ['/subscriptions/0000/resourceGroups/rg1']
				}
			})
		) as AzureRole;
		expect(r.custom).toBe(true);
		expect(r.scopes).toEqual(['/subscriptions/0000/resourceGroups/rg1']);
		const t = r.findings.map((f) => f.text).join('|');
		expect(t).toMatch(/roleAssignments\/write/);
		expect(t).toMatch(/DataActions "\*"/);
		expect(azureAllows(r, 'Microsoft.Storage/storageAccounts/read', false)).toBe(true);
	});
});

describe('detect', () => {
	it('is specific', () => {
		expect(looksLikePolicy('{"Version":"2012-10-17","Statement":[{"Effect":"Allow"}]}')).toBe(0.9);
		expect(looksLikePolicy('{"assignableScopes":["/"],"permissions":[]}')).toBe(0.9);
		expect(looksLikePolicy('{"a":1}')).toBe(0);
		expect(looksLikePolicy('{"Statement": [ "Effect": }')).toBe(0);
	});
});
