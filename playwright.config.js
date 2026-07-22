import {defineConfig, devices} from '@playwright/test';
import fs from 'node:fs';

const PORT = 4173;

// Use the browser pre-installed in the dev/runtime image when present; in CI we
// rely on `npx playwright install chromium` fetching the matching build instead.
const preinstalledChromium = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(preinstalledChromium)
	? {executablePath: preinstalledChromium}
	: {};

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.js',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
	},
	projects: [
		{name: 'chromium', use: {...devices['Desktop Chrome'], launchOptions}},
	],
	webServer: {
		command: `node e2e/serve.js`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
});
