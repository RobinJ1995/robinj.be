import {parse, parseExpansions, ParseError} from './parse';
import {expandWords, expandString, expandPattern, expandRegex, matchPattern, patternSource, hasGlob, ExpansionError} from './expand';
import {evaluate, ArithError} from './arith';
import {Abort, Killed, Pipe, Output, Input, textInput, pipeInput, nullOutput, bufferOutput, DESCRIPTIONS, HARMLESS} from './io';
import {createFs, HOME, PORTFOLIO, normalize, displayPath, parentOf} from './fs';
import {FILES} from './files';
import {BUILTINS, KEYWORDS, Exit, Break, Continue, Return, fileTest, binaryTest} from './builtins';
import {COMMANDS, PACKAGED} from './commands';
import {historyStore, packageStore} from './storage';
import {DAEMONS, APPS, USER_MANAGER} from './processes';
import {panicText, bootSequence, cancelShutdown} from './power';
import {insideProjects, listRepositories} from './projects';

export const USER = 'robin';
export const HOST = 'robinj.be';
const VERSION = '5.2.32(1)-release';

// Loop protection: a command line runs its first commands at full speed, then
// one command per THROTTLE_MS, so a runaway loop just crawls until ^C.
const FREE_COMMANDS = 10;
const THROTTLE_MS = 100;
const MAX_PROCESSES = 128;
const MAX_NESTING = 1000;
const HISTORY_SIZE = 1000;
const TTY_BACKLOG = 65536;

const PS1 = '\\[\\e[1;36m\\]\\u@\\H\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ ';
// Declaration builtins take `name=value` arguments without splitting them.
const DECLARATIONS = new Set(['export', 'local', 'declare', 'readonly']);
const ALIASES = [
	['egrep', 'grep -E --color=auto'],
	['fgrep', 'grep -F --color=auto'],
	['grep', 'grep --color=auto'],
	['l.', 'ls -d .* --color=auto'],
	['ll', 'ls -l --color=auto'],
	['ls', 'ls --color=auto'],
];

class ForkError extends Error {}

// What the shell runs on outside the desktop (and in tests): no other processes.
const standalone = () => {
	let next = 4000;
	let awake = false;
	let distracted = false;
	return {
		pid: () => next++, terminalPid: 3999, bootedAt: new Date(), processes: () => [], kill: () => 'missing', launch: () => null, halt: () => {},
		get caffeinated() {
			return awake;
		},
		caffeinate: on => {
			awake = on;
		},
		get distracted() {
			return distracted;
		},
		distract: on => {
			distracted = on;
		},
		// True if the browser let the tab open.
		openUrl: url => {
			const tab = window.open(url, '_blank');
			if (tab) {
				tab.opener = null;
			}
			return Boolean(tab);
		},
	};
};

const profileExports = () => Object.fromEntries(FILES[`${HOME}/.profile`].text().split('\n')
	.map(line => line.match(/^export (\w+)="(.*)"$/))
	.filter(Boolean)
	.map(([, name, value]) => [name, value]));

const createState = () => {
	const exported = {
		HOME, USER, LOGNAME: USER, SHELL: '/bin/bash', HOSTNAME: HOST, PWD: PORTFOLIO, SHLVL: '1',
		PATH: '/home/robin/.local/bin:/home/robin/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin',
		LANG: 'en_IE.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor', MAIL: '/var/spool/mail/robin',
		XDG_CURRENT_DESKTOP: 'GNOME', XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0',
		HISTSIZE: String(HISTORY_SIZE), HISTCONTROL: 'ignoredups',
		...profileExports(),
	};
	const local = {
		PS1, PS2: '> ', PS4: '+ ', IFS: ' \t\n', OPTIND: '1', BASH: '/usr/bin/bash', BASH_VERSION: VERSION,
		HISTFILE: `${HOME}/.bash_history`, HISTFILESIZE: String(HISTORY_SIZE),
	};
	const globals = new Map([
		...Object.entries(exported).map(([name, value]) => [name, {value, exported: true}]),
		...Object.entries(local).map(([name, value]) => [name, {value, exported: false}]),
	]);

	return {
		scopes: [globals],
		functions: new Map(),
		aliases: new Map(ALIASES),
		positional: [],
		status: 0,
		cwd: PORTFOLIO,
		lastBackground: undefined,
	};
};

const cloneState = state => ({
	...state,
	scopes: state.scopes.map(scope => new Map([...scope].map(([name, entry]) => [
		name, {...entry, value: Array.isArray(entry.value) ? entry.value.slice() : entry.value},
	]))),
	functions: new Map(state.functions),
	aliases: new Map(state.aliases),
	positional: [...state.positional],
});

const joinPath = (base, name) => {
	if (base === '') {
		return name;
	}

	return base.endsWith('/') ? base + name : `${base}/${name}`;
};

// Whether `source` parses, or would with more after it.
const parses = source => {
	try {
		parse(source);
	} catch (e) {
		return e instanceof ParseError && e.incomplete;
	}

	return true;
};

