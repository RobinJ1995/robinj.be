import {test, expect} from '@playwright/test';
import {visit, box, windowOf, focusedWindow, dockItem, isSmall} from './helpers';

test.skip(({viewport}) => isSmall(viewport), 'Windows are maximised on small screens');

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('shows the website in front of the editor, whose edges show behind it', async ({page}) => {
	await visit(page, '/cv');

	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
	await expect(windowOf(page, 'Editor')).toBeVisible();
	const site = await box(windowOf(page, 'Website'));
	const editor = await box(windowOf(page, 'Editor'));
	expect(editor.x).toBeGreaterThan(site.x);
	expect(editor.y + editor.height).toBeGreaterThan(site.y + site.height);
});

test('raises a window clicked behind', async ({page}) => {
	await visit(page, '/cv');
	const editor = await box(windowOf(page, 'Editor'));

	// Its bottom edge, below the website.
	await page.mouse.click(editor.x + editor.width / 2, editor.y + editor.height - 10);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');

	const site = await box(windowOf(page, 'Website'));
	await page.mouse.click(site.x + 20, site.y + site.height / 2);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
});

test('switches windows from the dock, marking the ones running', async ({page}) => {
	await visit(page, '/cv');

	await expect(dockItem(page, 'site')).toHaveClass(/is-running/);
	await expect(dockItem(page, 'source')).toHaveClass(/is-running/);
	await expect(dockItem(page, 'console')).not.toHaveClass(/is-running/);

	await dockItem(page, 'source').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');

	await dockItem(page, 'console').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Terminal');
	await expect(dockItem(page, 'console')).toHaveClass(/is-running/);
});

test('lays every window out side by side in Activities, and leaves it on Escape, on the desktop, or by picking one', async ({page}) => {
	await visit(page, '/cv');
	await dockItem(page, 'console').click();
	const activities = page.getByRole('button', {name: 'Activities'});

	await activities.click();
	await expect(page.locator('.desktop')).toHaveClass(/is-overview/);
	await expect.poll(async () => {
		const rects = await Promise.all(['Website', 'Editor', 'Terminal'].map(name => box(windowOf(page, name))));
		return rects.some((a, i) => rects.some((b, j) => i !== j && overlaps(a, b)));
	}).toBe(false);

	await page.keyboard.press('Escape');
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);

	await activities.click();
	await page.mouse.click(5, (await box(page.locator('.dt-stage'))).y + 5);
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);

	await activities.click();
	await page.getByRole('button', {name: 'Switch to Editor'}).click();
	await expect(page.locator('.desktop')).not.toHaveClass(/is-overview/);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
});

test('closes a window to reveal the one behind, and an empty desktop suggests a way back after 4 seconds', async ({page}) => {
	await page.clock.install();
	await visit(page, '/side-quests');

	await page.getByRole('button', {name: 'Close the website window'}).click();
	await expect(windowOf(page, 'Website')).toHaveCount(0);
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');

	await page.getByTitle('Close', {exact: true}).click();
	await expect(page.locator('.dt-window')).toHaveCount(0);

	await page.clock.runFor(3500);
	await expect(page.getByRole('status')).toHaveCount(0);
	await page.clock.runFor(1000);
	await expect(page.getByRole('status')).toContainText('You look like you might be lost.');

	await page.getByRole('link', {name: 'Back to my CV?'}).click();
	await expect(page).toHaveURL('/cv');
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
	await expect(page.getByRole('status')).toHaveCount(0);
});
