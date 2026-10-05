import type { ToolMeta } from '../types';
import { looksLikeSemver } from './detect';

export const meta: ToolMeta = {
	id: 'semver',
	chapter: 9,
	section: 3,
	title: 'Semver',
	summary:
		'Parse and sort SemVer 2.0.0 versions and test npm ranges (^ ~ x || hyphen) against a list.',
	keywords: [
		'semantic versioning',
		'version',
		'npm',
		'range',
		'caret',
		'tilde',
		'package.json',
		'dependency',
		'pre-release',
		'compare',
		'sort'
	],
	network: false,
	detect: looksLikeSemver,
	chain: { in: 'text', out: 'text' }
};
