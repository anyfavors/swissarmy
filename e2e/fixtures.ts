import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * Every test gets the statistics script replaced by an empty one, so test runs neither
 * depend on t.vo.rs being reachable nor show up as page views.
 */
export const test = base.extend({
	context: async ({ context }, use) => {
		await context.route('https://t.vo.rs/**', (route) =>
			route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
		);
		await use(context);
	}
});
