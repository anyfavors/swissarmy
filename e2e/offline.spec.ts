import { expect, test } from './fixtures';

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

test('a new deploy is shown on the next load, not a cached page', async ({
	page,
	context,
	browserName
}) => {
	test.skip(browserName !== 'chromium');
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	// Simulate a newer deploy of /cidr: the service worker must ask the network before its cache.
	await context.route('**/cidr', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Fresh deploy</h1>' })
	);
	await page.goto('/cidr');
	await expect(page.locator('h1')).toHaveText('Fresh deploy');
});
