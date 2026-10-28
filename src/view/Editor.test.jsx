import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act} from '@testing-library/react';
import EditorApp, {forgetGitStats} from './Editor';

afterEach(() => {
	cleanup();
	forgetGitStats();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const HOUR = 3600_000;

// GitHub's API: the repository, then its latest commit with the page count in Link.
const github = ({pushedAt = new Date(Date.now() - 3 * HOUR).toISOString(), commits = true, repo = true} = {}) => vi.fn(url => Promise.resolve(url.includes('/commits')
	? {
		ok: commits,
		headers: {get: name => (name === 'Link' ? '<https://api.github.com/repositories/1/commits?per_page=1&sha=main&page=432>; rel="last"' : null)},
		json: () => Promise.resolve([{sha: 'abcdef1234567'}]),
	}
	: {ok: repo, json: () => Promise.resolve({default_branch: 'main', pushed_at: pushedAt})}));

const editor = (page = 'cv', props = {}) => render(<EditorApp page={page} onNavigate={vi.fn()} onToggleView={vi.fn()} {...props} />);

describe('editor', () => {
	it('shows the repository\'s branch, last push and commit count from GitHub', async () => {
		vi.stubGlobal('fetch', github());
		const {container} = editor();

		expect(await screen.findByText('432 commits')).toBeInTheDocument();
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('branch: main');
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('last commit: 3h ago');
		expect(container.querySelector('.editor-statusbar')).toHaveTextContent('Robin Jacobs · abcdef1');
	});

	it.each([
		[0, 'just now'],
		[5 * 60_000, '5m ago'],
		[2 * 24 * HOUR, '2d ago'],
		[40 * 24 * HOUR, '1mo ago'],
		[400 * 24 * HOUR, '1y ago'],
	])('says a push %ims ago was %s', async (ago, said) => {
		vi.stubGlobal('fetch', github({pushedAt: new Date(Date.now() - ago).toISOString()}));
		const {container} = editor();

		await screen.findByText('432 commits');
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent(`last commit: ${said}`);
	});

	it('keeps its placeholders when GitHub can\'t be reached', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
		const {container} = editor();
		await act(() => Promise.resolve());

		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('… commits');
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('last commit: …');
		expect(container.querySelector('.editor-statusbar')).toHaveTextContent('Robin Jacobs · …');
	});

	it('leaves the last push unsaid when GitHub\'s date can\'t be read', async () => {
		vi.stubGlobal('fetch', github({pushedAt: 'yesterday-ish'}));
		const {container} = editor();

		await screen.findByText('432 commits');
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('last commit: …');
	});

	it('scrolls the open file into view when the file list is a strip too wide for the screen', () => {
		vi.stubGlobal('fetch', github());
		const widths = {scrollWidth: 800, clientWidth: 300};
		for (const [name, value] of Object.entries(widths)) {
			Object.defineProperty(HTMLElement.prototype, name, {configurable: true, get: () => value});
		}
		const rect = Element.prototype.getBoundingClientRect;
		Element.prototype.getBoundingClientRect = function () {
			return {left: this.matches('.editor-files [aria-current]') ? 500 : 0};
		};

		const {container} = editor('contact');

		// Centred: 500px in, less half of what's left beside it (the link is 0px wide in jsdom).
		expect(container.querySelector('.editor-files').scrollLeft).toBe(350);
		Element.prototype.getBoundingClientRect = rect;
		for (const name of Object.keys(widths)) {
			delete HTMLElement.prototype[name];
		}
	});

	it('shows the last push but no count when the commits can\'t be listed', async () => {
		vi.stubGlobal('fetch', github({commits: false}));
		const {container} = editor();

		expect(await screen.findByText(/last commit: 3h ago/)).toBeInTheDocument();
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('… commits');
	});

	it('gives up on GitHub after six seconds', () => {
		vi.useFakeTimers();
		const signals = [];
		vi.stubGlobal('fetch', vi.fn((url, {signal}) => {
			signals.push(signal);
			return new Promise(() => {});
		}));
		editor();

		expect(signals[0].aborted).toBe(false);
		act(() => vi.advanceTimersByTime(6000));
		expect(signals[0].aborted).toBe(true);
	});

	it('names each file\'s language in the status bar', () => {
		vi.stubGlobal('fetch', github());
		const {container, rerender} = editor('whoami');
		const language = () => container.querySelector('.editor-statusbar').textContent;

		expect(language()).toContain('Plain Text');
		rerender(<EditorApp page="cv" onNavigate={vi.fn()} onToggleView={vi.fn()} />);
		expect(language()).toContain('Markdown');
		rerender(<EditorApp page="contact" onNavigate={vi.fn()} onToggleView={vi.fn()} />);
		expect(language()).toContain('YAML');
	});

	it('takes a caret but no typing', () => {
		vi.stubGlobal('fetch', github());
		editor();
		const text = screen.getByRole('textbox', {name: 'cv.md'});

		expect(text).toHaveAttribute('contenteditable', 'true');
		expect(text).toHaveAttribute('aria-readonly', 'true');
		expect(fireEvent(text, new InputEvent('beforeinput', {cancelable: true, bubbles: true}))).toBe(false);
	});

	it('puts back whatever an input method managed to compose into the text', () => {
		vi.stubGlobal('fetch', github());
		editor();
		const text = screen.getByRole('textbox', {name: 'cv.md'});
		text.append('typed');

		fireEvent.compositionEnd(text);

		const restored = screen.getByRole('textbox', {name: 'cv.md'});
		expect(restored).not.toBe(text);
		expect(restored).not.toHaveTextContent('typed');
	});

	it('doesn\'t navigate when the open file is picked again', () => {
		vi.stubGlobal('fetch', github());
		const onNavigate = vi.fn();
		editor('cv', {onNavigate});

		const sidebarLink = screen.getAllByRole('link', {name: 'cv.md'}).find(link => link.closest('.editor-sidebar'));
		expect(fireEvent.click(sidebarLink)).toBe(false);
		expect(onNavigate).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('link', {name: 'contact.yml'}));
		expect(onNavigate).toHaveBeenCalledWith('contact/source', expect.anything());
	});

	it('switches files from their tabs', () => {
		vi.stubGlobal('fetch', github());
		const onNavigate = vi.fn();
		const {container, rerender} = editor('cv', {onNavigate});
		rerender(<EditorApp page="contact" onNavigate={onNavigate} onToggleView={vi.fn()} />);

		fireEvent.click(container.querySelector('.editor-tab a[aria-label="cv.md"]'));

		expect(onNavigate).toHaveBeenCalledWith('cv/source', expect.anything());
	});

	it('makes do with what GitHub leaves out, and keeps its placeholders when it says no', async () => {
		vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(url.includes('/commits')
			? {ok: true, headers: {get: () => null}, json: () => Promise.resolve([])}
			: {ok: true, json: () => Promise.resolve({pushed_at: new Date().toISOString()})})));
		const {container, unmount} = editor();

		expect(await screen.findByText(/last commit: just now/)).toBeInTheDocument();
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('branch: master');
		expect(container.querySelector('.editor-sidebar')).toHaveTextContent('… commits');
		expect(container.querySelector('.editor-statusbar')).toHaveTextContent('Robin Jacobs · …');
		unmount();

		forgetGitStats();
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ok: false})));
		const refused = editor();
		await act(() => Promise.resolve());
		expect(refused.container.querySelector('.editor-sidebar')).toHaveTextContent('last commit: …');
	});

	it('asks GitHub once, however often it opens', async () => {
		vi.stubGlobal('fetch', github());
		const {unmount} = editor();
		await screen.findByText('432 commits');
		unmount();

		editor();

		expect(await screen.findByText('432 commits')).toBeInTheDocument();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('closes through onClose when it has one, and runs the page otherwise', () => {
		vi.stubGlobal('fetch', github());
		const onClose = vi.fn();
		const onToggleView = vi.fn();
		const {unmount} = editor('cv', {onClose, onToggleView});

		fireEvent.click(screen.getByRole('link', {name: 'Close the source view'}));
		expect(onClose).toHaveBeenCalled();
		expect(onToggleView).not.toHaveBeenCalled();
		unmount();

		editor('cv', {onToggleView});
		fireEvent.click(screen.getByRole('link', {name: 'Close the source view'}));
		expect(onToggleView).toHaveBeenCalled();
	});
});
