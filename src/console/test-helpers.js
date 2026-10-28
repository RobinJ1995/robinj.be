import {vi} from 'vitest';
import {createShell} from './shell';
import {resetRepositories} from './projects';

// Output without colour codes or cursor movement.
export const plain = text => text.replace(/\x1b\[[\d;?]*[A-Za-z]/g, '');

// A terminal that records what's written and answers reads from `input`.
// Full-screen programs get their keys through press().
export const terminal = (input = [], {columns = 80, rows = 24} = {}) => {
	let output = '';
	let keys = null;
	const reads = [];

	return {
		write: text => {
			output += text;
		},
		read: async (options = {}) => {
			reads.push(options);
			return input.length ? input.shift() : null;
		},
		columns: () => columns,
		rows: () => rows,
		raw: handler => {
			keys = handler;
			return () => {
				keys = null;
			};
		},
		reads,
		isRaw: () => keys !== null,
		press: async (...data) => {
			await vi.waitFor(() => {
				if (!keys) {
					throw new Error('Nothing is reading keys');
				}
			});
			for (const key of data) {
				keys(key);
			}
		},
		// The last full screen drawn, line by line.
		screen: () => plain(output.slice(output.lastIndexOf('\x1b[H'))).replace(/\r/g, '').split('\n'),
		take: ({codes = false} = {}) => {
			const text = output;
			output = '';
			return codes ? text : plain(text);
		},
	};
};

export const setup = (options = {}) => {
	const tty = terminal(options.input, options);
	const shell = createShell({tty, ...options});
	const run = async line => {
		await shell.execute(line);
		return tty.take().replace(/\n$/, '');
	};

	return {shell, tty, run};
};

// The desktop around the shell: pids from 2000, the terminal app's pid 1999.
export const fakeSystem = (overrides = {}) => {
	let next = 2000;
	let awake = false;
	return {
		pid: () => next++,
		terminalPid: 1999,
		bootedAt: new Date(),
		processes: () => [],
		kill: vi.fn(() => 'ok'),
		launch: vi.fn(),
		openUrl: vi.fn(() => true),
		halt: vi.fn(),
		get caffeinated() {
			return awake;
		},
		caffeinate: vi.fn(on => {
			awake = on;
		}),
		...overrides,
	};
};

export const stubStorage = (initial = {}) => {
	const items = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
	vi.stubGlobal('localStorage', {
		getItem: key => items.get(key) ?? null,
		setItem: (key, value) => items.set(key, String(value)),
		removeItem: key => items.delete(key),
	});

	return items;
};

// GitHub's answer for ~/Projects: Robin's repositories, by name, or a failure.
export const stubRepositories = (names = [], {ok = true} = {}) => {
	resetRepositories();
	vi.stubGlobal('fetch', vi.fn(async () => ({
		ok,
		headers: new Headers(),
		json: async () => names.map(name => ({name, html_url: `https://github.com/RobinJ1995/${name}`})),
	})));
};
