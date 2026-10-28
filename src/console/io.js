// Signals, cancellation and the streams commands read and write.

export const SIGNALS = [
	'HUP', 'INT', 'QUIT', 'ILL', 'TRAP', 'ABRT', 'BUS', 'FPE', 'KILL', 'USR1', 'SEGV', 'USR2', 'PIPE', 'ALRM', 'TERM',
	'STKFLT', 'CHLD', 'CONT', 'STOP', 'TSTP', 'TTIN', 'TTOU', 'URG', 'XCPU', 'XFSZ', 'VTALRM', 'PROF', 'WINCH', 'IO', 'PWR', 'SYS',
];

export const DESCRIPTIONS = {
	HUP: 'Hangup', INT: 'Interrupt', QUIT: 'Quit', ILL: 'Illegal instruction', TRAP: 'Trace/breakpoint trap',
	ABRT: 'Aborted', BUS: 'Bus error', FPE: 'Floating point exception', KILL: 'Killed', USR1: 'User defined signal 1',
	SEGV: 'Segmentation fault', USR2: 'User defined signal 2', PIPE: 'Broken pipe', ALRM: 'Alarm clock', TERM: 'Terminated',
};

// Signals that leave a process running.
export const HARMLESS = new Set(['CHLD', 'CONT', 'STOP', 'TSTP', 'TTIN', 'TTOU', 'URG', 'WINCH']);

export const signalNumber = name => SIGNALS.indexOf(name) + 1;

// `-9`, `-KILL`, `-SIGKILL`, `9`, `kill`... to a signal name, or null.
export const parseSignal = spec => {
	const text = String(spec).replace(/^-/, '').toUpperCase().replace(/^SIG/, '');
	if (/^\d+$/.test(text)) {
		return Number(text) === 0 ? 'EXIT' : SIGNALS[Number(text) - 1] ?? null;
	}

	return SIGNALS.includes(text) ? text : null;
};

// A process (or a whole command line) ending because of a signal.
export class Killed extends Error {
	constructor(signal) {
		super(signal);
		this.signal = signal;
		this.status = 128 + signalNumber(signal);
	}
}

// Cancellation, nestable: aborting a job aborts every command in it.
export class Abort {
	constructor(parent = null) {
		this.reason = null;
		this.listeners = new Set();
		this.detach = parent ? parent.on(reason => this.abort(reason)) : () => {};
	}

	abort(reason) {
		if (this.reason) {
			return;
		}
		this.reason = reason;
		this.detach();
		for (const listener of this.listeners) {
			listener(reason);
		}
		this.listeners.clear();
	}

	on(listener) {
		if (this.reason) {
			listener(this.reason);
			return () => {};
		}
		this.listeners.add(listener);

		return () => this.listeners.delete(listener);
	}

	check() {
		if (this.reason) {
			throw this.reason;
		}
	}

	// Settles with `promise`, or rejects as soon as this is aborted.
	race(promise) {
		return new Promise((resolve, reject) => {
			const off = this.on(reject);
			promise.then(value => {
				off();
				resolve(value);
			}, error => {
				off();
				reject(error);
			});
		});
	}

	sleep(ms) {
		let timer;
		return this.race(new Promise(resolve => {
			timer = setTimeout(resolve, ms);
		})).finally(() => clearTimeout(timer));
	}

	dispose() {
		this.detach();
	}
}

export class Pipe {
	constructor() {
		this.chunks = [];
		this.closed = false;
		this.broken = false;
		this.waiting = null;
	}

	write(text) {
		if (this.broken) {
			throw new Killed('PIPE');
		} else if (text) {
			this.chunks.push(text);
			this.wake();
		}
	}

	close() {
		this.closed = true;
		this.wake();
	}

	// The reading end went away: writers get SIGPIPE.
	hangUp() {
		this.broken = true;
		this.chunks = [];
	}

	wake() {
		this.waiting?.();
		this.waiting = null;
	}

	async read() {
		while (!this.chunks.length && !this.closed) {
			await new Promise(resolve => {
				this.waiting = resolve;
			});
		}

		return this.chunks.length ? this.chunks.splice(0).join('') : null;
	}
}

export class Output {
	constructor(write, {tty = false} = {}) {
		this.write = write;
		this.isTTY = tty;
	}
}

export const nullOutput = () => new Output(() => {});

export const bufferOutput = () => {
	const chunks = [];
	const output = new Output(text => chunks.push(text));
	output.text = () => chunks.join('');

	return output;
};

// What a command reads: buffered, so `read` takes one line and leaves the rest.
// `source.read()` resolves with text, or null at the end (which, on a terminal,
// is only the end for now).
export class Input {
	constructor(source, {tty = false} = {}) {
		this.source = source;
		this.isTTY = tty;
		this.buffer = '';
		this.ended = false;
	}

	async fill(abort) {
		if (this.ended) {
			return false;
		}
		const chunk = await abort.race(this.source.read());
		if (chunk === null) {
			this.ended = !this.isTTY;
			return false;
		}
		this.buffer += chunk;

		return true;
	}

	// {line, complete}, where an incomplete line ran into the end; null at the end.
	async readLine(abort) {
		for (;;) {
			const newline = this.buffer.indexOf('\n');
			if (newline >= 0) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				return {line, complete: true};
			} else if (!(await this.fill(abort))) {
				const line = this.buffer;
				this.buffer = '';
				return line ? {line, complete: false} : null;
			}
		}
	}

	// Whatever there is, as soon as there is any; null at the end.
	async read(abort) {
		if (!this.buffer && !(await this.fill(abort))) {
			return null;
		}
		const text = this.buffer;
		this.buffer = '';

		return text;
	}

	async readAll(abort) {
		while (await this.fill(abort)) {
			// Until the end.
		}
		const text = this.buffer;
		this.buffer = '';

		return text;
	}
}

export const textInput = text => {
	let done = false;
	return new Input({
		read: async () => {
			if (done) {
				return null;
			}
			done = true;
			return text;
		},
	});
};

export const pipeInput = pipe => new Input(pipe);
