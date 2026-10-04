import { expect, test } from '@playwright/test';

test('every page works offline after the first visit', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium');
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	// Check the cache itself, so the test cannot pass on the browser's HTTP cache.
	const cached = await page.evaluate(async () => {
		const keys = (
			await Promise.all((await caches.keys()).map(async (k) => (await caches.open(k)).keys()))
		).flat();
		return keys.map((r) => new URL(r.url).pathname);
	});
	for (const path of ['/', '/cron', '/chain', '/service-worker.js'])
		expect(cached.includes(path), `${path} precached`).toBe(path !== '/service-worker.js');

	await context.setOffline(true);
	for (const path of ['/cron', '/certificate', '/password', '/chain', '/']) {
		await page.goto(path);
		await expect(page.locator('h1').first()).toBeVisible();
	}
	await page.goto('/password');
	await page.getByRole('button', { name: 'Passphrase' }).click();
	await expect(page.locator('main')).toContainText(/\d+(\.\d+)? bits/);
});
