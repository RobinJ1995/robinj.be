import {test, expect} from '@playwright/test';
import {visit, box, windowOf, focusedWindow, dockItem, browserBar, settled, isSmall, scrollPage, overScreen, allFontsLoaded} from './helpers';

test.skip(({viewport}) => !isSmall(viewport), 'Windows only maximise on small screens');

// The dock's gap to the window.
const GAP = 6;

// Which windows have been minimised or restored since `since()`, however quickly
// that was over.
const animated = page => page.evaluate(() => window.animated);
const since = page => page.evaluate(() => {
	window.animated = [];
});

test.beforeEach(({page}) => page.addInitScript(() => {
	window.animated = [];
	const {animate} = Element.prototype;
	Element.prototype.animate = function (...args) {
		window.animated.push(this.getAttribute('aria-label'));
		return animate.apply(this, args);
	};
}));

const isShowing = locator => locator.evaluate(el => getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).getPropertyValue('--dt-fade') === '1');

// How far the website's page is scrolled, by the document and in its window.
const scrolledBy = page => page.evaluate(() => ({
	document: window.scrollY,
	window: [...document.querySelectorAll('.dt-window[data-win="site"] *')].reduce((sum, el) => sum + el.scrollTop, 0),
}));

// Which of its corners are rounded.
const corners = locator => locator.evaluate(el => {
	const style = getComputedStyle(el);
	const round = corner => parseFloat(style[`border${corner}Radius`]) > 0;
	return {topLeft: round('TopLeft'), topRight: round('TopRight'), bottomLeft: round('BottomLeft'), bottomRight: round('BottomRight')};
});

test('maximises the window between the top bar and the dock, which sits flush against the screen\'s edge', async ({page, viewport}) => {
	// The editor; the website's own pages are tested below.
	await visit(page, '/cv/source');
	const topBar = await box(page.locator('.dt-topbar'));
	const window = await box(focusedWindow(page));
	const dock = await box(page.locator('.dt-dock'));

	expect(window.y).toBeCloseTo(topBar.y + topBar.height, 0);
	if (viewport.height > viewport.width) {
		expect(window.x).toBeCloseTo(0, 0);
		expect(window.width).toBeCloseTo(viewport.width, 0);
		expect(dock.y - (window.y + window.height)).toBeCloseTo(GAP, 0);
		expect(viewport.height - (dock.y + dock.height)).toBeCloseTo(0, 0);
		expect(await corners(page.locator('.dt-dock'))).toEqual({topLeft: true, topRight: true, bottomLeft: false, bottomRight: false});
	} else {
		expect(window.x + window.width).toBeCloseTo(viewport.width, 0);
		expect(window.y + window.height).toBeCloseTo(viewport.height, 0);
		expect(dock.x).toBeCloseTo(0, 0);
		expect(await corners(page.locator('.dt-dock'))).toEqual({topLeft: false, topRight: true, bottomLeft: false, bottomRight: true});
		expect(window.x - (dock.x + dock.width)).toBeCloseTo(GAP, 0);
	}
});

test('starts with just the website, unless the URL asks for the editor', async ({page}) => {
	await visit(page, '/cv');
	await expect(page.locator('.dt-window')).toHaveCount(1);
	await expect(dockItem(page, 'source')).not.toHaveClass(/is-running/);

	await visit(page, '/cv/source');
	await expect(page.locator('.dt-window')).toHaveCount(2);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
});

test('shows only the window in front', async ({page}) => {
	await visit(page, '/cv/source');

	expect(await isShowing(windowOf(page, 'Editor'))).toBe(true);
	await expect(windowOf(page, 'Website')).toBeHidden();
});

test('minimises the window in front to its dock icon and restores the next from its own', async ({page}) => {
	await visit(page, '/cv/source');
	const editor = windowOf(page, 'Editor');
	const site = windowOf(page, 'Website');

	await since(page);
	await dockItem(page, 'site').click();
	// Both on their way: one shrinking into the dock, the other growing out of it.
	await expect.poll(() => animated(page)).toEqual(expect.arrayContaining(['Editor', 'Website']));

	await settled(editor);
	await settled(site);
	await expect(page).toHaveURL('/cv');
	await expect(editor).toBeHidden();
	await expect.poll(() => isShowing(site)).toBe(true);
});

