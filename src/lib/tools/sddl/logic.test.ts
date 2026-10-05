import { describe, expect, it } from 'vitest';
import {
	explainText,
	guessContext,
	inheritText,
	isBroad,
	looksLikeSddl,
	maskNames,
	maskSummary,
	parseSddl,
	rightsText,
	trustee
} from './logic';
import { ops } from './ops';

const DCSYNC = '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2';
const GETCH = '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2';

describe('parsing', () => {
	it('reads owner, group and a protected DACL', () => {
		const d = parseSddl('O:BAG:SYD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)');
		expect(d.owner?.name).toBe('BUILTIN\\Administrators');
		expect(d.group?.name).toBe('Local System');
		expect(d.dacl?.flags).toEqual(['P', 'AI']);
		expect(d.dacl?.aces).toHaveLength(3);
		expect(d.ctx).toBe('file');
		const bu = d.dacl!.aces[2];
		expect(bu.mask).toBe(0x1200a9);
		expect(rightsText(bu, 'file')).toMatch(/^Read and execute/);
		expect(inheritText(bu)).toBe('This object, containers, objects');
		expect(d.risks).toEqual([]);
	});
	it('splits components even when aliases end in a marker letter', () => {
		const d = parseSddl('O:DDG:DDD:(A;;GA;;;DD)');
		expect(d.owner?.name).toBe('Domain Controllers');
		expect(d.group?.alias).toBe('DD');
		expect(d.dacl?.aces[0].trustee.relative).toBe(true);
	});
	it('reads SID strings and names them', () => {
		const d = parseSddl('O:S-1-5-21-1-2-3-512D:(A;;FA;;;S-1-5-21-1-2-3-1105)');
		expect(d.owner?.name).toBe('Domain Admins');
		expect(d.dacl?.aces[0].trustee.name).toBe('RID 1105');
	});
	it('reads a bare ACE list as a DACL', () => {
		const d = parseSddl('(A;;FA;;;SY)(A;;FR;;;BU)');
		expect(d.dacl?.aces.map((a) => a.trustee.alias)).toEqual(['SY', 'BU']);
	});
	it('reads a SACL with audit and mandatory label ACEs', () => {
		const d = parseSddl('S:AI(AU;SAFA;FA;;;WD)(ML;;NW;;;LW)');
		expect(d.sacl?.flags).toEqual(['AI']);
		expect(d.sacl?.aces[0].flags).toEqual(['SA', 'FA']);
		expect(d.sacl?.aces[1].typeName).toBe('Mandatory label');
		expect(rightsText(d.sacl!.aces[1], d.ctx)).toBe('NoWriteUp');
		expect(d.sacl?.aces[1].trustee.name).toBe('Low integrity level');
	});
	it('reads conditional ACEs with a condition', () => {
		const d = parseSddl('D:(XA;;FX;;;S-1-1-0;(@User.Title=="PM"))');
		expect(d.dacl?.aces[0].extra).toBe('(@User.Title=="PM")');
		expect(d.dacl?.aces[0].typeName).toBe('Allow (conditional)');
	});
	it('names object GUIDs', () => {
		const d = parseSddl(
			`D:(OA;CIIO;WP;bf9679c0-0de6-11d0-a285-00aa003049e2;bf967a9c-0de6-11d0-a285-00aa003049e2;PS)`
		);
		const a = d.dacl!.aces[0];
		expect(a.objectName).toMatch(/^member/);
		expect(a.inheritName).toBe('group');
		expect(inheritText(a)).toBe('Children only, containers');
		expect(d.ctx).toBe('ds');
	});
	it('reports errors', () => {
		expect(() => parseSddl('')).toThrow(/Paste an SDDL/);
		expect(() => parseSddl('hello')).toThrow(/No O:, G:, D: or S:/);
		expect(() => parseSddl('D:(Q;;FA;;;SY)')).toThrow(/Unknown ACE type "Q"/);
		expect(() => parseSddl('D:(A;;ZZ;;;SY)')).toThrow(/Unknown access right "ZZ"/);
		expect(() => parseSddl('D:(A;;FA;;;SY')).toThrow(/not closed/);
		expect(() => parseSddl('D:(A;;FA;;SY)')).toThrow(/six fields/);
		expect(() => parseSddl('D:(A;;FA;;;XX)')).toThrow(/neither a SID alias/);
		expect(() => parseSddl('D:(A;;FA;;;SY)D:(A;;FA;;;SY)')).toThrow(/appears twice/);
		expect(() => parseSddl('D:QQ(A;;FA;;;SY)')).toThrow(/Unknown ACL flag/);
	});
	it('keeps unknown ACE flags visible', () => {
		const d = parseSddl('D:(A;OIZZ;FA;;;SY)');
		expect(d.dacl?.aces[0].unknownFlags).toEqual(['ZZ']);
	});
});

