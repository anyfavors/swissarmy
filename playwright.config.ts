import { defineConfig, devices } from '@playwright/test';

const port = 4174;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		// Lets a pre-installed Chromium be used instead of a downloaded one.
		launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
	},
	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
		},
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: `node scripts/serve.js`,
		env: { PORT: String(port) },
		port,
		reuseExistingServer: !process.env.CI
	}
});