// Multi-line commands go into the history on one line, as bash's cmdhist does.
const historyLine = source => {
	if (!source.includes('\n') || source.includes('<<')) {
		return source;
	}

	return source.split('\n').map(line => line.trim()).filter(Boolean).reduce((joined, line) => {
		const open = /(?:^|\s)(?:then|do|else|in|\{)$|[|&;({]$/.test(joined) || /^(?:;;|\))/.test(line) || !parses(`${joined}; ${line}`);
		return `${joined}${open ? ' ' : '; '}${line}`;
	});
};

class HistoryError extends Error {}

// `!!`, `!n`, `!-n`, `!prefix` and `!$`, outside single quotes.
const expandHistory = (line, history) => {
	let result = '';
	let single = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '\\' && !single) {
			result += c + (line[i + 1] ?? '');
			i++;
			continue;
		} else if (c === "'") {
			single = !single;
		}

		const rest = line.slice(i + 1);
		const inhibited = line[i - 1] === '$' || (line[i - 1] === '[' && rest.includes(']')) || (line.slice(i - 2, i) === '${' && rest.includes('}'));
		const event = !single && !inhibited && c === '!' && rest.match(/^(?:!|\$|-?\d+|[^\s!=()"';&|<>]+)/);
		if (!event) {
			result += c;
			continue;
		}

		const [spec] = event;
		let entry;
		if (spec === '!' || spec === '$') {
			entry = history[history.length - 1];
		} else if (/^-?\d+$/.test(spec)) {
			const n = Number(spec);
			entry = history[n < 0 ? history.length + n : n - 1];
		} else {
			entry = [...history].reverse().find(previous => previous.startsWith(spec));
		}
		if (entry === undefined) {
			throw new HistoryError(`!${spec}: event not found`);
		}

		result += spec === '$' ? entry.trim().split(/\s+/).pop() : entry;
		i += spec.length;
	}

	return result;
};

class Shell {
	constructor({tty, system, onExit, onCwd, onOpenFile}) {
		this.tty = tty;
		this.system = system;
		this.onExit = onExit;
		this.onCwd = onCwd;
		this.onOpenFile = onOpenFile;
		this.version = VERSION;
		this.state = createState();
		this.history = historyStore.load();
		this.packages = new Set(packageStore.load());
		this.fs = createFs({history: () => this.history, binaries: () => this.binaries()});
		this.alive = new Abort();
		this.procs = new Map();
		this.jobs = [];
		this.finished = [];
		this.foreground = null;
		this.pid = system.pid();
		this.started = new Date();
		this.exited = false;
		this.backlog = 0;
	}

	// --- Variables ---

	lookup(state, name) {
		for (let i = state.scopes.length - 1; i >= 0; i--) {
			if (state.scopes[i].has(name)) {
				return state.scopes[i].get(name);
			}
		}

		return undefined;
	}

	getVar(state, name) {
		switch (name) {
			case '?': return String(state.status);
			case '$': return String(this.pid);
			case '!': return state.lastBackground === undefined ? undefined : String(state.lastBackground);
			case '#': return String(state.positional.length);
			case '-': return 'himBHs';
			case '0': return 'bash';
			case '@':
			case '*': return state.positional.join(' ');
			case 'RANDOM': return String(Math.floor(Math.random() * 32768));
			case 'SECONDS': return String(Math.floor((Date.now() - this.started) / 1000));
			case 'EPOCHSECONDS': return String(Math.floor(Date.now() / 1000));
			case 'BASHPID': return String(this.pid);
			case 'PPID': return String(this.system.terminalPid);
			case 'UID':
			case 'EUID': return '1000';
			default: break;
		}

		if (/^\d+$/.test(name)) {
			return state.positional[Number(name) - 1];
		}

		const entry = this.lookup(state, name);
		if (!entry) {
			return undefined;
		}

		return Array.isArray(entry.value) ? entry.value[0] : entry.value;
	}

	getArray(state, name) {
		if (name === '@' || name === '*') {
			return state.positional;
		}
		const entry = this.lookup(state, name);
		if (!entry) {
			return undefined;
		}

		// Arrays can have gaps; `${a[@]}` skips them.
		return Array.isArray(entry.value) ? Object.values(entry.value) : [entry.value];
	}

	getElement(state, name, index) {
		const entry = this.lookup(state, name);
		if (!entry) {
			return undefined;
		}

		const values = Array.isArray(entry.value) ? entry.value : [entry.value];
		return values[index < 0 ? values.length + index : index];
	}

	setVar(state, name, value, {index, append} = {}) {
		const existing = this.lookup(state, name);
		const entry = existing ?? {value: '', exported: false};
		if (!existing) {
			state.scopes[0].set(name, entry);
		}
		delete entry.unset;

		if (Array.isArray(value)) {
			const array = Array.isArray(entry.value) ? entry.value : [entry.value];
			entry.value = append && existing ? array.concat(value) : [...value];
		} else if (index !== undefined) {
			const array = Array.isArray(entry.value) ? entry.value : entry.value === '' ? [] : [entry.value];
			const i = index < 0 ? array.length + index : index;
			array[i] = append ? (array[i] ?? '') + value : value;
			entry.value = array;
		} else if (Array.isArray(entry.value)) {
			entry.value[0] = append ? (entry.value[0] ?? '') + value : value;
		} else {
			entry.value = append ? entry.value + value : value;
		}
	}

	setLocal(state, name, value) {
		state.scopes[state.scopes.length - 1].set(name, {value, exported: false});
	}

	markExported(state, name, exported) {
		if (!this.lookup(state, name)) {
			state.scopes[0].set(name, {value: '', exported, unset: true});
		}
		this.lookup(state, name).exported = exported;
	}

	unsetVar(state, name) {
		for (let i = state.scopes.length - 1; i >= 0; i--) {
			if (state.scopes[i].delete(name)) {
				return;
			}
		}
	}

	// Every visible variable, innermost scope winning, sorted by name.
	variables(state) {
		const all = new Map();
		for (const scope of state.scopes) {
			for (const [name, entry] of scope) {
				all.set(name, entry);
			}
		}

		return [...all].filter(([, entry]) => !entry.unset).sort(([a], [b]) => (a < b ? -1 : 1));
	}

	environment(state, extra = new Map()) {
		const env = new Map();
		for (const [name, entry] of this.variables(state)) {
			if (entry.exported) {
				env.set(name, Array.isArray(entry.value) ? entry.value[0] ?? '' : entry.value);
			}
		}
		for (const [name, entry] of extra) {
			env.set(name, entry.value);
		}

		return env;
	}

	// --- Expansion ---

	env(ctx) {
		const {state} = ctx;
		const env = {
			get: name => this.getVar(state, name),
			getArray: name => this.getArray(state, name),
			getElement: (name, index) => this.getElement(state, name, index),
			set: (name, value) => this.setVar(state, name, value),
			positional: () => state.positional,
			ifs: () => this.getVar(state, 'IFS') ?? ' \t\n',
			arith: text => this.arith(text, ctx),
			substitute: async program => {
				const output = bufferOutput();
				env.substituted = await this.subshell({...ctx, io: [ctx.io[0], output, ctx.io[2]]}, sub => this.run(program, sub));
				return output.text();
			},
			glob: pattern => this.glob(pattern, state.cwd, ctx.abort),
			home: user => ({'': this.getVar(state, 'HOME') ?? HOME, robin: HOME, root: '/root', '+': state.cwd, '-': this.getVar(state, 'OLDPWD')})[user],
			expandString: parts => expandString(parts, env),
			expandPattern: parts => expandPattern(parts, env),
		};

		return env;
	}

	async arith(text, ctx) {
		const expanded = /[$`]/.test(text) ? await expandString(parseExpansions(text), this.env(ctx)) : text;
		try {
			return evaluate(expanded.replace(/"/g, ''), {
				get: name => this.getVar(ctx.state, name),
				set: (name, value) => this.setVar(ctx.state, name, value),
			});
		} catch (e) {
			if (e instanceof ArithError) {
				throw new ExpansionError(`${(e.expression ?? expanded).trim()}: ${e.message} (error token is "${e.token}")`);
			}
			throw e;
		}
	}

	async glob(pattern, cwd, abort) {
		const absolute = pattern.startsWith('/');
		const segments = pattern.split('/').slice(absolute ? 1 : 0);
		const directoriesOnly = segments.length > 1 && segments[segments.length - 1] === '';
		if (directoriesOnly) {
			segments.pop();
		}

		let paths = [absolute ? '/' : ''];
		for (const segment of segments) {
			if (!hasGlob(segment)) {
				paths = paths.map(path => joinPath(path, segment.replace(/\\(.)/g, '$1')));
				continue;
			}

			const regex = new RegExp(`^(?:${patternSource(segment, true)})$`);
			const hidden = /^\\?\./.test(segment);
			const directories = paths.map(path => normalize(cwd, path || '.'));
			await this.ready(directories, abort);
			paths = paths.flatMap((path, i) => {
				const listing = this.fs.list(directories[i]);
				return listing.error ? [] : listing.names
					.filter(name => (hidden || !name.startsWith('.')) && regex.test(name))
					.map(name => joinPath(path, name));
			});
		}

		await this.ready(paths.map(path => parentOf(normalize(cwd, path))), abort);
		// Links that lead nowhere match too; with a slash, only what leads to a directory.
		return paths
			.filter(path => {
				const found = this.fs.lookup(normalize(cwd, path), {follow: directoriesOnly});
				return !found.error && (!directoriesOnly || found.entry.type === 'dir');
			})
			.map(path => (directoriesOnly ? `${path}/` : path))
			.sort();
	}

	// --- Running things ---

	async tick(ctx) {
		ctx.abort.check();
		const {throttle} = ctx.job;
		throttle.count++;
		if (throttle.count <= FREE_COMMANDS) {
			return;
		}

		// Shared by everything the command line started, background jobs included.
		const now = Date.now();
		throttle.next = Math.max(throttle.next, now) + THROTTLE_MS;
		await ctx.abort.sleep(throttle.next - now);
	}

	failed(ctx, e) {
		if (e instanceof ExpansionError) {
			ctx.io[2].write(`bash: ${e.message}\n`);
			return 1;
		}
		throw e;
	}

	async run(node, ctx) {
		ctx.abort.check();
		let status;
		switch (node.type) {
			case 'list':
				status = await this.runList(node, ctx);
				break;
			case 'andor':
				status = await this.run(node.first, ctx);
				for (const {op, pipeline} of node.rest) {
					if ((op === '&&') === (status === 0)) {
						status = await this.run(pipeline, ctx);
					}
				}
				break;
			case 'pipeline':
				status = await this.runPipeline(node, ctx);
				break;
			case 'simple':
				status = await this.runSimple(node, ctx);
				break;
			case 'function':
				ctx.state.functions.set(node.name, node);
				status = 0;
				break;
			default:
				status = await this.withRedirects(node, ctx, inner => this.runCompound(node, inner));
		}

		ctx.state.status = status;
		return status;
	}

	async runList(node, ctx) {
		let status = ctx.state.status;
		for (const item of node.items) {
			if (item.async) {
				this.background(item, ctx);
				status = 0;
			} else {
				status = await this.run(item.node, ctx);
			}
			ctx.state.status = status;
		}

		return status;
	}

	async runPipeline(node, ctx) {
		if (node.commands.length === 1) {
			const status = await this.run(node.commands[0], ctx);
			return node.negate ? Number(status === 0) : status;
		}

		const pipes = node.commands.slice(1).map(() => new Pipe());
		const stages = node.commands.map((command, i) => {
			const output = i < pipes.length ? new Output(text => pipes[i].write(text), {drain: () => pipes[i].drain()}) : ctx.io[1];
			const io = [i ? pipeInput(pipes[i - 1]) : ctx.io[0], output, node.stderr[i] ? output : ctx.io[2]];

			return this.subshell({...ctx, io}, sub => this.run(command, sub))
				.catch(e => {
					if (e instanceof Killed && e.signal === 'PIPE' && !ctx.abort.reason) {
						return e.status;
					}
					throw e;
				})
				.finally(() => {
					pipes[i]?.close();
					pipes[i - 1]?.hangUp();
				});
		});

		const results = await Promise.allSettled(stages);
		const failure = results.find(result => result.status === 'rejected');
		if (failure) {
			throw failure.reason;
		}

		const status = results[results.length - 1].value;
		return node.negate ? Number(status === 0) : status;
	}

	async subshell(ctx, body) {
		try {
			return await body({...ctx, state: cloneState(ctx.state), subshell: true});
		} catch (e) {
			if (e instanceof Exit) {
				return e.status;
			}
			throw e;
		}
	}

	async runCompound(node, ctx) {
		switch (node.type) {
			case 'group':
				return this.run(node.body, ctx);
			case 'subshell':
				return this.subshell(ctx, sub => this.run(node.body, sub));
			case 'if':
				for (const clause of node.clauses) {
					if (await this.run(clause.condition, ctx) === 0) {
						return this.run(clause.body, ctx);
					}
				}
				return node.otherwise ? this.run(node.otherwise, ctx) : 0;
			case 'while':
				return this.loop(ctx, async () => (await this.run(node.condition, ctx)) === 0 !== node.until, node.body);
			case 'for': {
				let items;
				try {
					items = node.items ? await expandWords(node.items, this.env(ctx)) : [...ctx.state.positional];
				} catch (e) {
					return this.failed(ctx, e);
				}
				let i = 0;
				return this.loop(ctx, () => {
					if (i >= items.length) {
						return false;
					}
					this.setVar(ctx.state, node.name, items[i++]);
					return true;
				}, node.body);
			}
			case 'cfor':
				try {
					if (node.init.trim()) {
						await this.arith(node.init, ctx);
					}
					let first = true;
					return await this.loop(ctx, async () => {
						if (!first && node.step.trim()) {
							await this.arith(node.step, ctx);
						}
						first = false;
						return !node.condition.trim() || (await this.arith(node.condition, ctx)) !== 0n;
					}, node.body);
				} catch (e) {
					return this.failed(ctx, e);
				}
			case 'case':
				return this.runCase(node, ctx);
			case 'arith':
				await this.tick(ctx);
				try {
					return (await this.arith(node.raw, ctx)) === 0n ? 1 : 0;
				} catch (e) {
					return this.failed(ctx, e);
				}
			case 'cond':
				await this.tick(ctx);
				try {
					const result = await this.condition(node.expression, ctx);
					return result === null ? 2 : Number(!result);
				} catch (e) {
					return this.failed(ctx, e);
				}
			default:
				throw new Error(`Unknown node ${node.type}`);
		}
	}

	// Runs `body` while `next()` says so; handles break and continue.
	async loop(ctx, next, body) {
		const inner = {...ctx, loops: ctx.loops + 1};
		let status = 0;
		for (;;) {
			try {
				if (!(await next())) {
					return status;
				}
				status = await this.run(body, inner);
			} catch (e) {
				if (!(e instanceof Break)) {
					throw e;
				} else if (e.levels > 1) {
					e.levels--;
					throw e;
				} else if (!(e instanceof Continue)) {
					return status;
				}
			}
		}
	}

	async runCase(node, ctx) {
		const env = this.env(ctx);
		let subject;
		try {
			subject = await expandString(node.subject, env);
		} catch (e) {
			return this.failed(ctx, e);
		}

		let status = 0;
		let fallthrough = false;
		for (const item of node.items) {
			let matched = fallthrough;
			for (const pattern of matched ? [] : item.patterns) {
				if (matchPattern(await expandPattern(pattern, env), subject)) {
					matched = true;
					break;
				}
			}
			if (!matched) {
				continue;
			}

			status = item.body.items.length ? await this.run(item.body, ctx) : 0;
			if (item.terminator === ';;') {
				break;
			}
			fallthrough = item.terminator === ';&';
		}

		return status;
	}

	// [[ ... ]]: true, false, or null after an error was reported.
	async condition(expression, ctx) {
		const env = this.env(ctx);
		switch (expression.op) {
			case '!': {
				const value = await this.condition(expression.operand, ctx);
				return value === null ? null : !value;
			}
			case '&&':
			case '||': {
				const left = await this.condition(expression.left, ctx);
				if (left === null || left === (expression.op === '||')) {
					return left;
				}
				return this.condition(expression.right, ctx);
			}
			case 'string':
				return (await expandString(expression.operand, env)) !== '';
			case 'unary': {
				const operand = await expandString(expression.operand, env);
				await this.ready([parentOf(normalize(ctx.state.cwd, operand))], ctx.abort);
				return fileTest(this, ctx, expression.test, operand);
			}
			default:
				break;
		}

		const left = await expandString(expression.left, env);
		const {test} = expression;
		if (test === '==' || test === '=' || test === '!=') {
			return matchPattern(await expandPattern(expression.right, env), left) === (test !== '!=');
		} else if (test === '=~') {
			let regex;
			try {
				regex = new RegExp(await expandRegex(expression.right, env));
			} catch {
				return null;
			}
			const match = left.match(regex);
			this.setVar(ctx.state, 'BASH_REMATCH', match ? [...match].map(group => group ?? '') : []);
			return Boolean(match);
		} else if (/^-(eq|ne|lt|le|gt|ge)$/.test(test)) {
			return binaryTest(this, ctx, '[[', test, await this.arith(left, ctx), await this.arith(await expandString(expression.right, env), ctx));
		}

		return binaryTest(this, ctx, '[[', test, left, await expandString(expression.right, env));
	}

	async withRedirects(node, ctx, body) {
		if (!node.redirs?.length) {
			return body(ctx);
		}

		const io = await this.redirect(node.redirs, ctx);
		return io ? body({...ctx, io}) : 1;
	}

	openWrite(path, ctx) {
		const special = {'/dev/null': nullOutput(), '/dev/stdout': ctx.io[1], '/dev/stderr': ctx.io[2], '/dev/tty': this.ttyOutput()};
		const absolute = normalize(ctx.state.cwd, path);
		if (special[absolute]) {
			return {output: special[absolute]};
		}

		// Other devices take whatever is written to them.
		const error = this.fs.writeError(absolute);
		return error ? {error} : {output: nullOutput()};
	}

	openRead(path, ctx) {
		const absolute = normalize(ctx.state.cwd, path);
		if (absolute === '/dev/stdin') {
			return {input: ctx.io[0]};
		} else if (absolute === '/dev/tty') {
			return {input: this.ttyInput()};
		}

		const result = this.fs.read(absolute);
		if (result.error) {
			return result;
		}

		// Endless devices make a chunk at a time, throttled like a runaway loop.
		const {stream} = this.fs.lookup(absolute).entry;
		return {input: stream ? new Input({read: async () => {
			await this.tick(ctx);
			return stream();
		}}) : textInput(result.text)};
	}

	// The io for a command, after its redirections; null when one failed.
	async redirect(redirects, ctx) {
		const env = this.env(ctx);
		const io = [...ctx.io];
		const fail = message => {
			ctx.io[2].write(`bash: ${message}\n`);
			return null;
		};

		for (const redirect of redirects) {
			let target = null;
			try {
				if (!redirect.heredoc) {
					const words = await expandWords([redirect.target], env);
					if (words.length !== 1) {
						return fail(`${redirect.text}: ambiguous redirect`);
					}
					[target] = words;
					await this.ready([parentOf(normalize(ctx.state.cwd, target))], ctx.abort);
				}

				const {op} = redirect;
				const fd = redirect.fd ?? (op[0] === '<' ? 0 : 1);
				if (op === '<<' || op === '<<-') {
					io[fd] = textInput(redirect.heredoc.quoted ? redirect.heredoc.body[0].v : await expandString(redirect.heredoc.body, env));
				} else if (op === '<<<') {
					io[fd] = textInput(`${await expandString(redirect.target, env)}\n`);
				} else if (op === '<' || op === '<>') {
					const opened = this.openRead(target, ctx);
					if (opened.error) {
						return fail(`${target}: ${opened.error}`);
					}
					io[fd] = opened.input;
				} else if ((op === '>&' || op === '<&') && (target === '-' || /^\d+$/.test(target))) {
					if (target !== '-' && !io[Number(target)]) {
						return fail(`${target}: Bad file descriptor`);
					}
					io[fd] = target === '-' ? (fd ? nullOutput() : textInput('')) : io[Number(target)];
				} else {
					const opened = this.openWrite(target, ctx);
					if (opened.error) {
						return fail(`${target}: ${opened.error}`);
					}
					const both = op === '&>' || op === '&>>' || (op === '>&' && redirect.fd === null);
					for (const n of both ? [1, 2] : [fd]) {
						io[n] = opened.output;
					}
				}
			} catch (e) {
				this.failed(ctx, e);
				return null;
			}
		}

		return io;
	}

	async runSimple(node, ctx) {
		await this.tick(ctx);
		const env = this.env(ctx);
		const words = node.words;

		let argv;
		try {
			const [first] = words;
			const declaration = first?.length === 1 && first[0].t === 'lit' && DECLARATIONS.has(first[0].v);
			if (declaration) {
				argv = [first[0].v];
				for (const word of words.slice(1)) {
					const assignment = word[0]?.t === 'lit' && /^[A-Za-z_]\w*\+?=/.test(word[0].v);
					argv.push(...(assignment ? [await expandString(word, env)] : await expandWords([word], env)));
				}
			} else {
				argv = await expandWords(words, env);
			}
		} catch (e) {
			return this.failed(ctx, e);
		}

		if (argv.length === 0) {
			try {
				for (const assignment of node.assigns) {
					await this.assign(assignment, ctx, env);
				}
			} catch (e) {
				return this.failed(ctx, e);
			}
			const io = node.redirs.length ? await this.redirect(node.redirs, ctx) : ctx.io;
			return io ? env.substituted ?? 0 : 1;
		}

		const io = node.redirs.length ? await this.redirect(node.redirs, ctx) : ctx.io;
		if (!io) {
			return 1;
		}

		const temporary = new Map();
		try {
			for (const assignment of node.assigns) {
				temporary.set(assignment.name, {value: await expandString(assignment.value, env), exported: true});
			}
		} catch (e) {
			return this.failed(ctx, e);
		}

		return this.invoke(argv, {...ctx, io}, {temporary});
	}

	async assign({name, index, append, value, array}, ctx, env) {
		if (array) {
			this.setVar(ctx.state, name, await expandWords(array, env), {append});
		} else {
			const i = index === undefined ? undefined : Number(await this.arith(index, ctx));
			this.setVar(ctx.state, name, await expandString(value, env), {index: i, append});
		}
	}

	// Runs argv[0] as a function, builtin or program, in that order.
	async invoke(argv, ctx, {temporary = new Map(), functions = true} = {}) {
		const [name, ...args] = argv;
		if (functions && ctx.state.functions.has(name)) {
			return this.callFunction(name, args, ctx, temporary);
		}

		// Any argument may be a path, looked up in its directory.
		await this.ready(argv.map(arg => parentOf(normalize(ctx.state.cwd, arg))), ctx.abort);
		if (BUILTINS[name] && temporary.size === 0) {
			return await BUILTINS[name](this, ctx, args) ?? 0;
		} else if (BUILTINS[name]) {
			ctx.state.scopes.push(temporary);
			try {
				return await BUILTINS[name](this, ctx, args) ?? 0;
			} finally {
				ctx.state.scopes.pop();
			}
		}

		const program = this.findProgram(name, ctx);
		if (program.error) {
			ctx.io[2].write(`bash: ${name}: ${program.error}\n`);
			return program.status;
		}

		return this.spawn(program.name, args, ctx, ctx.environment ?? this.environment(ctx.state, temporary));
	}

	async callFunction(name, args, ctx, temporary) {
		if (ctx.depth >= MAX_NESTING) {
			ctx.io[2].write(`bash: ${name}: maximum function nesting level exceeded (${MAX_NESTING})\n`);
			return 1;
		}

		const {state} = ctx;
		const saved = state.positional;
		state.positional = args;
		state.scopes.push(temporary);
		try {
			return await this.run(state.functions.get(name).body, {...ctx, depth: ctx.depth + 1});
		} catch (e) {
			if (e instanceof Return) {
				return e.status;
			}
			throw e;
		} finally {
			state.scopes.pop();
			state.positional = saved;
		}
	}

	// --- Programs and processes ---

	// Before looking in these directories: what's in ~/Projects comes from GitHub,
	// the first time it's needed.
	async ready(directories, abort = new Abort()) {
		if (directories.some(insideProjects)) {
			await abort.race(listRepositories());
		}
	}

	available(name) {
		return Object.hasOwn(COMMANDS, name) && (!PACKAGED[name] || this.packages.has(PACKAGED[name]));
	}

	binaries() {
		return Object.keys(COMMANDS).filter(name => this.available(name));
	}

	commandPath(name) {
		return this.available(name) ? `/usr/bin/${name}` : null;
	}

	findProgram(name, ctx) {
		if (!name.includes('/')) {
			return this.available(name) ? {name} : {error: 'command not found', status: 127};
		}

		const path = normalize(ctx.state.cwd, name);
		const found = this.fs.lookup(path);
		if (found.error) {
			return {error: found.error, status: 127};
		} else if (found.entry.type === 'dir') {
			return {error: 'Is a directory', status: 126};
		} else if (found.path.startsWith('/usr/bin/') && this.available(found.path.slice(9))) {
			return {name: found.path.slice(9)};
		}

		return {error: 'Permission denied', status: 126};
	}

	register(name, args, abort, pid) {
		if (pid !== undefined && this.procs.has(pid)) {
			Object.assign(this.procs.get(pid), {name, args, abort});
			return this.procs.get(pid);
		} else if (this.procs.size >= MAX_PROCESSES) {
			throw new ForkError();
		}

		const proc = {pid: pid ?? this.system.pid(), ppid: this.pid, name, args, abort, started: new Date()};
		this.procs.set(proc.pid, proc);
		return proc;
	}

	async spawn(name, args, ctx, environment) {
		const abort = new Abort(ctx.abort);
		let proc;
		try {
			proc = this.register(name, [name, ...args], abort, ctx.execPid);
		} catch (e) {
			abort.dispose();
			if (e instanceof ForkError) {
				ctx.io[2].write('bash: fork: Resource temporarily unavailable\n');
				return 254;
			}
			throw e;
		}

		const api = {
			name,
			args,
			pid: proc.pid,
			stdin: ctx.io[0],
			stdout: ctx.io[1],
			stderr: ctx.io[2],
			out: text => ctx.io[1].write(text),
			err: text => ctx.io[2].write(text),
			abort,
			sleep: ms => abort.sleep(ms),
			readLine: () => ctx.io[0].readLine(abort),
			// From the terminal itself, not stdin, and without echo: as sudo and su do.
			readPassword: async prompt => {
				this.tty.write(prompt);
				const line = await abort.race(this.tty.read({echo: false}));
				this.tty.write('\n');
				return line === null ? null : line.replace(/\n$/, '');
			},
			readAll: () => ctx.io[0].readAll(abort),
			// Waits until the output can take more.
			drain: () => abort.race(ctx.io[1].drain()),
			// Counts as a command for the loop protection: crawls once there were many.
			tick: () => this.tick(ctx),
			// Before listing a directory: ~/Projects waits for GitHub.
			ready: path => this.ready([path], abort),
			openRead: path => this.openRead(path, ctx),
			openWrite: path => this.openWrite(path, ctx),
			cwd: ctx.state.cwd,
			resolve: path => normalize(ctx.state.cwd, path),
			env: environment,
			fs: this.fs,
			tty: this.tty,
			system: this.system,
			shell: this,
			user: ctx.user ?? USER,
			run: (argv, io = ctx.io, extra = {}) => this.invoke(argv, {...ctx, io, execPid: undefined, ...extra}),
			script: (source, positional = []) => this.subshell(ctx, sub => {
				sub.state.positional = positional;
				// What it has exported is the environment it was given.
				for (const [name, entry] of this.variables(sub.state)) {
					if (entry.exported && !environment.has(name)) {
						this.unsetVar(sub.state, name);
					}
				}
				for (const [name, value] of environment) {
					this.setVar(sub.state, name, value);
					this.markExported(sub.state, name, true);
				}
				return this.run(parse(source), {...sub, execPid: undefined, environment: undefined});
			}),
		};

		try {
			return await COMMANDS[name](api) ?? 0;
		} catch (e) {
			// A background job's lone program is the job: the signal ends the job.
			if (!(e instanceof Killed) || ctx.abort.reason || proc.pid === ctx.execPid) {
				throw e;
			} else if (!['INT', 'PIPE'].includes(e.signal) && !ctx.job.background) {
				ctx.io[2].write(`${DESCRIPTIONS[e.signal] ?? `Signal ${e.status - 128}`}\n`);
			}
			return e.status;
		} finally {
			abort.dispose();
			if (proc.pid !== ctx.execPid) {
				this.procs.delete(proc.pid);
			}
		}
	}

	background(item, ctx) {
		const abort = new Abort(this.alive);
		let proc;
		try {
			proc = this.register('bash', ['bash'], abort);
		} catch (e) {
			if (e instanceof ForkError) {
				ctx.io[2].write('bash: fork: Resource temporarily unavailable\n');
				return;
			}
			throw e;
		}

		const ids = new Set(this.jobs.map(job => job.id));
		let id = 1;
		while (ids.has(id)) {
			id++;
		}

		const job = {id, pid: proc.pid, text: item.text, abort};
		const jobCtx = {
			...ctx,
			state: cloneState(ctx.state),
			subshell: true,
			io: [textInput(''), ctx.io[1], ctx.io[2]],
			abort,
			job: {throttle: ctx.job.throttle, background: true},
			// A lone program runs as the job's process itself, as bash's would.
			execPid: item.node.type === 'simple' ? proc.pid : undefined,
		};

		this.jobs.push(job);
		ctx.state.lastBackground = proc.pid;
		ctx.io[2].write(`[${id}] ${proc.pid}\n`);

		job.promise = this.run(item.node, jobCtx)
			.then(status => ({status}), e => {
				if (e instanceof Killed) {
					return {status: e.status, signal: e.signal};
				}
				return {status: e instanceof Exit ? e.status : 1};
			})
			.then(result => {
				job.result = result;
				abort.dispose();
				this.procs.delete(proc.pid);
				if (this.jobs.includes(job)) {
					this.finished.push(job);
				}
				return result;
			});
	}

	jobLine(job, marker, long = false) {
		const {result} = job;
		let state = 'Running';
		if (result?.signal) {
			state = DESCRIPTIONS[result.signal] ?? `Signal ${result.status - 128}`;
		} else if (result) {
			state = result.status ? `Exit ${result.status}` : 'Done';
		}

		return `[${job.id}]${marker}  ${long ? `${job.pid} ` : ''}${state.padEnd(24)}${job.text}${result ? '' : ' &'}`;
	}

	forgetJob(job) {
		this.jobs = this.jobs.filter(other => other !== job);
		this.finished = this.finished.filter(other => other !== job);
	}

	// Finished background jobs, as bash reports them before the next prompt.
	notifications() {
		const lines = this.finished.map(job => {
			const i = this.jobs.indexOf(job);
			return this.jobLine(job, i === this.jobs.length - 1 ? '+' : i === this.jobs.length - 2 ? '-' : ' ');
		});
		for (const job of this.finished) {
			this.forgetJob(job);
		}

		return lines.map(line => `${line}\n`).join('');
	}

	// Everything running: the system, the desktop's apps, and bash with what it runs.
	processes() {
		const tty = 'pts/0';
		const booted = this.system.bootedAt;
		return [
			...DAEMONS.map(daemon => ({...daemon, started: booted, tty: '?'})),
			...this.system.processes().map(app => ({
				ppid: USER_MANAGER, user: USER, command: APPS[app.name]?.command ?? app.name, tty: '?', ...app,
			})),
			{pid: this.pid, ppid: this.system.terminalPid, user: USER, name: 'bash', command: 'bash', started: this.started, tty},
			...[...this.procs.values()].map(proc => ({
				pid: proc.pid, ppid: proc.ppid, user: USER, name: proc.name, command: proc.args.join(' '), started: proc.started, tty,
			})),
		].sort((a, b) => a.pid - b.pid);
	}

	// 'ok', 'denied' or 'missing'.
	kill(pid, signal) {
		const proc = this.procs.get(pid);
		if (pid === this.pid) {
			// An interactive bash shrugs off TERM, INT and QUIT.
			if (!HARMLESS.has(signal) && !['EXIT', 'TERM', 'INT', 'QUIT'].includes(signal)) {
				setTimeout(() => this.exit(), 0);
			}
			return 'ok';
		} else if (proc) {
			if (!HARMLESS.has(signal) && signal !== 'EXIT') {
				proc.abort.abort(new Killed(signal));
			}
			return 'ok';
		}

		const daemon = DAEMONS.find(other => other.pid === pid);
		const app = this.system.processes().find(other => other.pid === pid);
		if (daemon) {
			return daemon.user === USER ? 'ok' : 'denied';
		} else if (!app) {
			return 'missing';
		} else if (HARMLESS.has(signal) || signal === 'EXIT') {
			return 'ok';
		} else if (app.name === 'desktop') {
			this.panic({pid, signal});
			return 'ok';
		}

		return this.system.kill(pid, signal);
	}

	panic(details) {
		const uptime = (Date.now() - this.system.bootedAt) / 1000;
		cancelShutdown();
		this.system.halt({mode: 'panic', lines: panicText({uptime, ...details}), boot: bootSequence()});
	}

	exit() {
		if (!this.exited) {
			this.exited = true;
			this.dispose();
			this.onExit();
		}
	}

	// Output waits for the terminal to catch up once there's a backlog, not after every write.
	ttyOutput() {
		return new Output(text => {
			this.backlog += text.length;
			this.tty.write(text);
		}, {tty: true, drain: async () => {
			if (this.backlog >= TTY_BACKLOG) {
				this.backlog = 0;
				await this.tty.drain?.();
			}
		}});
	}

	ttyInput() {
		this.ttyIn ??= new Input({read: () => this.tty.read()}, {tty: true});
		return this.ttyIn;
	}

	// --- The prompt ---

	prompt(variable = 'PS1') {
		const now = new Date();
		const two = n => String(n).padStart(2, '0');
		const cwd = this.state.cwd;
		const codes = {
			u: USER, h: HOST.split('.')[0], H: HOST, w: displayPath(cwd), W: cwd === HOME ? '~' : cwd.split('/').pop() || '/',
			$: '$', n: '\n', r: '\r', e: '\x1b', a: '\x07', s: 'bash', v: '5.2', V: '5.2.32', '\\': '\\', '[': '', ']': '',
			t: `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,
			A: `${two(now.getHours())}:${two(now.getMinutes())}`,
			d: now.toDateString().slice(0, 10),
		};

		return (this.getVar(this.state, variable) ?? '').replace(/\\(0?[0-7]{3}|.)/g, (match, code) => (
			/^0?[0-7]{3}$/.test(code) ? String.fromCharCode(parseInt(code, 8)) : codes[code] ?? match
		));
	}

	// --- History ---

	addHistory(line) {
		if (!line.trim() || this.history[this.history.length - 1] === line) {
			return;
		}
		this.history.push(line);
		this.history.splice(0, this.history.length - HISTORY_SIZE);
		historyStore.save(this.history);
	}

	clearHistory() {
		this.history.length = 0;
		historyStore.save(this.history);
	}

	deleteHistory(index) {
		this.history.splice(index, 1);
		historyStore.save(this.history);
	}

	savePackages() {
		packageStore.save([...this.packages]);
	}

	// --- Entry points ---

	// Whether `source` is a whole command yet, or the prompt should continue.
	isComplete(source) {
		try {
			parse(source, this.state.aliases);
		} catch (e) {
			return !(e instanceof ParseError && e.incomplete);
		}

		return true;
	}

	async execute(source) {
		let line;
		try {
			line = expandHistory(source, this.history);
		} catch (e) {
			if (!(e instanceof HistoryError)) {
				throw e;
			}
			this.tty.write(`bash: ${e.message}\n`);
			return;
		}
		if (line !== source) {
			this.tty.write(`${line}\n`);
		}
		this.addHistory(historyLine(line));

		let program;
		try {
			program = parse(line, this.state.aliases);
		} catch (e) {
			if (!(e instanceof ParseError)) {
				throw e;
			}
			this.tty.write(`bash: ${e.message}\n`);
			this.state.status = 2;
			return;
		}

		const abort = new Abort(this.alive);
		this.foreground = abort;
		const ctx = {
			state: this.state,
			io: [this.ttyInput(), this.ttyOutput(), this.ttyOutput()],
			abort,
			job: {throttle: {count: 0, next: 0}},
			depth: 0,
			loops: 0,
			subshell: false,
		};

		try {
			await this.run(program, ctx);
		} catch (e) {
			if (e instanceof Exit) {
				this.tty.write('exit\n');
				this.exit();
			} else if (e instanceof Killed) {
				this.state.status = e.status;
				if (e.signal === 'INT') {
					this.tty.write('\n');
				}
			} else if (e instanceof Break || e instanceof Return) {
				this.state.status = 0;
			} else {
				throw e;
			}
		} finally {
			abort.dispose();
			this.foreground = null;
		}
	}

	// ^C: stops whatever is running in the foreground.
	interrupt() {
		this.foreground?.abort(new Killed('INT'));
	}

	dispose() {
		this.alive.abort(new Killed('HUP'));
	}

	// Tab completion for the text before the cursor: what to insert, and the
	// candidates when there's more than one.
	async complete(before) {
		const word = before.match(/[^\s|;&<>()]*$/)[0];
		const isCommand = /(?:^|[|;&(]|&&|\|\||\b(?:then|do|else|sudo))\s*$/.test(before.slice(0, before.length - word.length));
		const slash = word.lastIndexOf('/');
		const base = word.slice(slash + 1);

		let candidates;
		let directory = null;
		if (isCommand && slash < 0) {
			candidates = [...new Set([
				...Object.keys(BUILTINS), ...KEYWORDS, ...this.binaries(), ...this.state.functions.keys(), ...this.state.aliases.keys(),
			])].sort();
		} else {
			const prefix = word.slice(0, slash + 1);
			const path = /^~(?=\/|$)/.test(prefix) ? HOME + prefix.slice(1) : prefix;
			directory = normalize(this.state.cwd, path || '.');
			await this.ready([directory]);
			const listing = this.fs.list(directory);
			candidates = (listing.names ?? []).filter(name => base.startsWith('.') || !name.startsWith('.'));
		}

		const options = candidates.filter(name => name.startsWith(base));
		const isDirectory = name => directory !== null && this.fs.lookup(normalize(directory, name)).entry?.type === 'dir';
		if (options.length === 1) {
			return {completion: options[0].slice(base.length) + (isDirectory(options[0]) ? '/' : ' '), options};
		}

		const common = options.reduce((prefix, name) => {
			let length = 0;
			while (length < prefix.length && prefix[length] === name[length]) {
				length++;
			}
			return prefix.slice(0, length);
		}, options[0] ?? '');

		return {completion: common.slice(base.length), options};
	}
}

// `tty`: write(text), read() for a line of input (null for ^D), columns(),
// rows(), and raw(onData) to take keys directly until the returned release().
export const createShell = ({tty, system = standalone(), onExit = () => {}, onCwd = () => {}, onOpenFile = () => {}}) => (
	new Shell({tty, system, onExit, onCwd, onOpenFile})
);