describe('rights', () => {
	it('names bits per object type', () => {
		expect(maskNames(0x1f01ff, 'file')).toContain('WriteDACL');
		expect(maskSummary(0x1f01ff, 'file')).toBe('Full control');
		expect(maskSummary(0x1301bf, 'file')).toBe('Modify');
		expect(maskSummary(0xf01ff, 'ds')).toBe('Full control');
		expect(maskSummary(0x20094, 'ds')).toBe('Generic read');
		expect(maskNames(0x130, 'ds')).toEqual(['ReadProperty', 'WriteProperty', 'ControlAccess']);
		expect(maskNames(0x2, 'svc')).toEqual(['ChangeConfig']);
		expect(maskNames(0x400, 'generic')).toEqual(['0x400']);
		expect(maskNames(0x10000000, 'generic')).toEqual(['GenericAll']);
	});
	it('guesses the object type', () => {
		const svc = parseSddl('D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)');
		expect(svc.ctx).toBe('svc');
		expect(rightsText(svc.dacl!.aces[1], 'svc')).toMatch(/^Full control/);
		expect(parseSddl('O:DAD:(A;;RPWP;;;DA)').ctx).toBe('ds');
		expect(parseSddl('D:(A;;KA;;;SY)').ctx).toBe('reg');
		expect(parseSddl('D:(A;;GA;;;SY)').ctx).toBe('generic');
		expect(guessContext([])).toBe('generic');
	});
	it('accepts the context as a parameter', () => {
		expect(parseSddl('D:(A;;CC;;;SY)', 'svc').ctx).toBe('svc');
	});
});

describe('trustees', () => {
	it('knows the broad groups', () => {
		for (const a of ['WD', 'AU', 'AN', 'BU', 'DU', 'DC', 'BG'])
			expect(isBroad(trustee(a))).toBe(true);
		for (const a of ['SY', 'BA', 'DA', 'EA', 'CO', 'PS']) expect(isBroad(trustee(a))).toBe(false);
		expect(isBroad(trustee('S-1-5-21-1-2-3-513'))).toBe(true);
		expect(isBroad(trustee('S-1-1-0'))).toBe(true);
	});
});

describe('risks', () => {
	it('flags GenericAll for Everyone', () => {
		const d = parseSddl('D:(A;;GA;;;WD)');
		expect(d.risks).toHaveLength(1);
		expect(d.risks[0]).toMatchObject({ severity: 'high' });
		expect(d.risks[0].text).toMatch(/Everyone has GenericAll/);
	});
	it('flags WriteDACL and WriteOwner for Authenticated Users', () => {
		const d = parseSddl('O:DAD:(A;;WDWO;;;AU)');
		expect(d.risks.map((r) => r.severity)).toEqual(['high', 'high']);
	});
	it('does not flag deny ACEs or admins', () => {
		expect(parseSddl('D:(D;;GA;;;WD)').risks).toEqual([]);
		expect(parseSddl('D:(A;;GA;;;BA)(A;;GA;;;SY)').risks).toEqual([]);
	});
	it('flags DCSync rights for a non-default account', () => {
		const d = parseSddl(
			`O:DAD:(OA;;CR;${DCSYNC};;S-1-5-21-1-2-3-1105)(OA;;CR;${GETCH};;S-1-5-21-1-2-3-1105)(OA;;CR;${DCSYNC};;DD)(OA;;CR;${DCSYNC};;BA)`
		);
		expect(d.risks.map((r) => r.severity)).toEqual(['high', 'medium']);
		expect(d.risks[0].text).toMatch(/DCSync/);
	});
	it('flags force password reset and group membership writes for broad groups', () => {
		const d = parseSddl(
			'O:DAD:(OA;;CR;00299570-246d-11d0-a768-00aa006e0529;;AU)(OA;;WP;bf9679c0-0de6-11d0-a285-00aa003049e2;;DU)'
		);
		expect(d.risks.map((r) => r.severity)).toEqual(['high', 'high']);
		expect(d.risks[1].text).toMatch(/add members/);
	});
	it('flags a null DACL and a broad owner', () => {
		expect(parseSddl('D:NO_ACCESS_CONTROL').risks[0].text).toMatch(/null DACL/);
		expect(parseSddl('O:WDD:(A;;FA;;;SY)').risks[0].text).toMatch(/Owner is Everyone/);
		expect(parseSddl('D:P').risks[0].severity).toBe('info');
	});
	it('flags a service anyone can reconfigure', () => {
		const d = parseSddl('D:(A;;CCDCLCSWRPWPDTLOCRRC;;;AU)');
		expect(d.ctx).toBe('svc');
		expect(d.risks.some((r) => /change the service configuration/.test(r.text))).toBe(true);
	});
	it('flags file write for Users', () => {
		const d = parseSddl('D:(A;OICI;0x1301bf;;;BU)', 'file');
		expect(d.risks.map((r) => r.severity)).toEqual(['medium', 'medium']);
	});
});

describe('text and detection', () => {
	it('explains in lines', () => {
		const t = explainText(parseSddl('O:BAD:(A;;GA;;;WD)'));
		expect(t).toContain('Owner: BUILTIN\\Administrators');
		expect(t).toContain('Allow  Everyone  GenericAll');
		expect(t).toContain('HIGH: Everyone has GenericAll.');
	});
	it('runs as a chain op', async () => {
		const op = ops.find((o) => o.id === 'sddl.explain')!;
		expect(await op.run('D:(A;;FA;;;SY)')).toMatch(/Local System/);
		expect(() => op.run('nope')).toThrow(/No O:/);
	});
	it('recognises SDDL', () => {
		expect(looksLikeSddl('O:BAG:SYD:PAI(A;OICI;FA;;;SY)')).toBeGreaterThan(0.9);
		expect(looksLikeSddl('(A;;FA;;;SY)(A;;FR;;;BU)')).toBeGreaterThan(0.8);
		expect(looksLikeSddl('D:(A;;GA;;;WD)')).toBeGreaterThan(0.9);
		expect(looksLikeSddl('hello world')).toBe(0);
		expect(looksLikeSddl('10.0.0.0/8')).toBe(0);
		expect(looksLikeSddl('(a;b)')).toBe(0);
	});
});
