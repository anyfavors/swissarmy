import { expect, test } from '@playwright/test';
import { open, setValue, watch } from './helpers';

test.use({ serviceWorkers: 'block' });

test.describe('intake routes pasted values', () => {
	const cases: [string, string][] = [
		['10.20.0.0/22', 'cidr'],
		['2001:db8::1', 'ip'],
		['1791115200', 'timestamp'],
		['SGVsbG8gd29ybGQ=', 'base64'],
		['{"a":1}', 'json'],
		['*/15 * * * *', 'cron'],
		['0xff', 'number-base'],
		['example.com', 'dns'],
		['v=spf1 include:_spf.google.com ~all', 'spf'],
		['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 'cvss'],
		['S-1-5-21-3623811015-3361044348-30300820-1013', 'sid'],
		['arn:aws:iam::123456789012:role/admin', 'cloud-id'],
		[
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
			'jwt'
		]
	];
	for (const [value, tool] of cases) {
		test(`${value.slice(0, 24)} goes to ${tool}`, async ({ page }) => {
			await open(page, '/');
			await setValue(page, '#intake', value);
			await page.locator('.matches a').first().click();
			await expect(page).toHaveURL(new RegExp(`/${tool}(#|$)`));
			await expect(page.locator('h1')).toBeVisible();
		});
	}
});

test('pasted intake text never goes into the URL', async ({ page }) => {
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
	const urls: string[] = [];
	page.on('framenavigated', (f) => urls.push(f.url()));
	await open(page, '/');
	await setValue(page, '#intake', jwt);
	await page.locator('.matches a').first().click();
	await expect(page.locator('main')).toContainText('1234567890');
	expect(urls.concat(page.url()).filter((u) => u.includes('eyJ'))).toEqual([]);
});

test('tokens are not left in the address bar', async ({ page }) => {
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
	await open(page, `/jwt#in=${jwt}`);
	await expect(page.locator('main')).toContainText('1234567890');
	await expect.poll(() => new URL(page.url()).hash).toBe('');
});

test('command palette finds and opens a tool', async ({ page, isMobile }) => {
	await open(page, '/');
	if (isMobile) await page.getByRole('button', { name: /search/i }).click();
	else await page.keyboard.press('Control+k');
	await page.keyboard.type('subnet');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/cidr(#|$)/);
});

test('regex tester stops catastrophic backtracking', async ({ page }) => {
	const problems = watch(page);
	await open(page, '/regex');
	await page.locator('input[type=text]').first().fill('(a+)+$');
	await page
		.locator('textarea')
		.first()
		.fill('a'.repeat(40) + '!');
	await expect(page.locator('main')).toContainText(/too long/i, { timeout: 5000 });
	expect(problems.filter((p) => !p.includes('Service Worker'))).toEqual([]);
});

test('diff stays responsive with large input', async ({ page }) => {
	await open(page, '/diff');
	const a = Array.from({ length: 6000 }, (_, i) => `line ${i} some text here`).join('\n');
	const b = a
		.replace('line 2500 some', 'line 2500 CHANGED')
		.replace('line 10 some text here\n', '');
	await setValue(page, 'textarea:nth-of-type(1)', a);
	await page
		.locator('textarea')
		.nth(1)
		.evaluate((el, v) => {
			(el as HTMLTextAreaElement).value = v;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}, b);
	await expect(page.locator('main')).toContainText('+1 added', { timeout: 5000 });
	await expect(page.locator('main')).toContainText('-2 removed');
});

test('chain runs an example recipe and keeps it in the link', async ({ page }) => {
	await open(page, '/chain');
	await page.getByRole('button', { name: 'Base64 to tidy JSON' }).click();
	await expect(page.locator('.final pre')).toContainText('"roles"');
	await expect
		.poll(() => decodeURIComponent(new URL(page.url()).hash))
		.toContain('ops=base64.decode,json.sort');
	await page.reload();
	await expect(page.locator('.step')).toHaveCount(2);
});

test('DNS lookup only contacts the resolver when asked', async ({ page }) => {
	const calls: string[] = [];
	await page.route(/cloudflare-dns\.com|dns\.google/, (route) => {
		calls.push(route.request().url());
		return route.fulfill({
			status: 200,
			contentType: 'application/dns-json',
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify({
				Status: 0,
				TC: false,
				RD: true,
				RA: true,
				AD: true,
				CD: false,
				Question: [{ name: 'example.com.', type: 1 }],
				Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.215.14' }]
			})
		});
	});
	await open(page, '/dns#in=example.com');
	await page.waitForTimeout(500);
	expect(calls, 'no request on page load').toEqual([]);
	await page.locator('input[type=text]').first().fill('example.org');
	await page.waitForTimeout(300);
	expect(calls, 'no request while typing').toEqual([]);
	await page.locator('form button[type=submit]').first().click();
	await expect(page.locator('main')).toContainText('93.184.215.14');
	expect(calls).toHaveLength(1);
	expect(calls[0]).toContain('https://cloudflare-dns.com/dns-query?name=example.org');
});
