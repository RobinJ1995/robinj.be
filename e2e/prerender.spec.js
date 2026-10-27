import {test, expect} from '@playwright/test';

// These run with JavaScript DISABLED, so anything asserted here is proof that the
// content was pre-rendered into static HTML (requirement 1) rather than produced by
// a client-side SPA.
test.use({javaScriptEnabled: false});

const CONTENT = [
	{path: '/', title: 'CV  • Robin Jacobs', text: ['Work Experience', 'Beeline']},
	{path: '/cv', title: 'CV  • Robin Jacobs', text: ['Work Experience', 'Beeline']},
	{path: '/contact', title: 'Contact  • Robin Jacobs', text: ['linkedin.com/in/robin-jacobs']},
	{path: '/side-quests', title: 'Side Quests  • Robin Jacobs', text: ['Sprint Retrospective', 'DistroHopper']},
];

test('redirects the old /projects URLs to /side-quests', async ({page}) => {
	await page.goto('/projects');
	await expect(page).toHaveURL('/side-quests');
	await page.goto('/projects/source');
	await expect(page).toHaveURL('/side-quests/source');
});

for (const {path, title, text} of CONTENT) {
	test(`prerenders real content for ${path}`, async ({page}) => {
		await page.goto(path, {waitUntil: 'domcontentloaded'});

		await expect(page).toHaveTitle(title);
		for (const t of text) {
			await expect(page.locator('#root')).toContainText(t);
		}
	});
}

test('prerenders the terminal/source design for /cv/source (requirement 3)', async ({page}) => {
	await page.goto('/cv/source', {waitUntil: 'domcontentloaded'});

	await expect(page).toHaveTitle('CV  (Source) • Robin Jacobs');
	await expect(page.locator('.terminal')).toBeVisible();
	await expect(page.locator('#root')).toContainText('side-quests.yml');
	await expect(page.locator('#root')).toContainText('Work Experience');
});

test('serves the 404 page with a 404 status for unknown paths', async ({page}) => {
	const response = await page.goto('/this-does-not-exist', {waitUntil: 'domcontentloaded'});

	expect(response.status()).toBe(404);
	await expect(page.locator('#root')).toContainText('The page you requested does not exist.');
});

test('keeps the e-mail address OUT of the static HTML (requirement 4)', async ({page}) => {
	await page.goto('/contact', {waitUntil: 'domcontentloaded'});

	const html = await page.content();
	expect(html).toContain('───');
	expect(html).not.toContain('robin@robinj.be');
	expect(html).not.toContain('mailto:');
});
