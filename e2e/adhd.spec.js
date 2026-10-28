import {test, expect} from '@playwright/test';
import {visit, box, openTerminal, run, windowOf, focusedWindow, dockItem, isSmall, settled, worksAsUsual} from './helpers';

// Lets the page's clock run in steps until `check` passes, as the mode waits a
// random while between whims.
const until = async (page, check, ms = 60_000) => {
	for (let waited = 0; waited < ms; waited += 250) {
		if (await check()) {
			return;
		}
		await page.clock.runFor(250);
	}
	expect(await check()).toBe(true);
};

const addresses = page => windowOf(page, 'Website').locator('.dt-address').allTextContents();
const near = (actual, expected) => Object.keys(expected).every(key => Math.abs(actual[key] - expected[key]) < 1);

test('drives the desktop by itself until the adhd module is unloaded, ending up reading Wikipedia', async ({page, viewport}) => {
	let lookups = 0;
	await page.route('https://en.wikipedia.org/w/api.php?**', route => {
		lookups++;
		return route.fulfill({
			json: {parse: {title: new URL(route.request().url()).searchParams.get('page'), sections: [{line: 'History', anchor: 'History'}, {line: 'External links', anchor: 'External_links'}], links: [{ns: 4, title: 'Wikipedia:About', exists: true}, {ns: 0, title: 'Unix', exists: true}]}},
			headers: {'access-control-allow-origin': '*'},
		});
	});
	await page.route('https://en.wikipedia.org/wiki/**', route => route.fulfill({contentType: 'text/html', body: '<h1>An article</h1>'}));
	await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({contentType: 'text/html', body: '<p>A video</p>'}));
	await page.clock.install();
	await visit(page, '/cv');
	const website = await box(windowOf(page, 'Website'));
	const editor = isSmall(viewport) ? null : await box(windowOf(page, 'Editor'));
	await openTerminal(page);
	// From here on time only passes as the test lets it, not while it clicks and types.
	await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

	// Which windows have been in front, and what the address bars have said, however
	// briefly, with so much going on at once.
	await page.evaluate(() => {
		window.fronted = new Set();
		window.addressed = new Set();
		new MutationObserver(() => {
			const front = document.querySelector('.dt-window.is-focused');
			window.fronted.add(front?.getAttribute('aria-label') + (front?.querySelector('.dt-address')?.textContent ?? ''));
			document.querySelectorAll('.dt-address').forEach(address => window.addressed.add(address.textContent));
		}).observe(document.querySelector('.dt-stage'), {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class']});
	});
	const fronted = name => page.evaluate(label => window.fronted.has(label), name);
	const addressed = address => page.evaluate(text => [...window.addressed].some(seen => seen.startsWith(text)), address);

	const entries = await page.evaluate(() => window.history.length);
	await run(page, 'sudo modprobe adhd');
	const player = page.locator('.dt-window[aria-label="Video Player"]');
	await until(page, async () => (await player.count()) > 0);
	const track = await player.locator('iframe').getAttribute('src');
	await player.evaluate(el => {
		el.dataset.first = '';
	});
	expect(track).toMatch(/\/embed\/(9Yz0mbKtTe0|x6MsDjLnXzE|gkcio2-NSE4|umD2HqMrKTE|5Y7a0v7NRkc|Zk7nPFV-35Q|fvki3Q4QTEA|L78h9d1rL6k|f0HVslUBbyo|yfi2E0X9_8o|hlr0dKBU-Gs|Nf0or6BXr60|hJ49bFXwLPc)\?.*start=\d+/);

	// However it got there, the website and editor settle in the same places every
	// time, and the video player lands somewhere on the screen, at about the same size.
	if (!isSmall(viewport)) {
		await settled(player);
		const stage = await box(page.locator('.dt-stage'));
		const video = await box(player);
		expect(video.width).toBeGreaterThanOrEqual(Math.max(360, stage.width * 0.34) - 1);
		expect(video.width).toBeLessThanOrEqual(Math.max(360, stage.width * 0.42) + 1);
		expect(video.x).toBeGreaterThanOrEqual(stage.x - 1);
		expect(video.y).toBeGreaterThanOrEqual(stage.y - 1);
		expect(video.x + video.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
		expect(video.y + video.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
		// The website's own window comes before any on Wikipedia.
		await until(page, async () => near(await box(windowOf(page, 'Website').first()), website) && near(await box(windowOf(page, 'Editor')), {
			x: editor.x + editor.width * 0.12, y: editor.y + editor.height * 0.06, width: editor.width * 0.88, height: editor.height * 0.88,
		}));
	}

	await until(page, () => addressed('en.wikipedia.org/wiki/Main_Page'));
	await until(page, () => addressed('en.wikipedia.org/wiki/Linux'));
	// Down to somewhere in the article before moving on, and nothing in it to click.
	await until(page, () => addressed('en.wikipedia.org/wiki/Linux#History'));
	await until(page, () => addressed('en.wikipedia.org/wiki/Unix'));
	expect(await page.locator('.dt-web-page').first().evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');

	// The track gives way to another, after a break.
	const next = page.locator('.dt-window[aria-label="Video Player"]:not([data-first])');
	await until(page, async () => (await page.locator('[data-first]').count()) === 0 && (await next.count()) > 0);
	expect(await next.first().locator('iframe').getAttribute('src')).not.toBe(track);

	// What it opened came to the front, if only for a moment.
	expect(await fronted('Video Player')).toBe(true);

	// With more than one website window, the dock shows them in Activities, and only them.
	await dockItem(page, 'site').click();
	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect(windowOf(page, 'Editor')).toHaveClass(/is-left-out/);
	await expect(windowOf(page, 'Website').first()).not.toHaveClass(/is-left-out/);
	for (const name of ['Editor', 'Terminal', 'Video Player']) {
		await expect(windowOf(page, name)).toBeHidden();
	}
	await expect(windowOf(page, 'Website').first()).toBeVisible();

	// Unloaded, it closes every window, the terminal too, and starts the desktop over.
	await dockItem(page, 'console').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Terminal');
	const windows = await page.locator('.dt-window').count();
	await page.locator('.dt-window').evaluateAll(all => all.forEach(win => {
		win.dataset.before = '';
	}));
	await run(page, 'sudo rmmod adhd');
	// One after another, so that for a while some have gone and others haven't.
	const before = page.locator('.dt-window[data-before]:not(.is-closing)');
	let partway = false;
	for (let i = 0; i < 10; i++) {
		await page.clock.runFor(100);
		const left = await before.count();
		partway ||= left > 0 && left < windows;
	}
	expect(partway).toBe(true);
	await expect(page.locator('.dt-window[data-before]')).toHaveCount(0);
	await page.clock.runFor(1000);
	await expect(page.locator('.dt-window')).toHaveCount(isSmall(viewport) ? 1 : 2);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
	await expect(page).toHaveURL('/cv');
	// None of its wandering went into the history; at most the way back to the CV.
	expect(await page.evaluate(() => window.history.length)).toBeLessThanOrEqual(entries + 1);
	await settled(windowOf(page, 'Website'));
	expect(near(await box(windowOf(page, 'Website')), website)).toBe(true);
	// And it's gone: nothing more is looked up, and the website is itself again.
	const looked = lookups;
	await page.clock.runFor(30_000);
	expect(await addresses(page)).toEqual(['robinj.be/cv']);
	expect(lookups).toBe(looked);
	await worksAsUsual(page);
});
