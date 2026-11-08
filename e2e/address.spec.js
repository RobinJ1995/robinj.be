import {test, expect} from '@playwright/test';
import {visit, windowOf, focusedWindow, dockItem} from './helpers';

const shows = locator => locator.evaluate(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible');

test.describe('the URL', () => {
	test('is the page\'s own after arriving at its source view, which opens the editor', async ({page}) => {
		await visit(page, '/contact/source');

		await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
		await expect(page).toHaveURL('/contact');
		await expect(page).toHaveTitle('Contact • Robin Jacobs');
	});

	test('follows the page shown, not the window showing it', async ({page}) => {
		await visit(page, '/cv');

		await dockItem(page, 'source').click();
		await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
		await expect(page).toHaveURL('/cv');

		await windowOf(page, 'Editor').getByRole('link', {name: 'contact.yml'}).first().click();
		await expect(page).toHaveURL('/contact');
		await expect(page).toHaveTitle('Contact • Robin Jacobs');

		await page.goBack();
		await expect(page).toHaveURL('/cv');
		await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
	});

	test('names no page while neither the website nor the editor is open, which then open on the CV', async ({page}) => {
		await visit(page, '/contact/source');

		await windowOf(page, 'Editor').getByTitle('Close', {exact: true}).click();
		await page.getByRole('button', {name: 'Close the website window'}).click();
		await expect(page.locator('.dt-window')).toHaveCount(0);
		await expect(page).toHaveURL('/');

		await dockItem(page, 'site').click();
		await expect(page).toHaveURL('/cv');
		await expect(page).toHaveTitle('CV • Robin Jacobs');
		await expect(windowOf(page, 'Website')).toContainText('Work Experience');
	});
});

test.describe('printing', () => {
	test('gives the website\'s pages alone, all of them', async ({page}) => {
		await visit(page, '/cv/source');
		// As the browser does before it prints.
		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await page.emulateMedia({media: 'print'});

		for (const selector of ['.dt-topbar', '.dt-dock', '.dt-window[data-win="source"]', '.dt-window[data-win="site"]']) {
			expect(await shows(page.locator(selector)), selector).toBe(false);
		}
		const copy = page.locator('.dt-print');
		expect(await shows(copy)).toBe(true);
		await expect(copy).toContainText('Work Experience');
		await expect(copy).toContainText('Sprint Retrospective');
		await expect(copy).toContainText('on LinkedIn');
		// The avatar and name only above the first page, and no pointing to a menu on paper.
		await expect(page.locator('.dt-print .ed-profile:visible')).toHaveCount(1);
		const printed = await copy.innerText();
		expect(printed).not.toContain('accessed from the menu');
		expect(printed).toContain('If you wish to contact me');
		// Not cut off at a window's height: the pages run on for as long as they are.
		const {content, document} = await page.evaluate(() => ({
			content: window.document.querySelector('.dt-print').scrollHeight,
			document: window.document.documentElement.scrollHeight,
		}));
		expect(document).toBeGreaterThanOrEqual(content);
	});

	test('gives the page even with the website closed, laid out as the browser starts printing', async ({page, browserName}) => {
		await visit(page, '/side-quests');
		// With the editor open, so that the page stays this one.
		await dockItem(page, 'source').click();
		await dockItem(page, 'site').click();
		await page.getByRole('button', {name: 'Close the website window'}).click();
		await expect(windowOf(page, 'Website')).toHaveCount(0);
		await page.evaluate(() => {
			window.addEventListener('beforeprint', () => {
				window.copied = document.querySelector('.dt-print')?.textContent;
			});
		});

		test.skip(browserName !== 'chromium', 'Only Chromium prints to PDF here');
		await page.pdf();
		expect(await page.evaluate(() => window.copied)).toContain('Sprint Retrospective');
		await expect(page.locator('.dt-print')).toHaveCount(0);
	});

	test('has its nav jump within the PDF, not to the website', async ({page, browserName}) => {
		test.skip(browserName !== 'chromium', 'Only Chromium prints to PDF here');
		await visit(page, '/side-quests');
		const pdf = (await page.pdf()).toString('latin1');

		// Three navs, each linking to the three pages' sections of the printout.
		const jumps = [...pdf.matchAll(/\/Subtype \/Link[^>]*\/Dest \/print-([\w-]+)/g)].map(m => m[1]);
		expect(jumps.toSorted()).toEqual(['contact', 'contact', 'contact', 'cv', 'cv', 'cv', 'side-quests', 'side-quests', 'side-quests']);
		expect(pdf).not.toMatch(/\/URI \(https?:\/\/[^/)]+\/(cv|side-quests|contact)\)/);
	});
});
