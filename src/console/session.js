import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {createShell} from './shell';

// How long a style or accent change takes to ease over (see .is-restyling).
const RESTYLE_MS = 450;
const FONT_SIZE = 13.5;
// The editor's font (--editor-font in App.scss) until the font setting says otherwise.
const DEFAULT_FONT = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

// The editor's colours, so the terminal matches it and follows style changes.
// The background shows through: the window behind is blurred (see .console).
const pageTheme = () => {
	const css = getComputedStyle(document.documentElement);
	const token = name => css.getPropertyValue(`--editor-${name}`).trim();

	return {
		background: 'transparent',
		foreground: token('text'),
		cursor: token('accent'),
		cursorAccent: token('surface'),
		selectionBackground: token('faint'),
		black: token('dim'),
		red: token('kw'),
		green: token('str'),
		yellow: token('num'),
		blue: token('accent2'),
		magenta: token('num'),
		cyan: token('accent'),
		white: token('text'),
		brightBlack: token('com'),
	};
};

const visibleLength = text => text.replace(/\x1b\[[\d;]*m/g, '').length;
const printable = text => text.replace(/[\x00-\x1f\x7f]/g, '');

export const startSession = ({element, system, onExit, onOpenFile, onCwd}) => {
	const term = new Terminal({
		fontFamily: DEFAULT_FONT,
		fontSize: FONT_SIZE,
		lineHeight: 1.2,
		cursorBlink: true,
		allowTransparency: true,
		theme: pageTheme(),
	});
	const fit = new FitAddon();
	term.loadAddon(fit);
	term.open(element);

	// xterm's scrollbar is only as tall as the rows; stretched (see .console-screen),
	// it runs from the header bar to the bottom edge of the window.
	const fitScreen = () => {
		fit.fit();
		requestAnimationFrame(() => {
			const rows = element.querySelector('.xterm-screen')?.offsetHeight;
			if (rows) {
				element.style.setProperty('--scrollbar-stretch', String(element.clientHeight / rows));
			}
		});
	};
	fitScreen();
	term.focus();

	let stopped = false;
	const write = text => {
		if (!stopped) {
			term.write(text.replace(/\r?\n/g, '\r\n'));
		}
	};

	// What programs read: lines typed while they run (or before they ask).
	// Passwords are typed without echo.
	const cooked = {buffer: '', lines: [], ends: 0, waiting: null, echo: true};
	let raw = null;

	const tty = {
		write,
		columns: () => term.cols,
		rows: () => term.rows,
		read: ({echo = true} = {}) => {
			if (cooked.lines.length) {
				return Promise.resolve(cooked.lines.shift());
			} else if (cooked.ends) {
				cooked.ends--;
				return Promise.resolve(null);
			}
			cooked.echo = echo;
			return new Promise(resolve => {
				cooked.waiting = line => {
					cooked.echo = true;
					resolve(line);
				};
			});
		},
		raw: handler => {
			raw = handler;
			return () => {
				raw = null;
			};
		},
	};

	const shell = createShell({tty, system, onExit, onOpenFile, onCwd});

	// The line being edited at the prompt.
	let prompt = '';
	let buffer = '';
	let cursor = 0;
	let row = 0;
	let recall = 0;
	let continued = [];
	let running = false;
	// Lines pasted or typed ahead, to run once the prompt is back.
	let pending = [];

	const place = () => {
		const width = term.cols;
		const start = visibleLength(prompt);
		const end = start + buffer.length;
		// At the end of a full row the cursor waits at the edge; start the next row.
		if (end > 0 && end % width === 0) {
			term.write(' \b');
		}
		const endRow = Math.floor(end / width);
		const target = start + cursor;
		const targetRow = Math.floor(target / width);
		if (endRow > targetRow) {
			term.write(`\x1b[${endRow - targetRow}A`);
		}
		term.write(`\r${target % width ? `\x1b[${target % width}C` : ''}`);
		row = targetRow;
	};

	const redraw = () => {
		if (stopped) {
			return;
		}
		term.write(`${row ? `\x1b[${row}A` : ''}\r\x1b[J${prompt}${buffer}`);
		place();
	};

	const edit = (next, at) => {
		buffer = next;
		cursor = at;
		redraw();
	};

	const showPrompt = text => {
		prompt = text;
		buffer = '';
		cursor = 0;
		row = 0;
		recall = shell.history.length;
		write(prompt);
	};

	// Leaves the cursor below the line, as Enter does.
	const finishLine = () => {
		cursor = buffer.length;
		redraw();
		term.write('\r\n');
		row = 0;
	};

	const runPending = () => {
		if (pending.length === 0) {
			return;
		}
		const {text, complete} = pending.shift();
		edit(text, text.length);
		if (complete) {
			submit();
		}
	};

	async function submit() {
		finishLine();
		continued.push(buffer);
		const source = continued.join('\n');
		if (!shell.isComplete(source)) {
			showPrompt(shell.prompt('PS2'));
			runPending();
			return;
		}

		continued = [];
		if (source.trim()) {
			running = true;
			await shell.execute(source);
			running = false;
			// Typed while it ran: whole lines run next, the rest waits at the prompt.
			pending.push(...cooked.lines.map(line => ({text: line.replace(/\n$/, ''), complete: true})));
			if (cooked.buffer) {
				pending.push({text: cooked.buffer, complete: false});
			}
			Object.assign(cooked, {buffer: '', lines: [], ends: 0, waiting: null});
		}

		if (!stopped && !shell.exited) {
			write(shell.notifications());
			showPrompt(shell.prompt());
			runPending();
		}
	}

	const insert = text => {
		const [first, ...rest] = text.replace(/\r\n?/g, '\n').split('\n');
		const typed = printable(first);
		edit(buffer.slice(0, cursor) + typed + buffer.slice(cursor), cursor + typed.length);
		if (rest.length) {
			const last = rest.pop();
			pending.push(...rest.map(line => ({text: printable(line), complete: true})));
			if (last) {
				pending.push({text: printable(last), complete: false});
			}
			submit();
		}
	};

	const complete = () => {
		const {completion, options} = shell.complete(buffer.slice(0, cursor));
		if (!completion && options.length > 1) {
			finishLine();
			write(`${options.join('  ')}\n`);
			write(prompt);
		}
		edit(buffer.slice(0, cursor) + completion + buffer.slice(cursor), cursor + completion.length);
	};

	const browseHistory = step => {
		recall = Math.min(Math.max(recall + step, 0), shell.history.length);
		const line = shell.history[recall] ?? '';
		edit(line, line.length);
	};

	const keys = {
		'\r': submit,
		'\x7f': () => cursor > 0 && edit(buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor - 1),
		'\x1b[3~': () => cursor < buffer.length && edit(buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor),
		'\x1b[D': () => cursor > 0 && edit(buffer, cursor - 1),
		'\x1b[C': () => cursor < buffer.length && edit(buffer, cursor + 1),
		'\x1b[A': () => browseHistory(-1),
		'\x1b[B': () => browseHistory(1),
		'\x1b[H': () => edit(buffer, 0),
		'\x01': () => edit(buffer, 0),
		'\x1b[F': () => edit(buffer, buffer.length),
		'\x05': () => edit(buffer, buffer.length),
		'\x03': () => {
			cursor = buffer.length;
			redraw();
			term.write('^C\r\n');
			continued = [];
			pending = [];
			showPrompt(shell.prompt());
		},
		'\x0c': () => {
			term.write('\x1b[H\x1b[2J');
			row = 0;
			redraw();
		},
		'\x04': () => {
			if (buffer === '' && continued.length === 0) {
				write('exit\n');
				shell.exit();
			}
		},
		'\t': complete,
	};

	// While something runs: keys go to it directly, or a line at a time.
	const whileRunning = data => {
		if (raw) {
			raw(data);
			return;
		} else if (data === '\x03') {
			write('^C');
			Object.assign(cooked, {buffer: '', lines: [], waiting: null, echo: true});
			shell.interrupt();
			return;
		}

		for (const c of data.replace(/\x1b\[[\d;]*[A-Za-z~]/g, '')) {
			if (c === '\r') {
				if (cooked.echo) {
					write('\n');
				}
				const line = `${cooked.buffer}\n`;
				cooked.buffer = '';
				if (cooked.waiting) {
					cooked.waiting(line);
					cooked.waiting = null;
				} else {
					cooked.lines.push(line);
				}
			} else if (c === '\x04') {
				const text = cooked.buffer || null;
				cooked.buffer = '';
				if (cooked.waiting) {
					cooked.waiting(text);
					cooked.waiting = null;
				} else if (text === null) {
					cooked.ends++;
				} else {
					cooked.lines.push(text);
				}
			} else if (c === '\x7f') {
				if (cooked.buffer && cooked.echo) {
					write('\b \b');
				}
				cooked.buffer = cooked.buffer.slice(0, -1);
			} else if (printable(c)) {
				cooked.buffer += c;
				if (cooked.echo) {
					write(c);
				}
			}
		}
	};

	term.onData(data => {
		if (running) {
			whileRunning(data);
		} else if (keys[data]) {
			keys[data]();
		} else if (!data.startsWith('\x1b')) {
			insert(data);
		}
	});

	showPrompt(shell.prompt());

	const resize = new ResizeObserver(fitScreen);
	resize.observe(element);

	// A tap brings up the on-screen keyboard. Phones only show it for a focus made by
	// the tap itself, so any earlier focus is dropped first.
	const coarse = window.matchMedia('(pointer: coarse)');
	const tap = () => {
		if (coarse.matches) {
			term.blur();
			term.focus();
		}
	};
	element.addEventListener('click', tap);

	// Style changes ease over a moment; follow along frame by frame.
	let restyleUntil = 0;
	const followTheme = () => {
		term.options.theme = pageTheme();
		if (performance.now() < restyleUntil) {
			requestAnimationFrame(followTheme);
		}
	};
	// The editor's font, once it has loaded: xterm measures its cells for each new font.
	const followFont = () => {
		const font = getComputedStyle(document.documentElement).getPropertyValue('--editor-font').trim() || DEFAULT_FONT;
		document.fonts.load(`${FONT_SIZE}px ${font}`).catch(() => []).then(() => {
			if (!stopped && term.options.fontFamily !== font) {
				term.options.fontFamily = font;
				fitScreen();
			}
		});
	};
	followFont();

	const restyle = () => {
		restyleUntil = performance.now() + RESTYLE_MS;
		followTheme();
	};
	const attributes = new MutationObserver(() => {
		restyle();
		followFont();
	});
	attributes.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-font']});
	const scheme = window.matchMedia('(prefers-color-scheme: dark)');
	scheme.addEventListener('change', restyle);

	return {
		focus: () => term.focus(),
		stop: () => {
			stopped = true;
			shell.dispose();
			resize.disconnect();
			element.removeEventListener('click', tap);
			attributes.disconnect();
			scheme.removeEventListener('change', restyle);
			term.dispose();
		},
	};
};
