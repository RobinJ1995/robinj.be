import {defineConfig, devices} from '@playwright/test';
import fs from 'node:fs';

const PORT = 4173;
const IMAGE = 'robinj-be:e2e';
const CONTAINER = 'robinj-be-e2e';

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
	// Every spec runs at each size; the ones about floating or maximised windows skip
	// the sizes they're not about (isSmall in e2e/helpers.js).
	projects: [
		{name: 'desktop', use: {...devices['Desktop Chrome'], launchOptions}},
		// Maximised for being short, with the website in two columns.
		{name: 'desktop-short', use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 560}, launchOptions}},
		{name: 'tablet', use: {...devices['Galaxy Tab S4'], launchOptions}},
		{name: 'phone', use: {...devices['Pixel 7'], launchOptions}},
		{name: 'phone-landscape', use: {...devices['Pixel 7 landscape'], launchOptions}},
	],
	webServer: {
		command: `docker rm -f ${CONTAINER} >/dev/null 2>&1; docker build -t ${IMAGE} . && docker run --rm --name ${CONTAINER} -p ${PORT}:80 ${IMAGE}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
		gracefulShutdown: {signal: 'SIGTERM', timeout: 10_000},
	},
});
