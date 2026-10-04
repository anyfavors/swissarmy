import { expect, test } from '@playwright/test';

test('every page works offline after the first visit', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium');
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	for (const path of ['/cron', '/certificate', '/password', '/chain', '/']) {
		await page.goto(path);
		await expect(page.locator('h1').first()).toBeVisible();
	}
	await page.goto('/password');
	await page.getByRole('button', { name: 'Passphrase' }).click();
	await expect(page.locator('main')).toContainText(/\d+(\.\d+)? bits/);
});
