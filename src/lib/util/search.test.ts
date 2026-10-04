import { describe, expect, it } from 'vitest';
import { detectTools, searchTools } from './search';
import { tools } from '../tools/registry';

describe('search', () => {
	it('finds tools by title, keyword and number', () => {
		expect(searchTools('subnet', tools)[0].id).toBe('cidr');
		expect(searchTools('epoch', tools)[0].id).toBe('timestamp');
		expect(searchTools('1-01', tools)[0].id).toBe('base64');
		expect(searchTools('b64', tools)[0].id).toBe('base64');
	});

	it('returns nothing for nonsense', () => {
		expect(searchTools('zzzqqq', tools)).toEqual([]);
	});

	it('routes pasted values to the right tool', () => {
		expect(detectTools('10.0.0.0/8', tools)[0].tool.id).toBe('cidr');
		expect(detectTools('1700000000', tools)[0].tool.id).toBe('timestamp');
		expect(detectTools('SGVsbG8gd29ybGQ=', tools)[0].tool.id).toBe('base64');
	});
});
