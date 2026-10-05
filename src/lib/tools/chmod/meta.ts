import type { ToolMeta } from '../types';

export const meta: ToolMeta = {
	id: 'chmod',
	chapter: 9,
	section: 2,
	title: 'chmod calculator',
	summary:
		'Unix permissions between checkboxes, octal (4755), symbolic (-rwsr-xr-x) and chmod forms, plus umask.',
	keywords: [
		'permissions',
		'unix',
		'linux',
		'octal',
		'rwx',
		'umask',
		'setuid',
		'setgid',
		'sticky',
		'755',
		'644',
		'ls -l'
	],
	network: false,
	chain: { in: 'text', out: 'text' }
};
