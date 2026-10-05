import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'sddl',
	chapter: 13,
	section: 4,
	title: 'SDDL and ACL decoder',
	summary:
		'Read SDDL security descriptors as an ACL table with named trustees, rights and object GUIDs, and flag risky ACEs.',
	keywords: [
		'sddl',
		'security descriptor',
		'acl',
		'dacl',
		'sacl',
		'ace',
		'permissions',
		'ntfs',
		'active directory',
		'get-acl',
		'sc sdshow',
		'genericall',
		'writedacl',
		'writeowner',
		'dcsync',
		'replication',
		'force change password',
		'object guid',
		'mandatory label'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
