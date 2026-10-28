import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, plain, stubStorage} from './test-helpers';
import {resetRepositories} from './projects';
import {startSession} from './session';

const {terminals, fits} = vi.hoisted(() => ({terminals: [], fits: []}));

vi.mock('@xterm/xterm', () => ({
	Terminal: class {
		constructor(options) {
			this.options = {...options};
			this.cols = 80;
			this.rows = 24;
			this.written = '';
			this.open = vi.fn();
			this.loadAddon = vi.fn();
			this.focus = vi.fn();
			this.blur = vi.fn();
			this.dispose = vi.fn();
			terminals.push(this);
		}

		// Caught up at once, unless lagging behind until catchUp().
		write(text, done) {
			this.written += text;
			if (done) {
				this.drains = (this.drains ?? 0) + 1;
				if (this.lagging) {
					this.lagging.push(done);
				} else {
					done();
				}
			}
		}

		catchUp() {
			for (const done of this.lagging.splice(0)) {
				done();
			}
		}

		get buffer() {
			return {active: {cursorX: screen(this).x}};
		}

		onData(handler) {
			this.type = handler;
		}
	},
}));

vi.mock('@xterm/addon-fit', () => ({
	FitAddon: class {
		constructor() {
			this.fit = vi.fn();
			fits.push(this);
		}
	},
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const PROMPT = 'robin@robinj.be:~/portfolio$ ';
const NARROW = '((width < 900px) or (height < 600px)) and (aspect-ratio < 1)';

// Just enough of a terminal to see what the line editor leaves on screen, and
// where the cursor is: xterm's deferred wrap, and the moves and erases it uses.
const screen = term => {
	const lines = [''];
	let row = 0;
	let col = 0;
	const text = term.written;
	for (let i = 0; i < text.length; i++) {
		const csi = text.slice(i).match(/^\x1b\[\??([\d;]*)([A-Za-z])/);
		if (csi) {
			const n = Number(csi[1] || 1);
			if (csi[2] === 'A') {
				row = Math.max(row - n, 0);
			} else if (csi[2] === 'C') {
				col = Math.min(col + n, term.cols - 1);
			} else if (csi[2] === 'H') {
				row = 0;
				col = 0;
			} else if (csi[2] === 'J' && csi[1] === '2') {
				lines.fill('');
			} else if (csi[2] === 'J') {
				lines.splice(row + 1);
				lines[row] = lines[row].slice(0, col);
			}
			i += csi[0].length - 1;
		} else if (text[i] === '\r') {
			col = 0;
		} else if (text[i] === '\n') {
			row++;
			lines[row] ??= '';
		} else if (text[i] === '\b') {
			col = Math.max(col - 1, 0);
		} else if (text[i] >= ' ') {
			if (col >= term.cols) {
				row++;
				col = 0;
				lines[row] ??= '';
			}
			lines[row] = lines[row].padEnd(col).slice(0, col) + text[i] + lines[row].slice(col + 1);
			col++;
		}
	}

	// x is where xterm has it: one past the edge after the last column, until the next character wraps.
	return {lines, row, col: Math.min(col, term.cols - 1), x: col, line: lines[row]};
};

// Until the shell is back at its prompt.
const prompted = term => vi.waitFor(() => expect(term.written.endsWith('$ ')).toBe(true));

const enter = async (term, line) => {
	term.type(`${line}\r`);
	await prompted(term);
};

let sessions;
let media;
let observers;
let frames;
let now;

const start = (options = {}) => {
	const element = document.createElement('div');
	document.body.append(element);
	const callbacks = {onExit: vi.fn(), onOpenFile: vi.fn(), onCwd: vi.fn()};
	const session = startSession({element, system: fakeSystem(), ...callbacks, ...options});
	sessions.push(session);

	return {session, element, term: terminals.at(-1), fit: fits.at(-1), ...callbacks};
};

beforeEach(() => {
	stubStorage();
	sessions = [];
	terminals.length = 0;
	fits.length = 0;

	media = {};
	vi.stubGlobal('matchMedia', query => {
		media[query] ??= {
			matches: false,
			listeners: new Set(),
			addEventListener: (type, listener) => media[query].listeners.add(listener),
			removeEventListener: (type, listener) => media[query].listeners.delete(listener),
		};
		return media[query];
	});

	observers = [];
	vi.stubGlobal('ResizeObserver', class {
		constructor(callback) {
			this.callback = callback;
			this.observe = vi.fn();
			this.disconnect = vi.fn();
			observers.push(this);
		}
	});

	frames = [];
	vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback));
	now = 1000;
	vi.spyOn(performance, 'now').mockImplementation(() => now);

	Object.defineProperty(document, 'fonts', {value: {load: vi.fn(async () => [])}, configurable: true});
	const style = document.documentElement.style;
	for (const [name, value] of Object.entries({text: '#111', accent: '#a00', surface: '#fff', faint: '#eee', dim: '#555', kw: '#b00', str: '#0b0', num: '#bb0', accent2: '#00b', com: '#777'})) {
		style.setProperty(`--editor-${name}`, value);
	}
	style.removeProperty('--editor-font');
});

afterEach(() => {
	for (const session of sessions) {
		session.stop();
	}
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
	for (const name of ['data-theme', 'data-accent', 'data-font']) {
		document.documentElement.removeAttribute(name);
	}
});

describe('starting a session', () => {
	it('opens a terminal in the editor\'s colours and font, focused, at a prompt', () => {
		const {term, element, fit} = start();

		expect(term.open).toHaveBeenCalledWith(element);
		expect(term.loadAddon).toHaveBeenCalledWith(fit);
		expect(fit.fit).toHaveBeenCalled();
		expect(term.focus).toHaveBeenCalled();
		expect(term.options).toMatchObject({fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 13.5, cursorBlink: true, allowTransparency: true});
		expect(term.options.theme).toEqual({
			background: 'transparent', foreground: '#111', cursor: '#a00', cursorAccent: '#fff', selectionBackground: '#eee', black: '#555',
			red: '#b00', green: '#0b0', yellow: '#bb0', blue: '#00b', magenta: '#bb0', cyan: '#a00', white: '#111', brightBlack: '#777',
		});
		expect(screen(term).lines).toEqual([PROMPT]);
	});

	it('focuses on request', () => {
		const {session, term} = start();
		term.focus.mockClear();

		session.focus();
		expect(term.focus).toHaveBeenCalledTimes(1);
	});
});

describe('the line editor', () => {
	it('runs what is typed, one key at a time', async () => {
		const {term} = start();

		for (const key of 'echo hi') {
			term.type(key);
		}
		expect(screen(term).line).toBe(`${PROMPT}echo hi`);
		term.type('\r');
		await prompted(term);
		expect(screen(term).lines).toEqual([`${PROMPT}echo hi`, 'hi', PROMPT]);
	});

	it('edits in the middle of the line', async () => {
		const {term} = start();

		term.type('ecox');
		term.type('\x1b[D');
		term.type('\x1b[D');
		term.type('h');
		term.type('\x1b[C');
		term.type('\x1b[3~');
		expect(screen(term)).toMatchObject({line: `${PROMPT}echo`, col: PROMPT.length + 4});
		term.type('\x1b[C');
		term.type('\x1b[C');
		term.type(' moved');
		term.type('\x01');
		expect(screen(term).col).toBe(PROMPT.length);
		term.type('\x1b[D');
		term.type('\x7f');
		term.type('\x05');
		expect(screen(term)).toMatchObject({line: `${PROMPT}echo moved`, col: PROMPT.length + 10});
		term.type('\x1b[H');
		term.type('\x1b[F');
		term.type('\x1b[3~');
		term.type('\x7f');
		expect(screen(term)).toMatchObject({line: `${PROMPT}echo move`, col: PROMPT.length + 9});
		await enter(term, '');
		expect(screen(term).lines.at(-2)).toBe('move');
	});

	it('ignores escape sequences it does not know, and strips control characters', () => {
		const {term} = start();

		term.type('\x1b[15~');
		term.type('a\x07b\x1bc');
		expect(screen(term).line).toBe(`${PROMPT}abc`);
	});

	it('wraps long lines, keeping the cursor where it belongs', () => {
		const {term} = start();
		term.cols = 40;

		term.type('echo 123456');
		expect(screen(term)).toMatchObject({lines: [`${PROMPT}echo 123456`, ' '], row: 1, col: 0});
		term.type('7890');
		expect(screen(term)).toMatchObject({row: 1, col: 4, line: '7890'});
		term.type('\x01');
		expect(screen(term)).toMatchObject({row: 0, col: PROMPT.length});
		term.type('\x05');
		expect(screen(term)).toMatchObject({row: 1, col: 4});
		for (let i = 0; i < 4; i++) {
			term.type('\x7f');
		}
		expect(screen(term)).toMatchObject({lines: [`${PROMPT}echo 123456`, ' '], row: 1, col: 0});
	});

	it('recalls history with the up and down arrows', async () => {
		const {term} = start();
		await enter(term, 'echo one');
		await enter(term, 'echo two');

		term.type('\x1b[A');
		expect(screen(term).line).toBe(`${PROMPT}echo two`);
		term.type('\x1b[A');
		term.type('\x1b[A');
		expect(screen(term).line).toBe(`${PROMPT}echo one`);
		term.type('\x1b[B');
		expect(screen(term).line).toBe(`${PROMPT}echo two`);
		term.type('\x1b[B');
		term.type('\x1b[B');
		expect(screen(term).line).toBe(PROMPT);
	});

	it('abandons the line with ^C', () => {
		const {term} = start();

		term.type('half-typed');
		term.type('\x01');
		term.type('\x03');
		expect(screen(term).lines).toEqual([`${PROMPT}half-typed^C`, PROMPT]);
	});

	it('clears the screen with ^L, keeping the line', () => {
		const {term} = start();

		term.type('echo kept');
		term.type('\x0c');
		expect(screen(term)).toMatchObject({row: 0, line: `${PROMPT}echo kept`});
	});

	it('exits with ^D on an empty line only', () => {
		const {term, onExit} = start();

		term.type('x');
		term.type('\x04');
		expect(onExit).not.toHaveBeenCalled();
		term.type('\x7f');
		term.type('\x04');
		expect(screen(term).lines).toEqual([`${PROMPT}exit`, '']);
		expect(onExit).toHaveBeenCalledTimes(1);
	});

	it('completes with tab, listing the options when there are several', async () => {
		const {term} = start();

		term.type('whoa');
		term.type('\t');
		await vi.waitFor(() => expect(screen(term).line).toBe(`${PROMPT}whoami `));
		for (let i = 0; i < 'whoami '.length; i++) {
			term.type('\x7f');
		}
		term.type('cat c');
		term.type('\t');
		await vi.waitFor(() => expect(screen(term).lines).toEqual([`${PROMPT}cat c`, 'contact.yml  cv.md', `${PROMPT}cat c`]));
		term.type('v');
		term.type('\t');
		await vi.waitFor(() => expect(screen(term).line).toBe(`${PROMPT}cat cv.md `));
	});

	it('completes in ~/Projects once GitHub has listed it, then takes what was typed meanwhile', async () => {
		let answer;
		resetRepositories();
		vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
			answer = resolve;
		})));
		const {term} = start();

		term.type('cat ~/Projects/dot');
		term.type('\t');
		term.type('x');
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		expect(screen(term).line).toBe(`${PROMPT}cat ~/Projects/dot`);
		answer({ok: true, headers: new Headers(), json: async () => [{name: 'dotfiles', html_url: 'https://github.com/RobinJ1995/dotfiles'}]});
		await vi.waitFor(() => expect(screen(term).line).toBe(`${PROMPT}cat ~/Projects/dotfiles x`));
	});

	it('continues incomplete commands on a PS2 prompt, and ^C drops them', async () => {
		const {term} = start();

		term.type('if true; then\r');
		expect(screen(term).lines).toEqual([`${PROMPT}if true; then`, '> ']);
		await enter(term, 'echo yes; fi');
		expect(screen(term).lines.slice(-2)).toEqual(['yes', PROMPT]);
		term.type('echo "open\r');
		term.type('\x04');
		term.type('\x03');
		await enter(term, 'echo "closed"');
		expect(screen(term).lines.slice(-2)).toEqual(['closed', PROMPT]);
	});

	it('runs pasted lines one after another, leaving a partial last line', async () => {
		const {term} = start();

		term.type('echo a\r\necho b\recho c');
		await vi.waitFor(() => expect(screen(term).lines).toEqual([`${PROMPT}echo a`, 'a', `${PROMPT}echo b`, 'b', `${PROMPT}echo c`]));
		term.type('\r');
		await prompted(term);
		expect(screen(term).lines.slice(-2)).toEqual(['c', PROMPT]);
	});

	it('starts the prompt where output that didn\'t end its line left off, and keeps that output', async () => {
		const {term} = start();

		await enter(term, 'printf foo');
		expect(screen(term)).toMatchObject({line: `foo${PROMPT}`, col: 3 + PROMPT.length});
		term.type('echo bar');
		expect(screen(term).line).toBe(`foo${PROMPT}echo bar`);
		await enter(term, '');
		expect(screen(term).lines.slice(-3)).toEqual([`foo${PROMPT}echo bar`, 'bar', PROMPT]);

		await enter(term, 'printf foo');
		term.type('echo kept');
		term.type('\x0c');
		expect(screen(term)).toMatchObject({row: 0, line: `${PROMPT}echo kept`});
	});

	it('wraps a line that starts partway along a row', async () => {
		const {term} = start();
		term.cols = 40;

		await enter(term, 'printf abcde');
		term.type('echo 12');
		expect(screen(term)).toMatchObject({lines: [`${PROMPT}printf abcd`, 'e', `abcde${PROMPT}echo 1`, '2'], row: 3, col: 1});
		term.type('\x01');
		expect(screen(term)).toMatchObject({row: 2, col: 5 + PROMPT.length});
		term.type('\x7f');
		term.type('\x05');
		term.type('\x7f');
		expect(screen(term)).toMatchObject({lines: [`${PROMPT}printf abcd`, 'e', `abcde${PROMPT}echo 1`, ' '], row: 3, col: 0});
	});

	it('starts the prompt on the next row after output that filled one', async () => {
		const {term} = start();
		term.cols = 40;

		await enter(term, `printf ${'x'.repeat(40)}`);
		term.type('echo');
		expect(screen(term).lines.slice(-2)).toEqual(['x'.repeat(40), `${PROMPT}echo`]);
	});

	it('holds keys until the terminal has caught up enough to place the prompt', async () => {
		const {term} = start();
		term.lagging = [];

		term.type('printf foo\r');
		await vi.waitFor(() => expect(term.lagging).toHaveLength(1));
		term.type('echo bar\r');
		expect(screen(term).line).toBe('foo');

		term.catchUp();
		term.lagging = null;
		await prompted(term);
		expect(screen(term).lines.slice(-3)).toEqual([`foo${PROMPT}echo bar`, 'bar', PROMPT]);
	});

	it('does nothing for an empty line but show the prompt again', async () => {
		const {term} = start();

		await enter(term, '   ');
		expect(screen(term).lines).toEqual([`${PROMPT}   `, PROMPT]);
	});
});

