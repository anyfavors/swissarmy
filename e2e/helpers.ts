import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/** Every prerendered page, taken from the build so new tools are covered automatically. */
export const pages: string[] = readdirSync(join(import.meta.dirname, '..', 'build'))
	.filter((f) => f.endsWith('.html'))
	.map((f) => (f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`))
	.sort();

/** Collects console errors and warnings (CSP violations are reported there) and uncaught errors. */
export function watch(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
	});
	page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
	return problems;
}

/** Sets a textarea or input value in one go. Playwright's fill() stalls on very large text. */
export async function setValue(page: Page, selector: string, value: string): Promise<void> {
	await page
		.locator(selector)
		.first()
		.evaluate((el, v) => {
			(el as HTMLInputElement).value = v;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}, value);
}
