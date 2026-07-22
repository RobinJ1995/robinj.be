import {test, expect} from '@playwright/test';

// React attaches __reactProps$… to DOM nodes carrying event handlers once it has
// hydrated. Waiting for that on an interactive node proves hydration finished.
const waitForHydration = page => page.waitForFunction(() => {
	const el = document.querySelector('#root nav a');
	return !!el && Object.keys(el).some(k => k.startsWith('__reactProps$'));
});

test('hydrates and does client-side navigation without a full reload', async ({page}) => {
	await page.goto('/cv', {waitUntil: 'domcontentloaded'});
	await waitForHydration(page);

	// A sentinel on window is wiped by a full page load but survives client-side nav.
	await page.evaluate(() => {
		window.__sentinel = 'alive';
	});

	await page.getByRole('link', {name: 'Projects'}).click();
	await expect(page).toHaveURL('/projects');
	await expect(page.locator('#root')).toContainText('Sprint Retrospective');
	expect(await page.evaluate(() => window.__sentinel)).toBe('alive');

	await page.getByRole('link', {name: 'Contact'}).click();
	await expect(page).toHaveURL('/contact');
	expect(await page.evaluate(() => window.__sentinel)).toBe('alive');

	// Back button → popstate onto a pushState entry → client-side nav, no reload.
	await page.goBack();
	await expect(page).toHaveURL('/projects');
	await expect(page.locator('#root')).toContainText('Sprint Retrospective');
	expect(await page.evaluate(() => window.__sentinel)).toBe('alive');
});

test('toggles the source view client-side', async ({page}) => {
	await page.goto('/cv', {waitUntil: 'domcontentloaded'});
	await waitForHydration(page);
	await page.evaluate(() => {
		window.__sentinel = 'alive';
	});

	await page.getByTitle('View source').click();

	await expect(page).toHaveURL('/cv/source');
	// The terminal/IDE design replaces the editorial one for the source view.
	await expect(page.locator('.terminal')).toBeVisible();
	await expect(page.locator('#root')).toContainText('projects.yml');
	expect(await page.evaluate(() => window.__sentinel)).toBe('alive');
});

test('reveals the obfuscated e-mail after hydration (requirement 4)', async ({page}) => {
	await page.goto('/contact', {waitUntil: 'domcontentloaded'});

	const emailLink = page.locator('.ed-contact-row').filter({hasText: 'E-mail'}).locator('a');

	// Placeholder is replaced once the client mounts...
	await expect(emailLink).not.toHaveText('───');
	// ...and the visible text (hidden junk spans excluded) is the real address.
	const visible = await emailLink.evaluate(a => {
		const clone = a.cloneNode(true);
		clone.querySelectorAll('span[style*="display"]').forEach(s => s.remove());
		return clone.textContent;
	});
	expect(visible).toBe('robin@robinj.be');

	// The mailto: link is only exposed on hover.
	expect(await emailLink.getAttribute('href')).toBe('https://robinj.be/');
	await emailLink.hover();
	await expect(emailLink).toHaveAttribute('href', 'mailto:robin@robinj.be');
});

test('produces no hydration-mismatch errors', async ({page}) => {
	const problems = [];
	page.on('pageerror', err => problems.push(String(err)));
	page.on('console', msg => {
		if (msg.type() === 'error' && /hydrat|did not match|server HTML/i.test(msg.text())) {
			problems.push(msg.text());
		}
	});

	for (const path of ['/', '/cv/source', '/contact', '/projects']) {
		await page.goto(path, {waitUntil: 'domcontentloaded'});
		await waitForHydration(page);
	}

	expect(problems).toEqual([]);
});
