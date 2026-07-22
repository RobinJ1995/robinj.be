import React from 'react';
import {renderToString} from 'react-dom/server';
import App, {pageTitle} from './App';
import {PAGES} from './constants';

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
