import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act, waitFor} from '@testing-library/react';
import App from '../App';

// xterm.js needs a real browser; the shell itself is tested in src/console.
const session = vi.hoisted(() => ({startSession: vi.fn(() => ({focus() {}, stop() {}}))}));
vi.mock('../console/session', () => session);

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
	delete document.documentElement.dataset.accent;
	delete document.documentElement.dataset.font;
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
		expect(container.querySelector('.editor')).not.toBeNull();
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

	it('suggests a way back to the CV once the desktop has been empty for a while', () => {
		wideScreen();
		vi.useFakeTimers();
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/side-quests" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(4900));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		act(() => vi.advanceTimersByTime(100));
		expect(screen.getByRole('status')).toHaveTextContent('You look like you might be lost.');

		// The empty desktop no longer opens Activities when clicked.
		fireEvent.click(container.querySelector('.dt-stage'));
		expect(container.querySelector('.desktop.is-overview')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Back to my CV?'}));
		expect(focused(container)).toBe('Website');
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/cv');
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		pushSpy.mockRestore();
	});

	it('keeps the notification away once dismissed, until a window or the system menu opens', () => {
		wideScreen();
		vi.useFakeTimers();
		render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(5000));

		fireEvent.click(screen.getByRole('button', {name: 'Dismiss notification'}));
		act(() => vi.advanceTimersByTime(60_000));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();

		// The system menu counts as doing something: the wait starts once it's closed.
		fireEvent.click(screen.getByRole('button', {name: 'System menu'}));
		act(() => vi.advanceTimersByTime(10_000));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		fireEvent.click(screen.getByRole('button', {name: 'System menu'}));
		act(() => vi.advanceTimersByTime(5000));
		expect(screen.getByText('You look like you might be lost.')).toBeInTheDocument();

		// Opening a window answers it.
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
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

	it('opens the terminal from the dock, in front, without changing the URL', async () => {
		wideScreen();
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));

		expect(windows(container)).toEqual(['Website', 'Editor', 'Terminal']);
		expect(focused(container)).toBe('Terminal');
		expect(pushSpy).not.toHaveBeenCalled();
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		pushSpy.mockRestore();
	});

	it('brings the window behind back to the front when the terminal closes', async () => {
		wideScreen();
		const {container} = render(<App initialPath="/cv/source" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		fireEvent.click(screen.getByRole('button', {name: 'Close the terminal'}));

		await waitFor(() => expect(windows(container)).toEqual(['Website', 'Editor']));
		expect(focused(container)).toBe('Editor');
	});

	it('raises the editor on a file the terminal opens', async () => {
		wideScreen();
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		act(() => session.startSession.mock.calls.at(-1)[0].onOpenFile('side-quests'));

		expect(focused(container)).toBe('Editor');
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/side-quests/source');
		pushSpy.mockRestore();
	});

	it('shows the terminal its windows as processes, which it can kill and start', async () => {
		wideScreen();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		const processes = system.processes();
		expect(processes.map(proc => proc.name)).toEqual(['desktop', 'web', 'editor', 'terminal']);
		expect(system.terminalPid).toBe(processes[3].pid);

		act(() => {
			system.kill(processes[1].pid);
		});
		await waitFor(() => expect(windows(container)).toEqual(['Editor', 'Terminal']));
		expect(system.kill(processes[1].pid)).toBe('missing');

		act(() => system.launch('web'));
		expect(windows(container)).toEqual(['Website', 'Editor', 'Terminal']);
		expect(system.processes()[1].pid).not.toBe(processes[1].pid);
	});

	it('powers off through the console, then boots to an empty desktop', async () => {
		wideScreen();
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];

		vi.useFakeTimers();
		act(() => system.halt({
			mode: 'poweroff',
			shutdown: [{text: '[  OK  ] Reached target poweroff.target - System Power Off.', delay: 0}],
			boot: [{text: 'Welcome to RobinJ OS!', delay: 0}],
		}));
		act(() => vi.advanceTimersByTime(10));
		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Reached target poweroff.target');
		expect(windows(container)).toEqual([]);

		act(() => vi.advanceTimersByTime(800));
		expect(screen.queryByRole('button', {name: 'Power on'})).toBeNull();
		act(() => vi.advanceTimersByTime(3000));
		fireEvent.click(screen.getByRole('button', {name: 'Power on'}));
		act(() => vi.advanceTimersByTime(10));
		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Welcome to RobinJ OS!');

		act(() => vi.advanceTimersByTime(800));
		expect(screen.queryByRole('log', {name: 'System console'})).toBeNull();
		expect(windows(container)).toEqual([]);
		expect(container.querySelector('.desktop')).toHaveClass('is-overview');
		// Nothing's open, so after a while it suggests a way back.
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		act(() => vi.advanceTimersByTime(5000));
		expect(screen.getByText('You look like you might be lost.')).toBeInTheDocument();
	});

	it('panics when the desktop dies', async () => {
		wideScreen();
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];

		vi.useFakeTimers();
		act(() => system.halt({mode: 'panic', lines: ['Kernel panic - not syncing: Critical system component died!'], boot: [{text: 'Welcome to RobinOS!', delay: 0}]}));

		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Kernel panic - not syncing');
		expect(container.querySelector('.dt-stage')).toHaveAttribute('inert');

		// Frozen for a while, then off, as if it had shut down.
		act(() => vi.advanceTimersByTime(4000));
		expect(screen.getByRole('log', {name: 'System console'})).not.toHaveTextContent('Kernel panic');
		expect(windows(container)).toEqual([]);
		expect(screen.queryByRole('button', {name: 'Power on'})).toBeNull();
		act(() => vi.advanceTimersByTime(2000));
		fireEvent.click(screen.getByRole('button', {name: 'Power on'}));
		act(() => vi.advanceTimersByTime(10));
		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Welcome to RobinOS!');
	});

	it('switches the font, and remembers it', () => {
		wideScreen();
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'System menu'}));
		expect(screen.getByRole('radio', {name: 'Default Font'})).toHaveAttribute('aria-checked', 'true');

		fireEvent.click(screen.getByRole('radio', {name: 'Dyslexic Font'}));
		expect(document.documentElement.dataset.font).toBe('dyslexic');
		expect(storage.getItem('font')).toBe('dyslexic');

		fireEvent.click(screen.getByRole('radio', {name: 'Default Font'}));
		expect(document.documentElement.dataset.font).toBeUndefined();
		expect(storage.getItem('font')).toBeNull();
	});

	it('shows the device\'s battery where the browser tells', async () => {
		wideScreen();
		vi.stubGlobal('navigator', {...navigator, getBattery: () => Promise.resolve({level: 0.62, charging: true, addEventListener() {}, removeEventListener() {}})});
		render(<App initialPath="/cv" />);

		expect(await screen.findByRole('img', {name: 'Battery 62%, charging'})).toBeInTheDocument();
	});

	it('has no battery indicator where the browser doesn\'t tell', () => {
		wideScreen();
		render(<App initialPath="/cv" />);

		expect(screen.queryByRole('img', {name: /^Battery/})).toBeNull();
	});

	it('has no share button where the browser cannot share', () => {
		render(<App initialPath="/cv" />);

		expect(screen.queryByRole('button', {name: 'Share this website'})).toBeNull();
	});
});
