import {describe, it, expect, vi, beforeEach} from 'vitest';

const client = vi.hoisted(() => ({createRoot: vi.fn(() => ({render: vi.fn()})), hydrateRoot: vi.fn()}));
vi.mock('react-dom/client', () => client);
vi.mock('./App', () => ({default: () => null}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

describe('the client', () => {
	it('takes over a prerendered page', async () => {
		document.body.innerHTML = '<div id="root"><div class="desktop"></div></div>';
		await import('./entry-client');

		expect(client.hydrateRoot).toHaveBeenCalledWith(document.getElementById('root'), expect.anything());
		expect(client.createRoot).not.toHaveBeenCalled();
	});

	it('renders the page itself where nothing was prerendered, as on the dev server', async () => {
		document.body.innerHTML = '<div id="root"><!--app-html--></div>';
		await import('./entry-client');

		expect(client.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
		expect(client.hydrateRoot).not.toHaveBeenCalled();
	});
});
