import { expect, test } from '@playwright/test';
import { pages, watch } from './helpers';

test.use({ serviceWorkers: 'block' });

for (const scheme of ['light', 'dark'] as const) {
	test.describe(`${scheme} edition`, () => {
		test.use({ colorScheme: scheme });

		for (const path of pages) {
			test(`${path} renders cleanly`, async ({ page }) => {
				const problems = watch(page).filter(
					(p) => !p.includes('Service Worker registration blocked')
				);
				await page.goto(path);
				await expect(page.locator('h1').first()).toBeVisible();
				await page.waitForTimeout(150);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - window.innerWidth
				);
				expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
				expect(problems).toEqual([]);
			});
		}
	});
}

test('sends the security headers', async ({ request }) => {
	const res = await request.get('/');
	const csp = res.headers()['content-security-policy'];
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("connect-src 'self' https://cloudflare-dns.com https://dns.google");
	expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
