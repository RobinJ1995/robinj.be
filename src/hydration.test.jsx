import {describe, it, expect, vi, afterEach} from 'vitest';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {act} from '@testing-library/react';
import App from './App';
import {routes} from './entry-server';

const session = vi.hoisted(() => ({startSession: vi.fn(() => ({focus() {}, stop() {}}))}));
vi.mock('./console/session', () => session);

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
});

// The client's first render must match the prerendered page whatever the screen,
// since the server can't know it.
describe.each([
	['a large screen', () => false],
	['a small screen', query => query.includes('width < 900px')],
])('hydration on %s', (_, matches) => {
	it.each(routes)('takes over %s without a mismatch', async path => {
		vi.stubGlobal('matchMedia', query => ({matches: matches(query), addEventListener() {}, removeEventListener() {}}));
		window.history.replaceState(null, '', path);
		const root = document.createElement('div');
		root.innerHTML = renderToString(<App initialPath={path} />);
		document.body.append(root);

		const errors = [];
		await act(async () => {
			hydrateRoot(root, <App initialPath={path} />, {onRecoverableError: error => errors.push(String(error))});
		});

		expect(errors).toEqual([]);
	});
});
