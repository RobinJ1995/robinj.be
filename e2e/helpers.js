import {expect} from '@playwright/test';

// As SMALL in Desktop.jsx: below this, windows are maximised.
export const isSmall = ({width, height}) => width < 900 || height < 600;

// React attaches __reactProps$… to DOM nodes carrying event handlers once it has
// hydrated. Waiting for that on an interactive node proves hydration finished.
export const waitForHydration = page => page.waitForFunction(() => {
	const el = document.querySelector('#root nav a');
	return !!el && Object.keys(el).some(k => k.startsWith('__reactProps$'));
});

export const visit = async (page, path) => {
	await page.goto(path, {waitUntil: 'domcontentloaded'});
	await waitForHydration(page);
	// And the render after it.
	await page.evaluate(() => new Promise(resolve => {
		const {port1, port2} = new MessageChannel();
		port1.onmessage = resolve;
		port2.postMessage(null);
	}));
};

// Whichever scrolls: the document on a phone.
export const scrollPage = (page, top) => page.evaluate(to => {
	const el = document.documentElement.scrollHeight > window.innerHeight ? document.documentElement : document.querySelector('.dt-window[data-win="site"] .editorial');
	el.scrollTop = to === 'end' ? el.scrollHeight : to;
}, top);

export const overScreen = (page, {width, height} = page.viewportSize()) => page.mouse.move(width / 2, height / 2);

export const windowOf = (page, name) => page.locator(`.dt-window[aria-label="${name}"]`);
export const focusedWindow = page => page.locator('.dt-window.is-focused');
export const dockItem = (page, win) => page.locator(`.dt-dock-item[data-win="${win}"]`);
export const browserBar = page => page.locator('.dt-window[data-win="site"] .dt-headerbar');

export const box = async locator => {
	const rect = await locator.boundingBox();
	expect(rect).not.toBeNull();
	return rect;
};

// The website as it always is, whatever went on before: in front from the dock, it
// goes from page to page and back without reloading, shows a page's source, and
// the e-mail address on Contact.
export const worksAsUsual = async page => {
	const site = page.locator('.dt-window[aria-label="Website"]');
	await dockItem(page, 'site').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Website');
	await page.evaluate(() => {
		window.sentinel = 'alive';
	});

	await site.getByRole('link', {name: 'Side Quests', exact: true}).click();
	await expect(page).toHaveURL('/side-quests');
	await expect(site).toContainText('Sprint Retrospective');
	await site.getByTitle('View source').click();
	await expect(focusedWindow(page)).toHaveAttribute('aria-label', 'Editor');
	await expect(page.locator('.editor')).toContainText('side-quests.yml');
	await expect(page).toHaveURL('/side-quests');

	await dockItem(page, 'site').click();
	await site.getByRole('link', {name: 'Contact', exact: true}).click();
	await expect(page).toHaveURL('/contact');
	await expect(site.locator('.ed-contact-row').filter({hasText: 'E-mail'}).locator('a')).not.toHaveText('───');
	await page.goBack();
	await expect(page).toHaveURL('/side-quests');
	await expect(site).toContainText('Sprint Retrospective');
	expect(await page.evaluate(() => window.sentinel)).toBe('alive');
};

// Once the fonts the page is waiting for have loaded.
export const fontsLoaded = page => page.evaluate(() => document.fonts.ready.then(() => {}));

// Including those not used yet: one arriving later re-wraps the page.
export const allFontsLoaded = async page => {
	// Their stylesheet first, if it loads.
	await page.waitForFunction(() => document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')?.sheet, null, {timeout: 5000}).catch(() => {});
	await page.evaluate(() => Promise.all([...document.fonts].map(font => font.load().catch(() => {}))).then(() => {}));
};

// Settled once nothing on screen is still moving.
export const settled = locator => expect.poll(() => locator.evaluate(el => el.closest('.dt-screen').getAnimations({subtree: true})
	.filter(a => a.playState !== 'finished' && Number.isFinite(a.effect.getComputedTiming().endTime)).length)).toBe(0);

export const terminalText = page => page.locator('.console .xterm-rows').innerText();

export const openTerminal = async page => {
	await dockItem(page, 'console').click();
	await expect(page.locator('.console .xterm-rows')).toContainText('robin@robinj.be:~/portfolio$');
};

export const run = async (page, command) => {
	await page.keyboard.type(command);
	await page.keyboard.press('Enter');
};
