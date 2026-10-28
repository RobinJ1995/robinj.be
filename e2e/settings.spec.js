import {test, expect} from '@playwright/test';
import {visit, box} from './helpers';

const menu = page => page.getByRole('dialog', {name: 'System menu'});
const openMenu = page => page.getByRole('button', {name: 'System menu'}).click();
const html = page => page.locator('html');

test('remembers the style, accent and font across visits', async ({page}) => {
	await visit(page, '/cv');
	await openMenu(page);

	await menu(page).getByRole('radio', {name: 'Dark'}).click();
	await menu(page).getByRole('radio', {name: 'Purple'}).click();
	await menu(page).getByRole('radio', {name: 'Dyslexic Font'}).click();
	await expect(html(page)).toHaveAttribute('data-theme', 'dark');
	await expect(html(page)).toHaveAttribute('data-accent', 'purple');
	await expect(html(page)).toHaveAttribute('data-font', 'dyslexic');

	await page.reload({waitUntil: 'domcontentloaded'});
	await expect(html(page)).toHaveAttribute('data-theme', 'dark');
	await expect(html(page)).toHaveAttribute('data-accent', 'purple');
	await expect(html(page)).toHaveAttribute('data-font', 'dyslexic');
	await openMenu(page);
	await expect(menu(page).getByRole('radio', {name: 'Dark'})).toHaveAttribute('aria-checked', 'true');
	await expect(menu(page).getByRole('radio', {name: 'Purple'})).toHaveAttribute('aria-checked', 'true');
	await expect(menu(page).getByRole('radio', {name: 'Dyslexic Font'})).toHaveAttribute('aria-checked', 'true');
});

test('colours the shell and the website with the accent, and sets their fonts', async ({page}) => {
	await visit(page, '/cv');
	await openMenu(page);
	await menu(page).getByRole('radio', {name: 'Blue'}).click();
	await menu(page).getByRole('radio', {name: 'Dyslexic Font'}).click();

	// The colours ease over to the new accent.
	await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dt-accent').trim())).toBe('rgb(53, 132, 228)');
	const styles = await page.evaluate(() => ({
		page: getComputedStyle(document.querySelector('.editorial')).fontFamily,
		topBar: getComputedStyle(document.querySelector('.dt-topbar')).fontFamily,
	}));
	expect(styles.page).toContain('OpenDyslexic');
	// The shell keeps its own font.
	expect(styles.topBar).not.toContain('OpenDyslexic');
});

test('drops back to the defaults when they\'re picked again', async ({page}) => {
	await visit(page, '/cv');
	await openMenu(page);
	await menu(page).getByRole('radio', {name: 'Light'}).click();
	await menu(page).getByRole('radio', {name: 'Auto'}).click();
	await menu(page).getByRole('radio', {name: 'Red'}).click();
	await menu(page).getByRole('radio', {name: 'Green'}).click();

	await expect(html(page)).not.toHaveAttribute('data-theme');
	await expect(html(page)).not.toHaveAttribute('data-accent');
	expect(await page.evaluate(() => [localStorage.getItem('theme'), localStorage.getItem('accent')])).toEqual([null, null]);
});

test('fits the system menu on screen, and closes it on Escape or a click elsewhere', async ({page, viewport}) => {
	await visit(page, '/cv');

	await openMenu(page);
	const rect = await box(menu(page));
	expect(rect.x).toBeGreaterThanOrEqual(0);
	expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
	expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);

	await page.keyboard.press('Escape');
	await expect(menu(page)).toHaveCount(0);

	await openMenu(page);
	await page.locator('.dt-clock').click();
	await expect(menu(page)).toHaveCount(0);
});