test('minimises a closed window into its dock icon while restoring the next', async ({page}) => {
	await visit(page, '/cv/source');
	const editor = windowOf(page, 'Editor');

	await since(page);
	await page.getByTitle('Close', {exact: true}).click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
	await expect.poll(() => animated(page)).toEqual(expect.arrayContaining(['Editor', 'Website']));

	await expect(editor).toHaveCount(0);
	await expect.poll(() => isShowing(windowOf(page, 'Website'))).toBe(true);
	await expect(dockItem(page, 'source')).not.toHaveClass(/is-running/);
});

test('shows every open window in Activities, and only the one picked afterwards', async ({page}) => {
	await visit(page, '/cv/source');

	await page.getByRole('button', {name: 'Activities'}).click();
	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect.poll(() => isShowing(windowOf(page, 'Website'))).toBe(true);
	expect(await isShowing(windowOf(page, 'Editor'))).toBe(true);
	const frame = windowOf(page, 'Website').locator('.dt-window-frame');
	await expect.poll(() => corners(frame)).toEqual({topLeft: true, topRight: true, bottomLeft: true, bottomRight: true});
	await settled(windowOf(page, 'Website'));
	expect((await box(browserBar(page))).y).toBeCloseTo((await box(windowOf(page, 'Website'))).y, 0);

	await page.getByRole('button', {name: 'Switch to Website'}).click();
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);
	await expect(windowOf(page, 'Editor')).toBeHidden();
	await expect.poll(() => isShowing(windowOf(page, 'Website'))).toBe(true);
	await expect.poll(() => corners(frame)).toEqual({topLeft: false, topRight: false, bottomLeft: false, bottomRight: false});
});

test('suggests a way back after 3 seconds on an empty desktop', async ({page}) => {
	await page.clock.install();
	await visit(page, '/cv');

	await page.getByRole('button', {name: 'Close the website window'}).click();
	await expect(page.locator('.dt-window')).toHaveCount(0);
	await page.clock.runFor(2500);
	await expect(page.getByRole('status')).toHaveCount(0);
	await page.clock.runFor(1000);
	await expect(page.getByRole('status')).toContainText('You look like you might be lost.');
});

test('runs the website\'s own pages on behind the top bar, the browser bar just below it', async ({page}) => {
	await visit(page, '/cv');
	const topBar = await box(page.locator('.dt-topbar'));

	expect((await box(windowOf(page, 'Website'))).y).toBeCloseTo(topBar.y, 0);
	expect((await box(browserBar(page))).y).toBeCloseTo(topBar.y + topBar.height, 0);
});

test('runs the website\'s own pages on behind the dock as far as they\'re scrolled in from either end, upright', async ({page, viewport}) => {
	test.skip(viewport.height <= viewport.width, 'The dock is beside the window in landscape');
	await visit(page, '/cv');
	await allFontsLoaded(page);
	const dock = await box(page.locator('.dt-dock'));
	const reserved = viewport.height - dock.y + GAP;
	// Rows at the screen's bottom the window leaves.
	const left = () => page.evaluate(() => {
		let rows = 0;
		while (rows < window.innerHeight && !document.elementFromPoint(2, window.innerHeight - 1 - rows)?.closest('.dt-window')) {
			rows++;
		}
		return rows;
	});

	await expect.poll(left).toBe(reserved);
	await scrollPage(page, 20);
	await expect.poll(left).toBe(reserved - 20);
	await scrollPage(page, 600);
	await expect.poll(left).toBe(0);
	await scrollPage(page, 'end');
	await expect.poll(left).toBe(reserved);
	const last = await box(page.locator('.dt-window[data-win="site"] .ed-main > *').last());
	expect(last.y + last.height).toBeLessThanOrEqual(dock.y - GAP);
});

