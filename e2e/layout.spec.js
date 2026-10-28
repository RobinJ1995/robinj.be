import {test, expect} from '@playwright/test';
import {visit, box, focusedWindow, isSmall} from './helpers';

const ROUTES = ['/cv', '/side-quests', '/contact', '/whoami', '/nope', '/cv/source', '/side-quests/source', '/contact/source', '/whoami/source'];

for (const route of ROUTES) {
	test(`fits ${route} in its window without sideways scrolling`, async ({page}) => {
		await visit(page, route);

		const overflowing = await page.evaluate(() => {
			const found = [];
			if (document.documentElement.scrollWidth > window.innerWidth) {
				found.push('the page');
			}
			// Every scroller in the window, bar the editor's tab strips, which scroll sideways on purpose.
			for (const el of document.querySelectorAll('.dt-window.is-focused *')) {
				const {overflowX} = getComputedStyle(el);
				if (overflowX !== 'visible' && !el.matches('.editor-files, .editor-tabs') && el.scrollWidth > el.clientWidth + 1) {
					found.push(`${el.tagName.toLowerCase()}.${el.className}`);
				}
			}
			return found;
		});

		expect(overflowing).toEqual([]);
	});
}

test('keeps the top bar, the dock and the window in front on screen', async ({page, viewport}) => {
	await visit(page, '/cv');

	for (const locator of [page.locator('.dt-topbar'), page.locator('.dt-dock'), focusedWindow(page)]) {
		const rect = await box(locator);
		expect(rect.x).toBeGreaterThanOrEqual(0);
		expect(rect.y).toBeGreaterThanOrEqual(0);
		expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
		expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
	}
});

test('lays the website out in one column in a narrow window, two otherwise', async ({page}) => {
	await visit(page, '/cv');
	const window = await box(focusedWindow(page));
	const sidebar = await box(page.locator('.ed-sidebar'));
	const main = await box(page.locator('.ed-main'));

	if (window.width <= 900) {
		expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(main.y + 1);
		expect(sidebar.width).toBeCloseTo(main.width, 0);
	} else {
		expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(main.x + 1);
		expect(sidebar.y).toBeCloseTo(main.y, 0);
	}
});

test('puts work entries\' logos beside their titles in a narrow window, beside their dates otherwise', async ({page}) => {
	await visit(page, '/cv');
	const window = await box(focusedWindow(page));
	const row = page.locator('.ed-work-row').first();
	const logo = await box(row.locator('.ed-work-logo'));
	const title = await box(row.locator('.ed-work-title'));
	const dates = await box(row.locator('.ed-dates'));

	expect(logo.x + logo.width).toBeLessThanOrEqual(title.x);
	if (window.width <= 900) {
		// The dates go under the title, on one line.
		expect(dates.x).toBeCloseTo(title.x, 0);
		expect(dates.y).toBeGreaterThan(title.y);
		expect(dates.height).toBeLessThan(30);
	} else {
		expect(dates.x + dates.width).toBeLessThanOrEqual(logo.x);
	}
});

test('turns the editor\'s sidebar into a strip of files in a narrow window', async ({page}) => {
	await visit(page, '/contact/source');
	const window = await box(focusedWindow(page));
	const files = page.locator('.editor-files');

	if (window.width <= 720) {
		await expect(page.locator('.editor-tabs')).toBeHidden();
		const strip = await box(files);
		const sidebar = await box(page.locator('.editor-sidebar'));
		expect(strip.width).toBeCloseTo(window.width, 0);
		expect(sidebar.height).toBeLessThan(60);
		// The open file is scrolled into view, even when the strip doesn't fit.
		const active = await box(files.locator('[aria-current="page"]'));
		expect(active.x).toBeGreaterThanOrEqual(strip.x - 1);
		expect(active.x + active.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
	} else {
		await expect(page.locator('.editor-tabs')).toBeVisible();
		expect((await box(page.locator('.editor-sidebar'))).width).toBe(260);
	}
});

test('blends the browser\'s own bars into the top bar, and resizes the page for on-screen keyboards', async ({page}) => {
	await visit(page, '/cv');

	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
	await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/);
});

test('rounds the windows\' corners unless they\'re maximised', async ({page, viewport}) => {
	await visit(page, '/cv');
	const radius = await focusedWindow(page).locator('.dt-window-frame').evaluate(el => getComputedStyle(el).borderTopLeftRadius);

	expect(radius).toBe(isSmall(viewport) ? '0px' : '12px');
});