describe('while a command runs', () => {
	it('hands typed lines to it, echoed and editable', async () => {
		const {term} = start();

		term.type('read a b; echo "[$b, $a]"\r');
		term.type('Robix');
		term.type('\x7f');
		term.type('n Jacobs');
		term.type('\x1b[D');
		term.type('\r');
		await prompted(term);
		expect(screen(term).lines).toEqual([`${PROMPT}read a b; echo "[$b, $a]"`, 'Robin Jacobs', '[Jacobs, Robin]', PROMPT]);
	});

	it('ends input with ^D, passing on a partial line first', async () => {
		const {term} = start();

		term.type('read x; echo "[$x] $?"\r');
		term.type('abc');
		term.type('\x04');
		term.type('\x04');
		await prompted(term);
		expect(screen(term).lines.slice(-2)).toEqual(['abc[abc] 1', PROMPT]);
	});

	it('passes a partial line on to cat at ^D, and ends it at the next', async () => {
		const {term} = start();

		term.type('cat | wc -c\r');
		term.type('abc');
		term.type('\x04');
		term.type('\x04');
		await prompted(term);
		expect(screen(term).lines.slice(-2)).toEqual(['abc3', PROMPT]);
	});

	it('keeps what was typed ahead for when the prompt is back', async () => {
		vi.useFakeTimers();
		const {term} = start();

		term.type('sleep 1\r');
		term.type('echo typed ahead\r');
		term.type('\x04');
		term.type('echo partial');
		await vi.advanceTimersByTimeAsync(1000);
		// As in bash, the partial line stays where it was echoed, and the prompt follows it.
		await vi.waitFor(() => expect(screen(term).lines.slice(-3)).toEqual([`echo partial${PROMPT}echo typed ahead`, 'typed ahead', `${PROMPT}echo partial`]));
	});

	it('lets output catch up with the terminal once there is a backlog', async () => {
		const {term} = start();

		term.type('yes | head -c 70000 | cat; echo done\r');
		await prompted(term);
		expect(screen(term).lines.slice(-2)).toEqual(['done', PROMPT]);
		// Once for the backlog, and once for each prompt to find its place.
		expect(term.drains).toBe(3);
	});

	it('reads ahead-typed lines and ends when it asks', async () => {
		vi.useFakeTimers();
		const {term} = start();

		term.type('sleep 1; cat; cat\r');
		term.type('early\r');
		term.type('\x04');
		term.type('\x04');
		await vi.advanceTimersByTimeAsync(1000);
		await prompted(term);
		expect(screen(term).lines.slice(-2)).toEqual(['early', PROMPT]);
	});

	it('takes passwords without echo', async () => {
		vi.useFakeTimers();
		const {term} = start();

		term.type('sudo whoami\r');
		await vi.waitFor(() => expect(screen(term).line).toBe('[sudo] password for robin: '));
		term.type('hunter2\x7f\x7f\r');
		await vi.advanceTimersByTimeAsync(2000);
		term.type('\x04');
		await prompted(term);
		expect(screen(term).lines).toEqual([`${PROMPT}sudo whoami`, '[sudo] password for robin: ', 'Sorry, try again.', '[sudo] password for robin: ', 'sudo: 1 incorrect password attempt', PROMPT]);

		term.type('read x; echo "<$x>"\r');
		term.type('shown\r');
		await prompted(term);
		expect(screen(term).lines.slice(-3)).toEqual(['shown', '<shown>', PROMPT]);
	});

	it('interrupts it with ^C, dropping what was typed', async () => {
		const {term} = start();

		term.type('sleep 100; echo never\r');
		await new Promise(resolve => setTimeout(resolve, 0));
		term.type('discarded');
		term.type('\x03');
		await prompted(term);
		expect(screen(term).lines).toEqual([`${PROMPT}sleep 100; echo never`, 'discarded^C', PROMPT]);
		await enter(term, 'echo $?');
		expect(screen(term).lines.slice(-2)).toEqual(['130', PROMPT]);
	});

	it('hands keys straight to full-screen programs', async () => {
		const {term} = start();

		term.type('top\r');
		await vi.waitFor(() => expect(term.written).toContain('\x1b[?1049h'));
		term.type('q');
		await prompted(term);
		expect(term.written).toMatch(/\x1b\[\?25h\x1b\[\?1049l\x1b\[1;36mrobin@robinj\.be/);
	});

	it('reports finished background jobs before the prompt', async () => {
		const {term} = start();

		await enter(term, 'true &');
		await enter(term, '');
		expect(plain(term.written)).toContain('[1]+  Done                    true\r\n');
	});
});

describe('the shell\'s callbacks', () => {
	it('report the directory, open files, and exit', async () => {
		const {term, onCwd, onOpenFile, onExit} = start();

		await enter(term, 'cd ..');
		expect(onCwd).toHaveBeenCalledWith('~');
		await enter(term, 'open portfolio/cv.md');
		expect(onOpenFile).toHaveBeenCalledWith('cv');

		term.type('exit\r');
		await vi.waitFor(() => expect(onExit).toHaveBeenCalled());
		expect(screen(term).lines.slice(-2)).toEqual(['exit', '']);
	});
});

describe('following the page', () => {
	it('restyles over a moment when the theme or accent changes', async () => {
		const {term} = start();
		frames.length = 0;

		document.documentElement.style.setProperty('--editor-text', '#eee');
		document.documentElement.setAttribute('data-theme', 'dark');
		await vi.waitFor(() => expect(term.options.theme.foreground).toBe('#eee'));
		expect(frames).toHaveLength(1);
		now += 200;
		document.documentElement.style.setProperty('--editor-accent', '#0f0');
		frames.shift()();
		expect(term.options.theme.cursor).toBe('#0f0');
		expect(frames).toHaveLength(1);
		now += 300;
		frames.shift()();
		expect(frames).toHaveLength(0);
	});

	it('restyles when the system colour scheme changes', () => {
		const {term} = start();

		document.documentElement.style.setProperty('--editor-com', '#999');
		for (const listener of media['(prefers-color-scheme: dark)'].listeners) {
			listener();
		}
		expect(term.options.theme.brightBlack).toBe('#999');
	});

	it('switches font once it has loaded, and refits', async () => {
		const {term, fit} = start();
		fit.fit.mockClear();

		document.documentElement.style.setProperty('--editor-font', "'Fira Code', monospace");
		document.documentElement.setAttribute('data-font', 'fira');
		await vi.waitFor(() => expect(term.options.fontFamily).toBe("'Fira Code', monospace"));
		expect(document.fonts.load).toHaveBeenLastCalledWith("13.5px 'Fira Code', monospace");
		expect(fit.fit).toHaveBeenCalledTimes(1);

		document.documentElement.setAttribute('data-accent', 'red');
		await vi.waitFor(() => expect(document.fonts.load).toHaveBeenCalledTimes(3));
		await Promise.resolve();
		expect(fit.fit).toHaveBeenCalledTimes(1);
	});

	it('switches font even when it fails to load', async () => {
		document.fonts.load.mockRejectedValue(new Error('offline'));
		document.documentElement.style.setProperty('--editor-font', 'monospace');
		const {term} = start();

		await vi.waitFor(() => expect(term.options.fontFamily).toBe('monospace'));
	});

	it('refits when resized, stretching the scrollbar to the window', () => {
		const {element, fit} = start();
		const rows = document.createElement('div');
		rows.className = 'xterm-screen';
		element.append(rows);
		Object.defineProperty(rows, 'offsetHeight', {value: 200});
		Object.defineProperty(element, 'clientHeight', {value: 300});
		fit.fit.mockClear();

		expect(observers[0].observe).toHaveBeenCalledWith(element);
		observers[0].callback();
		expect(fit.fit).toHaveBeenCalledTimes(1);
		for (const frame of frames.splice(0)) {
			frame();
		}
		expect(element.style.getPropertyValue('--scrollbar-stretch')).toBe('1.5');
	});

	it('leaves the scrollbar alone until there are rows to measure', () => {
		const {element} = start();

		for (const frame of frames.splice(0)) {
			frame();
		}
		expect(element.style.getPropertyValue('--scrollbar-stretch')).toBe('');
	});

	it('uses a smaller font on a narrow portrait screen, and follows it as it changes', () => {
		matchMedia(NARROW).matches = true;
		const {term, fit} = start();
		fit.fit.mockClear();

		expect(term.options.fontSize).toBe(11.5);
		media[NARROW].matches = false;
		for (const listener of media[NARROW].listeners) {
			listener();
		}
		expect(term.options.fontSize).toBe(13.5);
		expect(fit.fit).toHaveBeenCalledTimes(1);
		media[NARROW].matches = true;
		for (const listener of media[NARROW].listeners) {
			listener();
		}
		expect(term.options.fontSize).toBe(11.5);
	});

	it('refocuses on a tap, so that phones show their keyboard', () => {
		const {element, term} = start();
		term.focus.mockClear();

		element.click();
		expect(term.focus).not.toHaveBeenCalled();
		media['(pointer: coarse)'].matches = true;
		element.click();
		expect(term.blur).toHaveBeenCalledTimes(1);
		expect(term.focus).toHaveBeenCalledTimes(1);
	});
});

describe('stopping', () => {
	it('lets go of everything it watched, and the terminal', async () => {
		const {session, term, element, onExit} = start();
		term.focus.mockClear();

		term.type('sleep 100\r');
		await new Promise(resolve => setTimeout(resolve, 0));
		session.stop();
		expect(term.dispose).toHaveBeenCalled();
		expect(observers[0].disconnect).toHaveBeenCalled();
		expect(media['(prefers-color-scheme: dark)'].listeners.size).toBe(0);
		expect(media[NARROW].listeners.size).toBe(0);

		media['(pointer: coarse)'].matches = true;
		element.click();
		expect(term.focus).not.toHaveBeenCalled();

		const theme = term.options.theme;
		const written = term.written;
		document.documentElement.setAttribute('data-theme', 'light');
		document.documentElement.style.setProperty('--editor-font', 'serif');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(term.options.theme).toBe(theme);
		expect(term.options.fontFamily).not.toBe('serif');
		expect(term.written).toBe(written);
		expect(onExit).not.toHaveBeenCalled();
	});

	it('shows no prompt when the terminal catches up afterwards', () => {
		const {session, term} = start();
		term.lagging = [];
		term.type('\x03');
		const written = term.written;

		session.stop();
		term.catchUp();
		expect(term.written).toBe(written);
	});

	it('completes nothing once stopped', async () => {
		let answer;
		resetRepositories();
		vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
			answer = resolve;
		})));
		const {session, term} = start();

		term.type('cat ~/Projects/');
		term.type('\t');
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		session.stop();
		const written = term.written;
		answer({ok: false});
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(term.written).toBe(written);
	});

	it('ignores fonts that finish loading afterwards', async () => {
		let loaded;
		document.fonts.load.mockReturnValue(new Promise(resolve => {
			loaded = resolve;
		}));
		document.documentElement.style.setProperty('--editor-font', 'serif');
		const {session, term} = start();

		session.stop();
		loaded([]);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(term.options.fontFamily).not.toBe('serif');
	});
});