test('scrolls the website\'s own pages as the document, for a phone\'s browser to hide its bars', async ({page}) => {
	await visit(page, '/cv');
	await allFontsLoaded(page);
	const scrolled = () => scrolledBy(page);
	const heading = page.getByRole('heading', {name: 'Work Experience'});
	const bars = [page.locator('.dt-topbar'), page.locator('.dt-dock')];
	const fixed = await Promise.all(bars.map(box));

	await overScreen(page);
	await page.mouse.wheel(0, 300);
	await expect.poll(scrolled).toEqual({document: 300, window: 0});
	await expect.poll(() => Promise.all(bars.map(box))).toEqual(fixed);
	const at = (await box(heading)).y;

	// Still there after the editor, and after Activities.
	await dockItem(page, 'source').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
	await expect.poll(scrolled).toEqual({document: 0, window: 300});
	await dockItem(page, 'site').click();
	await settled(windowOf(page, 'Website'));
	await expect.poll(scrolled).toEqual({document: 300, window: 0});
	await expect.poll(async () => (await box(heading)).y).toBeCloseTo(at, 0);

	await page.getByRole('button', {name: 'Activities'}).click();
	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect.poll(scrolled).toEqual({document: 0, window: 300});
	await page.getByRole('button', {name: 'Switch to Website'}).click();
	await settled(windowOf(page, 'Website'));
	await expect.poll(scrolled).toEqual({document: 300, window: 0});
	await expect.poll(async () => (await box(heading)).y).toBeCloseTo(at, 0);
});

test('keeps the page where it is, and its bars following it, as the screen turns or changes size', async ({page, viewport}) => {
	test.skip(viewport.width >= 600 || viewport.height < viewport.width, 'Starts as a phone held upright');
	await visit(page, '/cv');
	await allFontsLoaded(page);
	const scrolled = () => scrolledBy(page);
	const scroll = async by => {
		await overScreen(page);
		await page.mouse.wheel(0, by);
	};

	await scroll(600);
	await expect.poll(scrolled).toEqual({document: 600, window: 0});
	await page.setViewportSize({width: viewport.height, height: viewport.width});
	await expect.poll(scrolled).toEqual({document: 600, window: 0});
	// A desktop's: in a window. Then one too short for it, in two columns and in one.
	await page.setViewportSize({width: 1400, height: 900});
	await expect.poll(scrolled).toEqual({document: 0, window: 600});
	await page.setViewportSize({width: 1280, height: 560});
	await expect.poll(scrolled).toEqual({document: 600, window: 0});
	const sidebar = page.locator('.dt-window[data-win="site"] .ed-sidebar');
	expect((await box(sidebar)).y).toBe(0);
	await page.setViewportSize({width: 960, height: 560});
	await expect.poll(scrolled).toEqual({document: 600, window: 0});

	// Once the new layout has eased in: scrolling while the page changes height counts for nothing.
	await settled(windowOf(page, 'Website'));
	await scroll(-100);
	await expect(browserBar(page)).not.toHaveClass(/is-hidden/);
	await scroll(300);
	await expect(browserBar(page)).toHaveClass(/is-hidden/);
	await page.setViewportSize(viewport);
	await expect.poll(scrolled).toEqual({document: 800, window: 0});
});

test('loses none of the scrolling done while the website is still on its way back in front', async ({page}) => {
	await visit(page, '/cv');
	await allFontsLoaded(page);
	await dockItem(page, 'source').click();
	await settled(windowOf(page, 'Editor'));

	await dockItem(page, 'site').click();
	await overScreen(page);
	// Once it has grown from its dock icon to under the mouse.
	await page.waitForTimeout(150);
	for (let i = 0; i < 12; i++) {
		await page.mouse.wheel(0, 20);
		await page.waitForTimeout(50);
	}
	await expect.poll(() => scrolledBy(page)).toEqual({document: 240, window: 0});
});

test('scrolls the document where motion is reduced too, after closing the website and after starting up again', async ({page}) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.emulateMedia({reducedMotion: 'reduce'});
	await page.clock.install();
	await visit(page, '/cv');
	const scrolls = async () => {
		await settled(windowOf(page, 'Website'));
		await overScreen(page);
		await page.mouse.wheel(0, 300);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
		await page.mouse.wheel(0, -300);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	};
	await scrolls();
	// Closed part way down: opened again it's a new window, at its top.
	await page.mouse.wheel(0, 300);
	await page.mouse.wheel(0, -100);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
	await page.getByRole('button', {name: 'Close the website window'}).click();
	await expect(page.locator('.dt-window')).toHaveCount(0);
	await dockItem(page, 'site').click();
	await scrolls();

	await dockItem(page, 'console').click();
	await expect(page.locator('.console .xterm-rows')).toContainText('$');
	await page.keyboard.type('poweroff');
	await page.keyboard.press('Enter');
	await page.clock.runFor(30_000);
	await page.getByRole('button', {name: 'Power on'}).click();
	await page.clock.runFor(30_000);
	await dockItem(page, 'site').click();
	await scrolls();
	expect(errors).toEqual([]);
});

