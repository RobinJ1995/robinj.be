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
};

export const windowOf = (page, name) => page.locator(`.dt-window[aria-label="${name}"]`);
export const focusedWindow = page => page.locator('.dt-window.is-focused');
export const dockItem = (page, win) => page.locator(`.dt-dock-item[data-win="${win}"]`);
export const browserBar = page => page.locator('.dt-window[data-win="site"] .dt-headerbar');

export const box = async locator => {
	const rect = await locator.boundingBox();
	expect(rect).not.toBeNull();
	return rect;
};

// Settled once no animation or transition is running on it.
export const settled = locator => expect.poll(() => locator.evaluate(el => el.getAnimations().length)).toBe(0);

export const terminalText = page => page.locator('.console .xterm-rows').innerText();

export const openTerminal = async page => {
	await dockItem(page, 'console').click();
	await expect(page.locator('.console .xterm-rows')).toContainText('robin@robinj.be:~/portfolio$');
};

export const run = async (page, command) => {
	await page.keyboard.type(command);
	await page.keyboard.press('Enter');
};
