import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act, waitFor, within} from '@testing-library/react';
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
	delete Element.prototype.animate;
});

// jsdom has no matchMedia, so by default the screen is a large one.
const smallScreen = () => vi.stubGlobal('matchMedia', query => ({
	matches: query.includes('width < 900px'),
	addEventListener() {},
	removeEventListener() {},
}));

const reducedMotion = (small = false) => vi.stubGlobal('matchMedia', query => ({
	matches: query.includes('reduce') || (small && query.includes('width < 900px')),
	addEventListener() {},
	removeEventListener() {},
}));

// jsdom can't animate: records which element each animation was asked of, and its keyframes.
const recordAnimations = () => {
	const animate = vi.fn();
	Element.prototype.animate = animate;
	return el => animate.mock.calls.filter((_, i) => animate.mock.contexts[i] === el).map(([keyframes]) => keyframes);
};

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
		const {container} = render(<App initialPath="/contact" />);

		expect(windows(container)).toEqual(['Website', 'Editor']);
		expect(focused(container)).toBe('Website');
		expect(container.querySelector('.editor')).not.toBeNull();
	});

	it('raises the editor when it is clicked', () => {
		const {container} = render(<App initialPath="/contact" />);

		fireEvent.click(screen.getByRole('button', {name: 'Switch to Editor'}));

		expect(focused(container)).toBe('Editor');
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

	it('leaves an empty desktop in Activities when the last window closes, and the dock starts one again', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(250));
		expect(windows(container)).toEqual(['Editor']);

		// Once it has finished closing, so as not to cut that short.
		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(100));
		expect(container.querySelector('.dt-window.is-closing')).not.toBeNull();
		expect(screen.getByRole('button', {name: 'Activities'})).toHaveAttribute('aria-pressed', 'false');
		act(() => vi.advanceTimersByTime(150));
		expect(windows(container)).toEqual([]);
		expect(screen.getByRole('button', {name: 'Activities'})).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Website'}));
		expect(screen.getByRole('button', {name: 'Activities'})).toHaveAttribute('aria-pressed', 'false');
		expect(focused(container)).toBe('Website');
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});

	it('suggests a way back to the CV once the desktop has been empty for a while', () => {
		vi.useFakeTimers();
		window.history.replaceState(null, '', '/side-quests');
		const {container} = render(<App initialPath="/side-quests" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(3900));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		act(() => vi.advanceTimersByTime(100));
		expect(screen.getByRole('status')).toHaveTextContent('You look like you might be lost.');

		// The bare desktop leaves Activities when clicked, and doesn't open it again.
		fireEvent.click(container.querySelector('.dt-stage'));
		fireEvent.click(container.querySelector('.dt-stage'));
		expect(container.querySelector('.desktop.is-overview')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Back to my CV?'}));
		expect(focused(container)).toBe('Website');
		expect(window.location.pathname).toBe('/cv');
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
	});

	it('blurs the wallpaper behind open windows, and opens Activities once the last one closes', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);
		const desktop = container.querySelector('.desktop');
		expect(desktop).toHaveClass('has-windows');
		expect(desktop).not.toHaveClass('is-overview');

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		expect(desktop).not.toHaveClass('is-overview');
		fireEvent.click(screen.getByTitle('Close'));

		expect(desktop).not.toHaveClass('has-windows');
		act(() => vi.advanceTimersByTime(250));
		expect(desktop).toHaveClass('is-overview');
	});

	it('suggests a way back sooner on a phone', () => {
		smallScreen();
		vi.useFakeTimers();
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(2900));
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();
		act(() => vi.advanceTimersByTime(100));
		expect(screen.getByRole('status')).toHaveTextContent('You look like you might be lost.');
	});

	it('minimises a window closed on a phone into its dock icon, taking a moment longer', () => {
		smallScreen();
		const animations = recordAnimations();
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv/source" />);

		fireEvent.click(screen.getByTitle('Close'));
		expect(focused(container)).toBe('Website');
		expect(animations(container.querySelector('[data-win="source"]'))[0].at(-1)).toMatchObject({'--dt-fade': 0, 'zIndex': 10});
		expect(animations(container.querySelector('[data-win="site"]'))[0].at(-1)).toMatchObject({'--dt-fade': 1, 'transform': 'none'});
		act(() => vi.advanceTimersByTime(250));
		expect(windows(container)).toEqual(['Website', 'Editor']);
		act(() => vi.advanceTimersByTime(50));
		expect(windows(container)).toEqual(['Website']);
	});

	it('slides the browser bar away as the page scrolls down on a phone, and back as it scrolls up', () => {
		smallScreen();
		const {container} = render(<App initialPath="/cv" />);
		const bar = container.querySelector('[data-win="site"] .dt-headerbar');
		const page = container.querySelector('[data-win="site"] .editorial');
		let height = 3000;
		Object.defineProperties(page, {scrollHeight: {get: () => height}, clientHeight: {value: 600}});
		const scrollTo = top => {
			page.scrollTop = top;
			fireEvent.scroll(page);
		};

		scrollTo(4);
		expect(bar).not.toHaveClass('is-hidden');
		scrollTo(200);
		expect(bar).toHaveClass('is-hidden');
		scrollTo(196);
		expect(bar).toHaveClass('is-hidden');

		// The browser keeping the reader's place as the page shrinks isn't scrolling up.
		height = 2900;
		scrollTo(100);
		expect(bar).toHaveClass('is-hidden');

		scrollTo(50);
		expect(bar).not.toHaveClass('is-hidden');
	});

	it('minimises the window in front to its dock icon on a phone, and restores the next from its own', () => {
		smallScreen();
		const animations = recordAnimations();
		const {container} = render(<App initialPath="/cv/source" />);

		fireEvent.click(container.querySelector('.dt-dock-item[data-win="site"]'));

		const [minimise] = animations(container.querySelector('[data-win="source"]'));
		expect(minimise[0]).toMatchObject({'--dt-fade': 1, 'transform': 'none'});
		expect(minimise[1]).toMatchObject({'--dt-fade': 0, 'zIndex': 10, 'transform': expect.stringMatching(/^translate\(.+\) scale\(.+\)$/)});
		const [restore] = animations(container.querySelector('[data-win="site"]'));
		expect(restore[0]).toMatchObject({'--dt-fade': 0, 'visibility': 'visible'});
		expect(restore[1]).toMatchObject({'--dt-fade': 1, 'transform': 'none'});
	});

	it('moves windows into and out of Activities without minimising them', () => {
		smallScreen();
		const animations = recordAnimations();
		const {container} = render(<App initialPath="/cv/source" />);

		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));
		fireEvent.click(screen.getByRole('button', {name: 'Switch to Website'}));

		expect(focused(container)).toBe('Website');
		expect(animations(container.querySelector('[data-win="site"]'))).toEqual([]);
		expect(animations(container.querySelector('[data-win="source"]'))).toEqual([]);
	});

	it('doesn\'t minimise windows on a large screen, or where motion is reduced', () => {
		const animations = recordAnimations();
		const {container, unmount} = render(<App initialPath="/cv/source" />);
		fireEvent.click(container.querySelector('.dt-dock-item[data-win="site"]'));
		expect(animations(container.querySelector('[data-win="source"]'))).toEqual([]);
		unmount();

		reducedMotion(true);
		const {container: reduced} = render(<App initialPath="/cv/source" />);
		fireEvent.click(reduced.querySelector('.dt-dock-item[data-win="site"]'));
		expect(focused(reduced)).toBe('Website');
		expect(animations(reduced.querySelector('[data-win="source"]'))).toEqual([]);
	});

	it('closes windows at once where motion is reduced', () => {
		reducedMotion();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));

		expect(windows(container)).toEqual(['Editor']);
	});

	it('closes a window only once, however often its close button is clicked', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(250));

		expect(windows(container)).toEqual(['Editor']);
		expect(focused(container)).toBe('Editor');
	});

	it('leaves Activities on Escape, or on a click on the bare desktop', () => {
		const {container} = render(<App initialPath="/cv" />);
		const desktop = container.querySelector('.desktop');

		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));
		fireEvent.keyDown(document, {key: 'Enter'});
		expect(desktop).toHaveClass('is-overview');
		fireEvent.keyDown(document, {key: 'Escape'});
		expect(desktop).not.toHaveClass('is-overview');

		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));
		fireEvent.click(container.querySelector('.dt-window'));
		expect(desktop).toHaveClass('is-overview');
		fireEvent.click(container.querySelector('.dt-stage'));
		expect(desktop).not.toHaveClass('is-overview');
	});

	it('closes the system menu on Escape, or on a press outside it', () => {
		render(<App initialPath="/cv" />);
		const button = screen.getByRole('button', {name: 'System menu'});
		const menu = () => screen.queryByRole('dialog', {name: 'System menu'});

		fireEvent.click(button);
		fireEvent.pointerDown(screen.getByRole('radio', {name: 'Dark'}));
		fireEvent.keyDown(document, {key: 'Enter'});
		expect(menu()).toBeInTheDocument();
		fireEvent.keyDown(document, {key: 'Escape'});
		expect(menu()).toBeNull();

		fireEvent.click(button);
		fireEvent.pointerDown(document.body);
		expect(menu()).toBeNull();
		expect(button).toHaveAttribute('aria-expanded', 'false');
	});

	it('keeps keyboard focus where it is when the dock is pressed', () => {
		const {container} = render(<App initialPath="/cv" />);

		expect(fireEvent.mouseDown(container.querySelector('.dt-dock-item[data-win="source"]'))).toBe(false);
	});

	it('fits the desktop above an on-screen keyboard laid over the page, but not a pinch-zoom', () => {
		const viewport = Object.assign(new EventTarget(), {height: 800, offsetTop: 0, scale: 1});
		vi.stubGlobal('visualViewport', viewport);
		Object.defineProperty(document.documentElement, 'clientHeight', {configurable: true, value: 800});
		const {container} = render(<App initialPath="/cv" />);
		const desktop = container.querySelector('.desktop');

		Object.assign(viewport, {height: 450, offsetTop: 120});
		act(() => viewport.dispatchEvent(new Event('resize')));
		expect(desktop.style.height).toBe('450px');
		expect(desktop.style.transform).toBe('translateY(120px)');

		Object.assign(viewport, {scale: 2});
		act(() => viewport.dispatchEvent(new Event('scroll')));
		expect(desktop.style.height).toBe('');
		expect(desktop.style.transform).toBe('');
		delete document.documentElement.clientHeight;
	});

	it('follows the battery as it charges and drains', async () => {
		const handlers = {};
		const battery = {
			level: 0.5,
			charging: false,
			addEventListener: (type, handler) => {
				handlers[type] = handler;
			},
			removeEventListener: vi.fn(),
		};
		vi.stubGlobal('navigator', {...navigator, getBattery: () => Promise.resolve(battery)});
		const {unmount} = render(<App initialPath="/cv" />);
		expect(await screen.findByRole('img', {name: 'Battery 50%'})).toBeInTheDocument();

		battery.level = 0.2;
		act(() => handlers.levelchange());
		expect(screen.getByRole('img', {name: 'Battery 20%'})).toBeInTheDocument();
		battery.charging = true;
		act(() => handlers.chargingchange());
		expect(screen.getByRole('img', {name: 'Battery 20%, charging'})).toBeInTheDocument();

		unmount();
		expect(battery.removeEventListener).toHaveBeenCalledTimes(2);
	});

	it('ignores a battery that answers after the desktop has gone', async () => {
		let answer;
		const battery = {level: 0.5, charging: false, addEventListener: vi.fn(), removeEventListener: vi.fn()};
		vi.stubGlobal('navigator', {...navigator, getBattery: () => new Promise(resolve => {
			answer = resolve;
		})});
		const {unmount} = render(<App initialPath="/cv" />);
		unmount();

		await act(async () => answer(battery));

		expect(battery.addEventListener).not.toHaveBeenCalled();
	});

	it('reboots through the console, straight back into Activities', async () => {
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		const console = () => screen.queryByRole('log', {name: 'System console'});

		vi.useFakeTimers();
		act(() => system.halt({
			mode: 'reboot',
			shutdown: [{text: '[  OK  ] Reached target reboot.target - System Reboot.', delay: 0}],
			boot: [{text: 'Welcome to RobinOS!', delay: 0}],
		}));
		act(() => vi.advanceTimersByTime(10));
		expect(console()).toHaveTextContent('Reached target reboot.target');

		// No power button: it comes straight back up.
		act(() => vi.advanceTimersByTime(800));
		expect(screen.queryByRole('button', {name: 'Power on'})).toBeNull();
		act(() => vi.advanceTimersByTime(1200));
		act(() => vi.advanceTimersByTime(10));
		expect(console()).toHaveTextContent('Welcome to RobinOS!');

		act(() => vi.advanceTimersByTime(800));
		expect(console()).toBeNull();
		expect(container.querySelector('.desktop')).toHaveClass('is-overview');
		expect(container.querySelector('.dt-screen')).toHaveClass('is-starting');
	});

	it('gets the jitters while the caffeine module is loaded, and a cup in the top bar', async () => {
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		expect(system.caffeinated).toBe(false);

		act(() => system.caffeinate(true));
		expect(system.caffeinated).toBe(true);
		expect(container.querySelector('.desktop')).toHaveClass('is-caffeinated');
		expect(screen.getByRole('img', {name: 'Caffeine loaded'})).toBeInTheDocument();

		act(() => system.caffeinate(false));
		expect(system.caffeinated).toBe(false);
		expect(container.querySelector('.desktop')).not.toHaveClass('is-caffeinated');
		expect(screen.queryByRole('img', {name: 'Caffeine loaded'})).toBeNull();
	});

	it('sobers up when the machine goes down', async () => {
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		act(() => system.caffeinate(true));

		vi.useFakeTimers();
		act(() => system.halt({mode: 'reboot', shutdown: [{text: 'Rebooting.', delay: 0}], boot: [{text: 'Welcome to RobinOS!', delay: 0}]}));

		expect(container.querySelector('.desktop')).not.toHaveClass('is-caffeinated');
		expect(system.caffeinated).toBe(false);
	});

	it('starts a phone with just the website, unless the URL asks for the editor', () => {
		smallScreen();
		const {container, unmount} = render(<App initialPath="/cv" />);
		expect(windows(container)).toEqual(['Website']);
		unmount();

		const {container: source} = render(<App initialPath="/cv/source" />);
		expect(windows(source)).toEqual(['Website', 'Editor']);
		expect(focused(source)).toBe('Editor');
	});

	it('keeps the notification away once dismissed, until a window or the system menu opens', () => {
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
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/side-quests/source" />);

		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(250));
		fireEvent.click(screen.getByRole('button', {name: 'Activities'}));

		expect(windows(container)).toEqual(['Website']);
	});

	it('lets a closing window animate out before removing it', () => {
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
		const {container} = render(<App initialPath="/cv/source" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		fireEvent.click(screen.getByRole('button', {name: 'Close the terminal'}));

		await waitFor(() => expect(windows(container)).toEqual(['Website', 'Editor']));
		expect(focused(container)).toBe('Editor');
	});

	it('raises the editor on a file the terminal opens', async () => {
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		act(() => session.startSession.mock.calls.at(-1)[0].onOpenFile('side-quests'));

		expect(focused(container)).toBe('Editor');
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/side-quests');
		pushSpy.mockRestore();
	});

	it('shows the terminal its windows as processes, which it can kill and start', async () => {
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		const processes = system.processes();
		expect(processes.map(proc => proc.name)).toEqual(['desktop', 'web', 'editor', 'terminal']);
		expect(system.terminalPid).toBe(processes[3].pid);
		expect(system.bootedAt).toBeInstanceOf(Date);
		const pid = system.pid();
		expect(system.pid()).toBe(pid + 1);

		act(() => {
			system.kill(processes[1].pid);
		});
		await waitFor(() => expect(windows(container)).toEqual(['Editor', 'Terminal']));
		expect(system.kill(processes[1].pid)).toBe('missing');

		act(() => system.launch('web'));
		expect(windows(container)).toEqual(['Website', 'Editor', 'Terminal']);
		expect(system.processes()[1].pid).not.toBe(processes[1].pid);
	});

	it('opens the video player the terminal launches, in the dock while it runs, and lists it as a process', async () => {
		window.history.replaceState(null, '', '/cv');
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		expect(screen.queryByRole('button', {name: 'Video Player'})).toBeNull();

		act(() => system.launch('video-player'));

		expect(focused(container)).toBe('Video Player');
		expect(screen.getByRole('button', {name: 'Video Player'})).toHaveClass('is-running');
		const video = system.processes().find(proc => proc.name === 'video-player');
		expect(video).toBeDefined();
		expect(window.location.pathname).toBe('/cv');

		act(() => {
			system.kill(video.pid);
		});
		await waitFor(() => expect(windows(container)).not.toContain('Video Player'));
		expect(screen.queryByRole('button', {name: 'Video Player'})).toBeNull();
	});

	it('opens links in a new tab of the visitor\'s browser, cut off from this one', async () => {
		render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		const tab = {opener: window};
		vi.stubGlobal('open', vi.fn(() => tab));

		expect(system.openUrl('https://github.com/RobinJ1995/robinj.be')).toBe(true);
		expect(window.open).toHaveBeenCalledWith('https://github.com/RobinJ1995/robinj.be', '_blank');
		expect(tab.opener).toBeNull();

		window.open.mockReturnValue(null);
		expect(system.openUrl('https://github.com/RobinJ1995/robinj.be')).toBe(false);
	});

	it('remembers where a window was put until it is closed', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);
		const site = () => container.querySelector('[data-win="site"]');
		const bar = site().querySelector('[data-titlebar]');
		vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({left: 0, right: 500, top: 0, bottom: 46});

		fireEvent.pointerDown(bar, {clientX: 100, clientY: 20});
		fireEvent.pointerMove(site(), {clientX: 150, clientY: 60});
		fireEvent.pointerUp(site());
		expect(site().style.left).not.toBe('');

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(500));
		fireEvent.click(screen.getByRole('link', {name: 'Website'}));
		expect(site().style.left).toBe('');
	});

	it('keeps a window that was put somewhere within reach as the screen shrinks, and puts it back as it grows', () => {
		const {container} = render(<App initialPath="/cv" />);
		const site = () => container.querySelector('[data-win="site"]');
		const stage = container.querySelector('.dt-stage');
		const size = (width, height) => {
			Object.defineProperty(stage, 'clientWidth', {value: width, configurable: true});
			Object.defineProperty(stage, 'clientHeight', {value: height, configurable: true});
			act(() => window.dispatchEvent(new Event('resize')));
		};
		size(1600, 1000);
		vi.spyOn(site().querySelector('[data-titlebar]'), 'getBoundingClientRect').mockReturnValue({left: 0, right: 500, top: 0, bottom: 46});
		vi.spyOn(site(), 'offsetWidth', 'get').mockReturnValue(1200);
		vi.spyOn(site(), 'offsetHeight', 'get').mockReturnValue(800);

		fireEvent.pointerDown(site().querySelector('[data-titlebar]'), {clientX: 100, clientY: 20});
		fireEvent.pointerMove(site(), {clientX: 500, clientY: 220});
		expect(site().style).toMatchObject({left: '400px', top: '200px', width: '1200px', height: '800px'});

		// Away from the screen's edges, as no dock's to be seen here.
		size(1000, 700);
		expect(site().style).toMatchObject({left: '8px', top: '0px', width: '984px', height: '692px'});

		size(1600, 1000);
		expect(site().style).toMatchObject({left: '400px', top: '200px', width: '1200px', height: '800px'});
	});

	it('leaves where windows were put alone while they are maximised', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);
		const site = () => container.querySelector('[data-win="site"]');
		const stage = container.querySelector('.dt-stage');
		const size = (width, height) => {
			Object.defineProperty(stage, 'clientWidth', {value: width, configurable: true});
			Object.defineProperty(stage, 'clientHeight', {value: height, configurable: true});
			act(() => window.dispatchEvent(new Event('resize')));
			act(() => vi.advanceTimersByTime(1000));
		};
		size(1600, 1000);
		vi.spyOn(site().querySelector('[data-titlebar]'), 'getBoundingClientRect').mockReturnValue({left: 0, right: 500, top: 0, bottom: 46});
		vi.spyOn(site(), 'offsetWidth', 'get').mockReturnValue(1200);
		vi.spyOn(site(), 'offsetHeight', 'get').mockReturnValue(800);
		fireEvent.pointerDown(site().querySelector('[data-titlebar]'), {clientX: 100, clientY: 20});
		fireEvent.pointerMove(site(), {clientX: 500, clientY: 220});

		smallScreen();
		size(800, 500);
		vi.unstubAllGlobals();
		size(1600, 1000);

		expect(site().style).toMatchObject({left: '400px', top: '200px', width: '1200px', height: '800px'});
	});

	it('neither moves nor resizes windows where they are maximised', () => {
		smallScreen();
		const {container} = render(<App initialPath="/cv" />);
		const site = container.querySelector('[data-win="site"]');
		vi.spyOn(site.querySelector('[data-titlebar]'), 'getBoundingClientRect').mockReturnValue({left: 0, right: 500, top: 0, bottom: 46});

		fireEvent.pointerDown(site.querySelector('[data-titlebar]'), {clientX: 100, clientY: 20});
		fireEvent.pointerMove(site, {clientX: 150, clientY: 60});

		expect(site.style.left).toBe('');
		expect(site.querySelector('[data-resize]')).toBeNull();
	});

	it('prints the website\'s page from a copy laid out for the occasion, whatever windows are open', () => {
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/contact" />);
		const copy = () => container.querySelector('.dt-print');
		expect(copy()).toBeNull();

		act(() => window.dispatchEvent(new Event('beforeprint')));
		expect(copy()).toHaveTextContent(/on LinkedIn/);
		act(() => window.dispatchEvent(new Event('afterprint')));
		expect(copy()).toBeNull();

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(500));
		act(() => window.dispatchEvent(new Event('beforeprint')));
		expect(copy()).toHaveTextContent(/on LinkedIn/);
	});

	it('powers off through the console, then boots to an empty desktop', async () => {
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
		// Shutting down closes every window without opening Activities.
		expect(container.querySelector('.desktop')).not.toHaveClass('is-overview');

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

	it('unloads the caffeine and adhd modules the moment it panics, leaving the windows be', async () => {
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		vi.useFakeTimers();
		act(() => {
			system.caffeinate(true);
			system.distract(true);
		});
		expect(container.querySelector('.desktop')).toHaveClass('is-caffeinated');
		act(() => vi.advanceTimersByTime(1000));
		const before = windows(container);

		act(() => system.halt({mode: 'panic', lines: ['Kernel panic - not syncing: Fatal exception'], boot: []}));

		expect(system.caffeinated).toBe(false);
		expect(system.distracted).toBe(false);
		expect(container.querySelector('.desktop')).not.toHaveClass('is-caffeinated');
		act(() => vi.advanceTimersByTime(3900));
		expect(windows(container)).toEqual(before);
		expect(container.querySelector('.dt-window.is-closing')).toBeNull();
	});

	it('panics once there are ten browser windows open', async () => {
		const controls = {current: null};
		const {container} = render(<App initialPath="/cv" controls={controls} />);
		const desktop = controls.current;

		act(() => {
			for (let i = 0; i < 8; i++) {
				desktop.open('site', {url: `https://example.com/${i}`});
			}
		});
		expect(windows(container).filter(name => name === 'Website')).toHaveLength(9);
		await act(() => vi.dynamicImportSettled());
		expect(screen.queryByRole('log', {name: 'System console'})).toBeNull();

		act(() => desktop.open('site', {url: 'https://example.com/9'}));
		await waitFor(() => expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Kernel panic - not syncing: System resources exhausted'));
		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('Comm: web');
		expect(screen.getByRole('log', {name: 'System console'})).toHaveTextContent('just_one_more_tab+0x9/0xa [adhd]');
	});

	it('switches the font, and remembers it', () => {
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
		vi.stubGlobal('navigator', {...navigator, getBattery: () => Promise.resolve({level: 0.62, charging: true, addEventListener() {}, removeEventListener() {}})});
		render(<App initialPath="/cv" />);

		expect(await screen.findByRole('img', {name: 'Battery 62%, charging'})).toBeInTheDocument();
	});

	it('has no battery indicator where the browser doesn\'t tell', () => {
		render(<App initialPath="/cv" />);

		expect(screen.queryByRole('img', {name: /^Battery/})).toBeNull();
	});

	it('has no share button where the browser cannot share', () => {
		render(<App initialPath="/cv" />);

		expect(screen.queryByRole('button', {name: 'Share this website'})).toBeNull();
	});
});

describe('more than one window of an app', () => {
	// The app, with the desktop's controls in hand.
	const withControls = (path = '/cv') => {
		window.history.replaceState(null, '', path);
		const controls = {current: null};
		const rendered = render(<App initialPath={path} controls={controls} />);
		return {...rendered, desktop: controls.current};
	};
	const windowsOf = (container, name) => [...container.querySelectorAll(`.dt-window[aria-label="${name}"]`)];

	it('opens the website on another site, with its address but nothing to share', () => {
		vi.stubGlobal('navigator', {...navigator, share: vi.fn(async () => {})});
		const {container, desktop} = withControls();

		let win;
		act(() => {
			win = desktop.open('site', {url: 'https://en.wikipedia.org/wiki/Main_Page'});
		});
		act(() => desktop.show(win));

		expect(win).toBe('site-2');
		const [own, other] = windowsOf(container, 'Website');
		expect(other.querySelector('.dt-address')).toHaveTextContent('en.wikipedia.org/wiki/Main_Page');
		expect(other.querySelector('iframe').src).toBe('https://en.wikipedia.org/wiki/Main_Page');
		expect(within(other).queryByRole('button', {name: 'Share this website'})).toBeNull();
		expect(within(own).getByRole('button', {name: 'Share this website'})).toBeInTheDocument();
		expect(own.querySelector('.dt-address')).toHaveTextContent('robinj.be/cv');

		act(() => {
			expect(desktop.update(win, {url: 'https://en.wikipedia.org/wiki/Linux'})).toBe(true);
		});
		expect(other.querySelector('.dt-address')).toHaveTextContent('en.wikipedia.org/wiki/Linux');
	});

	it('shows the page in every window of the website, and follows it in all of them', () => {
		const {container, desktop} = withControls();

		act(() => {
			desktop.open('site', {portfolio: true});
		});
		act(() => desktop.navigate('contact'));

		expect(windowsOf(container, 'Website').map(win => win.querySelector('.dt-address').textContent)).toEqual(['robinj.be/contact', 'robinj.be/contact']);
		expect(window.location.pathname).toBe('/contact');
	});

	it('opens the editor empty, or on a new file only the desktop writes in', () => {
		const {container, desktop} = withControls();

		let blank;
		let file;
		act(() => {
			blank = desktop.open('source', {});
			file = desktop.open('source', {file: {name: 'Untitled-1', text: 'one\ntwo'}});
		});

		const [, empty, untitled] = windowsOf(container, 'Editor');
		expect([blank, file]).toEqual(['source-2', 'source-3']);
		expect(empty.querySelector('.editor-title')).toHaveTextContent('Editor');
		expect(empty).toHaveTextContent('No open files');
		expect(empty.querySelector('.editor-files').children).toHaveLength(0);
		expect(within(empty).queryByRole('link', {name: 'Run'})).toBeNull();
		const lines = () => [...untitled.querySelectorAll('.editor-line')].map(line => line.textContent);
		expect(lines()).toEqual(['one', 'two']);
		expect(within(untitled).getByRole('textbox', {name: 'Untitled-1'})).toHaveAttribute('aria-readonly', 'true');

		act(() => desktop.update(file, {file: {name: 'Untitled-1', text: 'three'}}));
		expect(lines()).toEqual(['three']);
	});

	it('plays a different video in each video player', () => {
		const {container, desktop} = withControls();

		act(() => {
			desktop.open('video', {});
			desktop.open('video', {video: {youtube: 'x6MsDjLnXzE', start: 42}});
		});

		const [library, playing] = windowsOf(container, 'Video Player');
		expect(within(library).getByRole('button', {name: 'video.mp4'})).toBeInTheDocument();
		expect(playing.querySelector('iframe').src).toBe('https://www.youtube-nocookie.com/embed/x6MsDjLnXzE?autoplay=1&rel=0&fs=0&start=42');
	});

	it('gives each terminal a session and a process of its own', async () => {
		const {container, desktop} = withControls();
		const before = session.startSession.mock.calls.length;

		// One after the other: Vitest can hand imports racing for a mocked module the real one.
		act(() => desktop.show(desktop.open('console', {})));
		await waitFor(() => expect(session.startSession).toHaveBeenCalledTimes(before + 1));
		act(() => desktop.show(desktop.open('console', {})));
		await waitFor(() => expect(session.startSession).toHaveBeenCalledTimes(before + 2));

		const [first, second] = session.startSession.mock.calls.slice(-2).map(([options]) => options.system);
		expect(first.terminalPid).not.toBe(second.terminalPid);
		expect(first.processes().filter(proc => proc.name === 'terminal').map(proc => proc.pid)).toEqual([first.terminalPid, second.terminalPid]);

		act(() => {
			first.kill(second.terminalPid);
		});
		await waitFor(() => expect(windowsOf(container, 'Terminal')).toHaveLength(1));
	});

	it('shows an app\'s windows in Activities when its dock icon has several, and only those', () => {
		const {container, desktop} = withControls();
		act(() => {
			desktop.open('site', {url: 'https://en.wikipedia.org/wiki/Main_Page'});
		});

		fireEvent.click(screen.getByRole('link', {name: 'Website'}));

		expect(container.querySelector('.desktop')).toHaveClass('is-overview');
		expect(windowsOf(container, 'Website').every(win => !win.classList.contains('is-left-out'))).toBe(true);
		expect(windowsOf(container, 'Editor')[0]).toHaveClass('is-left-out');

		fireEvent.click(screen.getAllByRole('button', {name: 'Switch to Website'})[1]);
		expect(container.querySelector('.desktop')).not.toHaveClass('is-overview');
		expect(focused(container)).toBe('Website');
	});

	it('names later windows of an app by number, and puts them a little below and to the right of the last', () => {
		const {container, desktop} = withControls();
		const site = container.querySelector('[data-win="site"]');
		vi.spyOn(site, 'offsetLeft', 'get').mockReturnValue(100);
		vi.spyOn(site, 'offsetTop', 'get').mockReturnValue(50);
		vi.spyOn(site, 'offsetWidth', 'get').mockReturnValue(600);
		vi.spyOn(site, 'offsetHeight', 'get').mockReturnValue(400);
		const stage = container.querySelector('.dt-stage');
		Object.defineProperty(stage, 'clientWidth', {value: 1600, configurable: true});
		Object.defineProperty(stage, 'clientHeight', {value: 1000, configurable: true});
		act(() => window.dispatchEvent(new Event('resize')));

		act(() => {
			desktop.open('site', {url: 'https://example.com/'});
		});

		expect(windowsOf(container, 'Website')[1].style).toMatchObject({left: '132px', top: '82px', width: '600px', height: '400px'});
	});

	it('stacks a window raised and covered again before the next render just behind the one covering it', () => {
		const {container, desktop} = withControls();

		act(() => {
			desktop.show(desktop.open('video', {}));
			desktop.showPage('site');
		});

		const layer = name => Number(windowsOf(container, name)[0].style.getPropertyValue('--z'));
		expect(layer('Video Player')).toBeGreaterThan(layer('Editor'));
		expect(layer('Website')).toBeGreaterThan(layer('Video Player'));
	});

	it('opens the one window for the page, however often it\'s asked for before the next render', () => {
		smallScreen();
		const {container, desktop} = withControls();
		expect(windowsOf(container, 'Editor')).toHaveLength(0);

		act(() => {
			desktop.showPage('source');
			desktop.showPage('source');
		});

		expect(windowsOf(container, 'Editor')).toHaveLength(1);
	});

	it('minimises a video player closed on a phone to its dock icon, which goes once it has', () => {
		smallScreen();
		vi.useFakeTimers();
		const animations = recordAnimations();
		const {container, desktop} = withControls();
		let win;
		act(() => {
			win = desktop.open('video', {});
		});
		act(() => desktop.show(win));

		fireEvent.click(screen.getByRole('button', {name: 'Close the video player'}));

		const player = windowsOf(container, 'Video Player')[0];
		expect(animations(player)).toHaveLength(2);
		expect(screen.getByRole('button', {name: 'Video Player'})).not.toHaveClass('is-running');
		act(() => vi.advanceTimersByTime(500));
		expect(screen.queryByRole('button', {name: 'Video Player'})).toBeNull();
	});

	it('tells where windows are and puts them elsewhere, where they can move', () => {
		const {container, desktop} = withControls();
		const site = container.querySelector('[data-win="site"]');
		vi.spyOn(site, 'offsetWidth', 'get').mockReturnValue(600);
		vi.spyOn(site, 'offsetHeight', 'get').mockReturnValue(400);
		const stage = container.querySelector('.dt-stage');
		Object.defineProperty(stage, 'clientWidth', {value: 1600, configurable: true});
		Object.defineProperty(stage, 'clientHeight', {value: 1000, configurable: true});
		act(() => window.dispatchEvent(new Event('resize')));

		expect(desktop.movable()).toBe(true);
		expect(desktop.isOpen('site')).toBe(true);
		expect(desktop.isOpen('console')).toBe(false);
		expect(desktop.stage()).toEqual({width: 1600, height: 1000});
		expect(desktop.minSize('site')).toEqual({width: 360, height: 360});
		expect(desktop.geometry('site')).toEqual({x: 0, y: 0, width: 600, height: 400});

		act(() => desktop.place('site', {x: 200, y: 100, width: 700, height: 500}));
		expect(site.style).toMatchObject({left: '200px', top: '100px', width: '700px', height: '500px'});
		// Where it would be, put nowhere: there, as it measures, and left as it was meanwhile.
		expect(desktop.defaultGeometry('site')).toEqual({x: 0, y: 0, width: 600, height: 400});
		expect(site.style.left).toBe('200px');
		act(() => desktop.place('site', null));
		expect(site.style.left).toBe('');

		let video;
		act(() => {
			video = desktop.open('video', {}, {x: 900, y: 500, width: 480, height: 316});
		});
		expect(windowsOf(container, 'Video Player')[0].style).toMatchObject({left: '900px', top: '500px', width: '480px', height: '316px'});
		expect(video).toBe('video');

		act(() => desktop.close('source'));
		expect(windowsOf(container, 'Editor')[0]).toHaveClass('is-closing');
	});

	it('forgets a window\'s content once it closes, and answers for it no more', () => {
		vi.useFakeTimers();
		const {container, desktop} = withControls();
		let win;
		act(() => {
			win = desktop.open('site', {url: 'https://example.com/'});
		});
		act(() => desktop.show(win));

		fireEvent.click(within(windowsOf(container, 'Website')[1]).getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(500));

		expect(windowsOf(container, 'Website')).toHaveLength(1);
		expect(desktop.update(win, {url: 'https://example.org/'})).toBe(false);
		act(() => desktop.show(win));
		expect(desktop.geometry(win)).toBeFalsy();
	});
});

describe('the adhd kernel module', () => {
	it('adds nothing to the browser\'s history while it\'s loaded', async () => {
		window.history.replaceState(null, '', '/cv');
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		const history = window.history.length;
		vi.useFakeTimers();

		act(() => system.distract(true));
		await act(() => vi.advanceTimersByTimeAsync(8000));
		expect(window.location.pathname).not.toBe('/cv');
		expect(window.history.length).toBe(history);

		// Once it's unloaded, the website's own links add to it again.
		act(() => system.distract(false));
		for (let i = 0; i < 20; i++) {
			act(() => vi.advanceTimersByTime(100));
		}
		const after = window.history.length;
		fireEvent.click(within(container.querySelector('.dt-window[aria-label="Website"]')).getByRole('link', {name: 'Side Quests', exact: true}));
		expect(window.location.pathname).toBe('/side-quests');
		expect(window.history.length).toBe(after + 1);
	});

	it('leaves the desktop alone while it isn\'t loaded', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}));
		window.history.replaceState(null, '', '/cv');
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);
		const history = window.history.length;

		await act(() => vi.advanceTimersByTimeAsync(60_000));

		expect(windows(container)).toEqual(['Website', 'Editor']);
		expect(focused(container)).toBe('Website');
		expect(window.location.pathname).toBe('/cv');
		expect(window.history.length).toBe(history);
		expect(fetch.mock.calls.filter(([url]) => String(url).includes('wikipedia'))).toEqual([]);
		expect(container.querySelector('.desktop')).not.toHaveClass('is-caffeinated');
	});

	it('sets the desktop driving itself while it\'s loaded, and tidies up after it once it\'s unloaded', async () => {
		window.history.replaceState(null, '', '/cv');
		const {container} = render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		vi.useFakeTimers();

		act(() => system.distract(true));
		expect(system.distracted).toBe(true);
		await act(() => vi.advanceTimersByTimeAsync(8000));
		expect(window.location.pathname).not.toBe('/cv');
		expect(windows(container)).toEqual(['Website', 'Editor', 'Terminal', 'Video Player']);

		// The windows close one after another, front first...
		const front = focused(container);
		const left = () => container.querySelectorAll('.dt-window:not(.is-closing)').length;
		act(() => system.distract(false));
		act(() => vi.advanceTimersByTime(10));
		expect(container.querySelector('.dt-window.is-closing').getAttribute('aria-label')).toBe(front);
		expect(left()).toBe(3);
		act(() => vi.advanceTimersByTime(100));
		expect(left()).toBe(2);
		act(() => vi.advanceTimersByTime(100));
		expect(left()).toBe(1);

		// ...and the desktop starts over: the website in front of the editor, on the CV.
		for (let i = 0; i < 10; i++) {
			act(() => vi.advanceTimersByTime(100));
		}
		expect(windows(container)).toEqual(['Website', 'Editor']);
		expect(focused(container)).toBe('Website');
		expect(container.querySelector('.desktop')).not.toHaveClass('is-overview');
		expect(container.querySelector('[data-win="site"] .dt-address')).toHaveTextContent('robinj.be/cv');
		expect(window.location.pathname).toBe('/cv');
	});

	it('stops the desktop driving itself when the machine goes down, with nothing to tidy', async () => {
		render(<App initialPath="/cv" />);
		fireEvent.click(screen.getByRole('button', {name: 'Terminal'}));
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		const {system} = session.startSession.mock.calls.at(-1)[0];
		vi.useFakeTimers();

		act(() => system.distract(true));
		act(() => system.halt({mode: 'poweroff', shutdown: [{text: 'Powering off.', delay: 0}], boot: [{text: 'Booting.', delay: 0}]}));
		act(() => vi.advanceTimersByTime(2000));

		expect(system.distracted).toBe(false);
		expect(document.querySelectorAll('.dt-window')).toHaveLength(0);
	});
});
