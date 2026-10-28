import {test, expect} from '@playwright/test';
import {visit, box, windowOf, focusedWindow, dockItem, isSmall} from './helpers';

const TOP_BAR = 32;
const OVERHANG = 20;
const MARGIN = 8;

const titleBar = (page, name) => windowOf(page, name).locator('[data-titlebar]').first();

// Presses at `from` and lets go at `to`, in a few steps as a hand would.
const drag = async (page, from, to) => {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, {steps: 5});
	await page.mouse.up();
};

// A point on the title bar clear of its buttons.
const grip = async (page, name) => {
	const bar = await box(titleBar(page, name));
	return {x: bar.x + 30, y: bar.y + bar.height / 2};
};

test('blurs the wallpaper behind open windows only, and opens Activities once the last one closes', async ({page}) => {
	await visit(page, '/cv');
	const blur = () => page.locator('.dt-wallpaper').evaluate(el => getComputedStyle(el).filter);
	await expect.poll(blur).toBe('blur(4px)');

	await page.getByRole('button', {name: 'Close the website window'}).click();
	if (await windowOf(page, 'Editor').count()) {
		await windowOf(page, 'Editor').getByTitle('Close', {exact: true}).click();
	}

	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect.poll(blur).toBe('none');
	await page.getByRole('button', {name: 'Activities'}).click();
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);
	await expect.poll(blur).toBe('none');
});

test.describe('on a large screen', () => {
	test.skip(({viewport}) => isSmall(viewport), 'Windows are maximised on small screens');

	test('moves a window by its title bar, no more than 20px past the screen\'s sides and bottom, and never over the top bar', async ({page, viewport}) => {
		await visit(page, '/cv');
		const site = windowOf(page, 'Website');

		await drag(page, await grip(page, 'Website'), {x: 0, y: 0});
		let rect = await box(site);
		expect(rect.x).toBeCloseTo(-OVERHANG, 0);
		expect(rect.y).toBeCloseTo(TOP_BAR, 0);

		await drag(page, await grip(page, 'Website'), {x: viewport.width - 1, y: viewport.height - 1});
		rect = await box(site);
		expect(rect.x + rect.width).toBeCloseTo(viewport.width + OVERHANG, 0);
		expect(rect.y + rect.height).toBeCloseTo(viewport.height + OVERHANG, 0);
	});

	test('keeps windows under the dock', async ({page}) => {
		await visit(page, '/cv');

		await drag(page, await grip(page, 'Website'), {x: 0, y: 0});

		const dock = await box(page.locator('.dt-dock'));
		const covering = await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest('.dt-dock, .dt-window')?.className, {x: dock.x + dock.width / 2, y: dock.y + 10});
		expect(covering).toBe('dt-dock');
	});

	test('resizes a window from its edges, no smaller than its content still works at', async ({page}) => {
		await visit(page, '/cv');
		const site = windowOf(page, 'Website');
		const before = await box(site);

		// Just outside the right and bottom edges, where GNOME's resize borders are.
		await drag(page, {x: before.x + before.width + 4, y: before.y + 200}, {x: 0, y: before.y + 200});
		await drag(page, {x: before.x + 200, y: before.y + before.height + 4}, {x: before.x + 200, y: 0});

		const after = await box(site);
		expect(after).toMatchObject({x: before.x, y: before.y, width: 360, height: 360});
		// The page lays itself out for a window that narrow, as it would on a phone.
		expect(await site.locator('.editorial').evaluate(el => getComputedStyle(el).flexDirection)).toBe('column');
		expect(await site.locator('.dt-window-content').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
	});

	test('raises a window behind when its title bar is dragged', async ({page}) => {
		await visit(page, '/cv');
		await dockItem(page, 'console').click();
		await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Terminal');
		const site = windowOf(page, 'Website');
		const before = await box(site);

		const from = await grip(page, 'Website');
		await drag(page, from, {x: from.x - 50, y: from.y + 40});

		await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
		const after = await box(site);
		expect(after.x).toBeCloseTo(before.x - 50, 0);
		expect(after.y).toBeCloseTo(before.y + 40, 0);
	});

	test('opens a closed window in its default place again', async ({page}) => {
		await visit(page, '/cv');
		const site = windowOf(page, 'Website');
		const original = await box(site);

		await drag(page, await grip(page, 'Website'), {x: 600, y: 300});
		await page.getByRole('button', {name: 'Close the website window'}).click();
		await expect(site).toHaveCount(0);
		await dockItem(page, 'site').click();

		await expect.poll(async () => box(site)).toEqual(original);
	});

	test('keeps a moved window clear of the screen\'s edges and the dock as the screen shrinks, and maximises it below the threshold', async ({page}) => {
		await visit(page, '/cv');
		const site = windowOf(page, 'Website');
		const bar = await grip(page, 'Website');
		await drag(page, bar, {x: bar.x + 300, y: bar.y + 100});

		await page.setViewportSize({width: 1000, height: 640});
		const dock = await box(page.locator('.dt-dock'));
		await expect.poll(async () => {
			const rect = await box(site);
			return rect.x >= dock.x + dock.width && rect.x + rect.width <= 1000 - MARGIN && rect.y + rect.height <= 640 - MARGIN;
		}).toBe(true);
		// Its edges can all still be grabbed.
		const rect = await box(site);
		const grabbed = await page.evaluate(points => points.map(([x, y]) => document.elementFromPoint(x, y)?.dataset.resize), [
			[rect.x + rect.width + 4, rect.y + 100], [rect.x + 100, rect.y + rect.height + 4], [rect.x - 4, rect.y + 100],
		]);
		expect(grabbed).toEqual(['e', 's', 'w']);

		await page.setViewportSize({width: 800, height: 640});
		await expect.poll(async () => (await box(site)).width).toBeCloseTo(800 - 88, 0);
		expect(await site.locator('[data-resize]').count()).toBe(0);
	});
});

test.describe('on a small screen', () => {
	test.skip(({viewport}) => !isSmall(viewport), 'Only where windows are maximised');

	test('neither moves nor resizes windows', async ({page}) => {
		await visit(page, '/cv');
		const site = windowOf(page, 'Website');
		const before = await box(site);

		await drag(page, await grip(page, 'Website'), {x: before.x + 100, y: before.y + 100});

		expect(await box(site)).toEqual(before);
		expect(await site.locator('[data-resize]').count()).toBe(0);
	});
});
