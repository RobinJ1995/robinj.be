import {test, expect} from '@playwright/test';

// These run with JavaScript DISABLED, so anything asserted here is proof that the
// content was pre-rendered into static HTML (requirement 1) rather than produced by
// a client-side SPA.
test.use({javaScriptEnabled: false});

const CONTENT = [
	{path: '/', title: 'CV  • Robin Jacobs', text: ['Work Experience', 'Beeline']},
	{path: '/cv', title: 'CV  • Robin Jacobs', text: ['Work Experience', 'Beeline']},
	{path: '/contact', title: 'Contact  • Robin Jacobs', text: ['linkedin.com/in/robin-jacobs']},
	{path: '/projects', title: 'Projects  • Robin Jacobs', text: ['Sprint Retrospective', 'DistroHopper']},
];

for (const {path, title, text} of CONTENT) {
	test(`prerenders real content for ${path}`, async ({page}) => {
		await page.goto(path);

		await expect(page).toHaveTitle(title);
		for (const t of text) {
			await expect(page.locator('#root')).toContainText(t);
		}
	});
}

test('prerenders highlighted source for /cv/source (requirement 3)', async ({page}) => {
	await page.goto('/cv/source');

	await expect(page).toHaveTitle('CV  (Source) • Robin Jacobs');
	await expect(page.locator('.view-source')).toContainText("import React from 'react'");
});

test('serves the 404 page with a 404 status for unknown paths', async ({page}) => {
	const response = await page.goto('/this-does-not-exist');

	expect(response.status()).toBe(404);
	await expect(page.locator('#root')).toContainText('The page you requested does not exist.');
});

test('keeps the e-mail address OUT of the static HTML (requirement 4)', async ({page}) => {
	await page.goto('/contact');

	const html = await page.content();
	expect(html).toContain('───');
	expect(html).not.toContain('robin@robinj.be');
	expect(html).not.toContain('mailto:');
});
