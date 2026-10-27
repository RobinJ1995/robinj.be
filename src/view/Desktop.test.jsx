import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act} from '@testing-library/react';
import App from '../App';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
	delete document.documentElement.dataset.accent;
});

// jsdom has no matchMedia, so by default the app behaves as on a phone.
const wideScreen = () => vi.stubGlobal('matchMedia', query => ({
	matches: query === '(min-width: 900px)',
	addEventListener() {},
	removeEventListener() {},
}));

const memoryStorage = () => {
	const items = new Map();

	return {
		getItem: key => items.get(key) ?? null,
		setItem: (key, value) => items.set(key, String(value)),
		removeItem: key => items.delete(key),
	};
};

const windows = container => [...container.querySelectorAll('.dt-window')].map(w => w.getAttribute('aria-label'));
const focused = container => container.querySelector('.dt-window.is-focused')?.getAttribute('aria-label') ?? null;

describe('desktop', () => {
	it('keeps both windows on screen, with the website in front', () => {
		wideScreen();
		const {container} = render(<App initialPath="/contact" />);

		expect(windows(container)).toEqual(['Website', 'Editor']);
		expect(focused(container)).toBe('Website');
		expect(container.querySelector('.terminal')).not.toBeNull();
	});

	it('raises the editor when it is clicked, and the URL follows', () => {
		wideScreen();
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/contact" />);

		fireEvent.click(screen.getByRole('button', {name: 'Switch to Editor'}));

		expect(focused(container)).toBe('Editor');
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/contact/source');
		pushSpy.mockRestore();
	});

	it('switches windows from the dock', () => {
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('link', {name: 'Editor'}));
		expect(focused(container)).toBe('Editor');

		fireEvent.click(screen.getByRole('link', {name: 'Website'}));
		expect(focused(container)).toBe('Website');
	});

	it('shows every open window in Activities, and picking one focuses it', () => {
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));
		expect(windows(container)).toEqual(['Website', 'Editor']);

		fireEvent.click(screen.getByRole('button', {name: 'Switch to Editor'}));
		expect(focused(container)).toBe('Editor');
		expect(container.querySelector('.desktop.is-overview')).toBeNull();
	});

	it('leaves an empty desktop when the last window closes, and the dock starts one again', () => {
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		expect(windows(container)).toEqual(['Editor']);

		fireEvent.click(screen.getByTitle('Close'));
		expect(windows(container)).toEqual([]);
		expect(container.querySelector('.desktop.is-overview')).toBeNull();
		expect(screen.getByRole('button', {name: 'Activities'})).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Website'}));
		expect(focused(container)).toBe('Website');
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});

	it('opens Activities with a way back to the CV when the empty desktop is clicked', () => {
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/side-quests" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		fireEvent.click(screen.getByTitle('Close'));
		fireEvent.click(container.querySelector('.dt-stage'));
		expect(container.querySelector('.desktop.is-overview')).not.toBeNull();
		expect(screen.getByText('You look like you might be lost.')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('link', {name: 'Back to my CV?'}));

		expect(focused(container)).toBe('Website');
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/cv');
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
		pushSpy.mockRestore();
	});

	it('leaves closed windows out of Activities', () => {
		const {container} = render(<App initialPath="/side-quests/source" />);

		fireEvent.click(screen.getByTitle('Close'));
		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));

		expect(windows(container)).toEqual(['Website']);
	});

	it('lets a closing window animate out before removing it', () => {
		wideScreen();
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		expect(container.querySelector('.dt-window.is-closing')?.getAttribute('aria-label')).toBe('Website');
		expect(focused(container)).toBe('Editor');

		act(() => vi.advanceTimersByTime(250));
		expect(windows(container)).toEqual(['Editor']);
	});

	it('sets the style to light, auto or dark from the system menu, and remembers it', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'System menu'}));
		expect(screen.getByRole('radio', {name: 'Auto'})).toHaveAttribute('aria-checked', 'true');

		fireEvent.click(screen.getByRole('radio', {name: 'Dark'}));
		expect(document.documentElement.dataset.theme).toBe('dark');
		expect(storage.getItem('theme')).toBe('dark');

		fireEvent.click(screen.getByRole('radio', {name: 'Light'}));
		expect(document.documentElement.dataset.theme).toBe('light');

		fireEvent.click(screen.getByRole('radio', {name: 'Auto'}));
		expect(document.documentElement.dataset.theme).toBeUndefined();
		expect(storage.getItem('theme')).toBeNull();
	});

	it('sets the accent colour from the system menu, green being the default', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'System menu'}));
		expect(screen.getByRole('radio', {name: 'Green'})).toHaveAttribute('aria-checked', 'true');

		fireEvent.click(screen.getByRole('radio', {name: 'Purple'}));
		expect(document.documentElement.dataset.accent).toBe('purple');
		expect(storage.getItem('accent')).toBe('purple');

		fireEvent.click(screen.getByRole('radio', {name: 'Green'}));
		expect(document.documentElement.dataset.accent).toBeUndefined();
		expect(storage.getItem('accent')).toBeNull();
	});

	it('shares the website, not the current page, where the browser can share', () => {
		const share = vi.fn(() => Promise.resolve());
		vi.stubGlobal('navigator', {...navigator, share});
		render(<App initialPath="/side-quests" />);

		fireEvent.click(screen.getByRole('button', {name: 'Share this website'}));

		expect(share).toHaveBeenCalledWith({title: 'Robin Jacobs', url: 'https://robinj.be/'});
	});

	it('has no share button where the browser cannot share', () => {
		render(<App initialPath="/cv" />);

		expect(screen.queryByRole('button', {name: 'Share this website'})).toBeNull();
	});
});
