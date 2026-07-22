import React from 'react';
import {renderToString} from 'react-dom/server';
import App, {pageTitle} from './App';
import {PAGES} from './constants';

// The full set of routes to prerender, derived from PAGES so it stays in sync:
// the home page, every page, and every page's /source variant.
export const routes = (() => {
	const list = ['/'];

	for (const page of Object.values(PAGES)) {
		list.push(page.url);

		if (page.source) {
			list.push(`${page.url}/source`);
		}
	}

	return list;
})();

export function render(path) {
	const html = renderToString(<App initialPath={path} />);

	return {html, title: pageTitle(path)};
}
