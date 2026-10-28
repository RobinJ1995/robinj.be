import {test, expect} from '@playwright/test';
import {visit, openTerminal, run} from './helpers';

const screen = page => page.locator('.console .xterm-rows');
const cup = page => page.getByRole('img', {name: 'Caffeine loaded'});

// GitHub's answer for the last commit on master.
const COMMIT = {
	sha: 'c0ffee1234567890abcdef1234567890abcdef12',
	commit: {author: {name: 'Robin Jacobs', email: 'robin@robinj.be', date: '2026-10-27T12:00:00Z'}, message: 'an e2e commit'},
	files: [{filename: 'e2e/commands.spec.js', additions: 3, deletions: 1}],
};

const start = async page => {
	await visit(page, '/cv');
	await openTerminal(page);
};

// Expected output is never in the command that prints it, so the command's own echo can't pass for it.
test('cuts fields and runs awk programs', async ({page}) => {
	await start(page);

	await run(page, 'cut -d: -f1,6 /etc/passwd | tail -1');
	await expect(screen(page)).toContainText('robin:/home/robin');
	await run(page, 'awk -F: \'$3 >= 1000 { print "user", $1 }\' /etc/passwd');
	await expect(screen(page)).toContainText('user robin');
	await run(page, 'seq 5 | awk \'{ s += $1 } END { print "sum", s }\'');
	await expect(screen(page)).toContainText('sum 15');
});

test('stops an endless awk loop on ^C', async ({page}) => {
	await start(page);

	await run(page, 'awk \'BEGIN { print "loop" "ing"; while (1) n++ }\'');
	await expect(screen(page)).toContainText('looping');
	await page.keyboard.press('Control+c');
	await run(page, 'echo awk $?');
	await expect(screen(page)).toContainText('awk 130');
});

test('tells fortunes, and about Robin', async ({page}) => {
	await start(page);

	await run(page, 'fortune > /dev/null && echo told $(fortune --about-me | wc -l)');
	await expect(screen(page)).toContainText('told 2');
});

test('reads endless devices as far as asked, and stops them on ^C', async ({page}) => {
	await start(page);

	await run(page, 'echo zero $(head -c 8 /dev/zero | wc -c)');
	await expect(screen(page)).toContainText('zero 8');
	await run(page, 'echo $(yes e2e | head -3)');
	await expect(screen(page)).toContainText('e2e e2e e2e');

	await run(page, 'echo random $(head -c 16 /dev/urandom | wc -m)');
	await expect(screen(page)).toContainText('random 16');

	await run(page, 'yes');
	await expect(screen(page)).toContainText('y'.repeat(10));
	await page.keyboard.press('Control+c');
	await run(page, 'echo back $?');
	await expect(screen(page)).toContainText('back 130');
});

test('fetches with curl, without the visitor\'s cookies or the page as referrer', async ({page, context, baseURL}) => {
	await context.addCookies([{name: 'visitor', value: 'secret', url: baseURL}]);
	const requests = {};
	await page.route('**/e2e-echo/*', async route => {
		requests[route.request().url().split('/').pop()] = await route.request().allHeaders();
		await route.fulfill({body: 'hello from the test server\n'});
	});
	await start(page);

	// What the page itself would send, for comparison.
	await page.evaluate(() => fetch('/e2e-echo/page'));
	expect(requests.page).toMatchObject({cookie: 'visitor=secret', referer: expect.stringContaining('/cv')});

	await run(page, `curl -s ${baseURL}/e2e-echo/curl`);
	await expect(screen(page)).toContainText('hello from the test server');
	expect(requests.curl.cookie).toBeUndefined();
	expect(requests.curl.referer).toBeUndefined();
});

test('fails like curl when the browser can\'t reach a server', async ({page}) => {
	await page.route('https://nowhere.test/**', route => route.abort('connectionrefused'));
	await start(page);

	await run(page, 'curl https://nowhere.test/; echo exit $?');
	await expect(screen(page)).toContainText('curl: (7) Failed to connect');
	await expect(screen(page)).toContainText('exit 7');
	await expect(screen(page)).not.toContainText('browser');
});

test('has wget once it is installed', async ({page, baseURL}) => {
	await page.route('**/e2e-echo/*', route => route.fulfill({body: 'fetched by wget\n'}));
	await start(page);

	await run(page, 'wget');
	await expect(screen(page)).toContainText('wget: command not found');
	await run(page, 'sudo dnf install -y wget');
	await expect(screen(page)).toContainText('Complete!', {timeout: 15_000});
	await run(page, `wget -qO- ${baseURL}/e2e-echo/wget`);
	await expect(screen(page)).toContainText('fetched by wget');
});

test('has the site\'s own repository checked out, at GitHub\'s last commit', async ({page}) => {
	await page.route('https://api.github.com/repos/RobinJ1995/robinj.be/commits/master', route => route.fulfill({
		json: COMMIT, headers: {'access-control-allow-origin': '*'},
	}));
	await start(page);

	await run(page, 'git log --oneline');
	await expect(screen(page)).toContainText('c0ffee1');
	await expect(screen(page)).toContainText('an e2e commit');
	await run(page, 'git status');
	await expect(screen(page)).toContainText('working tree clean');
	await run(page, 'echo found $(ls -a | grep \'^\\.git$\')');
	await expect(screen(page)).toContainText('found .git');
});

test.describe('the caffeine module', () => {
	test('gives the desktop the jitters while it\'s loaded', async ({page}) => {
		await start(page);

		await run(page, 'sudo modprobe caffeine');
		await expect(page.locator('.desktop')).toHaveClass(/is-caffeinated/);
		await expect(cup(page)).toBeVisible();
		const jittering = () => page.locator('.dt-window.is-focused .dt-window-frame').evaluate(el => el.getAnimations().some(a => a.animationName === 'dt-jitter'));
		expect(await jittering()).toBe(true);
		// Loaded, and used by oxidize.
		await run(page, 'echo listed $(lsmod | grep -c caffeine)');
		await expect(screen(page)).toContainText('listed 2');

		await run(page, 'sudo rmmod caffeine');
		await expect(page.locator('.desktop')).not.toHaveClass(/is-caffeinated/);
		await expect(cup(page)).toHaveCount(0);
		expect(await jittering()).toBe(false);
	});

	test('wears off when the kernel panics, from taking out any other module', async ({page}) => {
		await page.clock.install();
		await start(page);

		await run(page, 'sudo modprobe caffeine');
		await expect(cup(page)).toBeVisible();
		await run(page, 'sudo rmmod nvme');
		await expect(page.getByRole('log', {name: 'System console'})).toContainText('Kernel panic - not syncing: Fatal exception');
		await page.clock.runFor(10_000);
		await page.getByRole('button', {name: 'Power on'}).click();
		await page.clock.runFor(30_000);

		await expect(page.locator('.dt-topbar')).toBeVisible();
		await expect(page.locator('.desktop')).not.toHaveClass(/is-caffeinated/);
		await expect(cup(page)).toHaveCount(0);
	});
});
