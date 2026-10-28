import {test, expect} from '@playwright/test';
import {visit, windowOf, focusedWindow, openTerminal, terminalText, run} from './helpers';

const screen = page => page.locator('.console .xterm-rows');

test('runs what is typed at the prompt', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'echo hello from the e2e tests');
	await expect(screen(page)).toContainText('hello from the e2e tests');
	await run(page, 'pwd');
	await expect(screen(page)).toContainText('/home/robin/portfolio');
	await run(page, 'ls');
	await expect(screen(page)).toContainText('contact.yml');
	await expect(screen(page)).toContainText('whoami.txt');
});

test('keeps output that didn\'t end its line, with the prompt after it', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'printf unended');
	await expect(screen(page)).toContainText('unendedrobin@robinj.be:~/portfolio$');
	await run(page, 'echo ran-$((6 * 7))');
	await expect(screen(page)).toContainText('ran-42');
	await expect(screen(page)).toContainText('unendedrobin@robinj.be:~/portfolio$ echo ran-');
});

test('recalls earlier commands with the up arrow', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'echo first-$((20 + 22))');
	await expect(screen(page)).toContainText('first-42');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('Enter');
	await expect.poll(async () => (await terminalText(page)).split('first-42').length - 1).toBe(2);
});

test('shows the open windows as processes, and closes the one it kills', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'ps -e');
	await expect(screen(page)).toContainText(/\bweb\b/);
	await expect(screen(page)).toContainText(/\bterminal\b/);

	await run(page, 'pkill web');
	await expect(windowOf(page, 'Website')).toHaveCount(0);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Terminal');
});

test('opens a file in the editor', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'open contact.yml');
	await expect(page).toHaveURL('/contact');
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
});

test('closes its window when the shell exits', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'exit');
	await expect(windowOf(page, 'Terminal')).toHaveCount(0);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
});

test('keeps typed passwords off the screen', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'sudo ls');
	await expect(screen(page)).toContainText('[sudo] password for robin:');
	await run(page, 'hunter2');
	await expect(screen(page)).toContainText('Sorry, try again.');
	expect(await terminalText(page)).not.toContain('hunter2');
});

test('focuses the terminal for the on-screen keyboard when tapped', async ({page, hasTouch}) => {
	test.skip(!hasTouch, 'Touchscreens only');
	await visit(page, '/cv');
	await openTerminal(page);
	await page.evaluate(() => document.activeElement.blur());

	await page.locator('.console-screen').tap();

	await expect.poll(() => page.evaluate(() => document.activeElement?.className)).toContain('xterm-helper-textarea');
});

test('fades in with its background blur growing, never switched off', async ({page}) => {
	await visit(page, '/cv');

	const frames = await page.evaluate(() => new Promise(resolve => {
		const seen = [];
		const sample = () => {
			const terminal = document.querySelector('.console');
			if (terminal) {
				let seeThrough = false;
				for (let el = terminal; el; el = el.parentElement) {
					seeThrough ||= getComputedStyle(el).opacity !== '1';
				}
				seen.push({seeThrough, blur: parseFloat(getComputedStyle(terminal).backdropFilter.match(/blur\(([\d.]+)px\)/)[1])});
			}
			if (seen.length < 30) {
				requestAnimationFrame(sample);
			} else {
				resolve(seen);
			}
		};
		document.querySelector('.dt-dock-item[data-win="console"]').click();
		requestAnimationFrame(sample);
	}));

	expect(frames.filter(frame => frame.seeThrough)).toEqual([]);
	expect(frames.some(frame => frame.blur > 0 && frame.blur < 20)).toBe(true);
	await expect.poll(() => page.locator('.console').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur(20px)');
});

test('fits its screen to the window', async ({page}) => {
	await visit(page, '/cv');
	await openTerminal(page);

	const fits = await page.evaluate(() => {
		const outer = document.querySelector('.console-screen').getBoundingClientRect();
		const rows = document.querySelector('.console .xterm-screen').getBoundingClientRect();
		return rows.width <= outer.width && rows.height <= outer.height && rows.width > outer.width - 40;
	});
	expect(fits).toBe(true);
});

test('sets the terminal and the system console in smaller text on a narrow upright screen', async ({page, viewport}) => {
	const upright = viewport.width < 900 && viewport.height > viewport.width;
	await page.clock.install();
	await visit(page, '/cv');
	await openTerminal(page);

	expect(await screen(page).evaluate(el => getComputedStyle(el).fontSize)).toBe(upright ? '11.5px' : '13.5px');
	await run(page, 'poweroff');
	await expect(page.getByRole('log', {name: 'System console'})).toBeVisible();
	expect(await page.locator('.dt-tty pre').evaluate(el => getComputedStyle(el).fontSize)).toBe(upright ? '11.5px' : '14px');
});

test('powers off, and boots back into Activities', async ({page}) => {
	await page.clock.install();
	await visit(page, '/cv');
	await openTerminal(page);

	await run(page, 'poweroff');
	await expect(page.getByRole('log', {name: 'System console'})).toBeVisible();
	await page.clock.runFor(30_000);
	await expect(page.locator('.dt-window')).toHaveCount(0);

	await page.getByRole('button', {name: 'Power on'}).click();
	await page.clock.runFor(30_000);
	await expect(page.getByRole('log', {name: 'System console'})).toHaveCount(0);
	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect(page.locator('.dt-topbar')).toBeVisible();
});