test('slides the browser bar away as the page scrolls down, and back as it scrolls up', async ({page}) => {
	await visit(page, '/cv');
	const bar = browserBar(page);
	const topBar = page.locator('.dt-topbar');
	const below = (await box(topBar)).height;
	await overScreen(page);

	await page.mouse.wheel(0, 600);
	await expect(bar).toHaveClass(/is-hidden/);
	await expect.poll(async () => {
		const rect = await box(bar);
		return rect.y + rect.height;
	}).toBeLessThanOrEqual(1);
	await expect.poll(() => topBar.evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
	await expect(page.locator('.dt-clock')).toHaveCSS('opacity', '0');

	// A few steps, as a finger would: a scroll that lands as the page reflows counts for nothing.
	for (let i = 0; i < 4; i++) {
		await page.mouse.wheel(0, -40);
	}
	await expect(bar).not.toHaveClass(/is-hidden/);
	await expect.poll(async () => (await box(bar)).y).toBeCloseTo(below, 0);
	await expect.poll(() => topBar.evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(0, 0, 0)');
	await expect(page.locator('.dt-clock')).toHaveCSS('opacity', '1');
});

test('brings the browser bar back in Activities, keeping it until the page scrolls again', async ({page}) => {
	await visit(page, '/cv');
	// A font arriving changes the page's height, and the scroll with it counts for nothing.
	await allFontsLoaded(page);
	const bar = browserBar(page);
	await overScreen(page);
	await page.mouse.wheel(0, 600);
	await expect(bar).toHaveClass(/is-hidden/);

	await page.getByRole('button', {name: 'Activities'}).click();
	await expect(bar).not.toHaveClass(/is-hidden/);
	await page.getByRole('button', {name: 'Switch to Website'}).click();
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);
	await expect(bar).not.toHaveClass(/is-hidden/);

	await overScreen(page);
	await page.mouse.wheel(0, 100);
	await expect(bar).toHaveClass(/is-hidden/);
});

test('brings the bars back on another page picked in the editor while scrolled down', async ({page}) => {
	await visit(page, '/cv');
	const bar = browserBar(page);
	await overScreen(page);
	await page.mouse.wheel(0, 800);
	await expect(bar).toHaveClass(/is-hidden/);

	await dockItem(page, 'source').click();
	await windowOf(page, 'Editor').getByRole('link', {name: 'contact.yml'}).first().click();
	await windowOf(page, 'Editor').getByRole('link', {name: 'Run'}).click();

	await expect(page).toHaveURL('/contact');
	await expect(bar).not.toHaveClass(/is-hidden/);
	await expect.poll(() => page.locator('.dt-topbar').evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(0, 0, 0)');
});

test('starts the page below the browser bar, which lies over it', async ({page}) => {
	await visit(page, '/cv');
	const bar = await box(browserBar(page));
	const topBar = await box(page.locator('.dt-topbar'));
	const avatar = await box(page.locator('.ed-avatar'));

	expect(bar.y).toBeCloseTo(topBar.y + topBar.height, 0);
	expect(avatar.y).toBeGreaterThanOrEqual(bar.y + bar.height);
});

test('gives the address the whole browser bar on a narrow screen', async ({page, viewport}) => {
	test.skip(viewport.width >= 900, 'Only narrow screens');
	await visit(page, '/cv');
	const bar = await box(browserBar(page));
	const address = await box(page.locator('.dt-address'));

	// From the bar's padding on the left to the share and close buttons on the right.
	expect(address.x - bar.x).toBeLessThan(15);
	expect(address.width).toBeGreaterThan(bar.width - 110);
});
