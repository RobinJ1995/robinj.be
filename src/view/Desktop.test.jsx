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

	it('raises the editor when it is clicked, and the URL follows', () => {
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
		vi.useFakeTimers();
		const {container} = render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the website window'}));
		act(() => vi.advanceTimersByTime(250));
		expect(windows(container)).toEqual(['Editor']);

		fireEvent.click(screen.getByTitle('Close'));
		act(() => vi.advanceTimersByTime(250));
		expect(windows(container)).toEqual([]);
		expect(container.querySelector('.desktop.is-overview')).toBeNull();
		expect(screen.getByRole('button', {name: 'Activities'})).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByText('You look like you might be lost.')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Website'}));
		expect(focused(container)).toBe('Website');
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});

	it('suggests a way back to the CV once the desktop has been empty for a while', () => {
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
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/side-quests/source');
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
