import {parse, ParseError} from './parse';
import {SIGNALS, parseSignal} from './io';
import {displayPath, normalize} from './fs';

// Control flow, thrown through the interpreter.
export class Exit {
	constructor(status) {
		this.status = status;
	}
}

export class Break {
	constructor(levels) {
		this.levels = levels;
	}
}

export class Continue extends Break {}

export class Return {
	constructor(status) {
		this.status = status;
	}
}

export const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until', 'do', 'done', 'in', 'function', '{', '}', '!', '[[', ']]', 'time', 'select', 'coproc']);

const write = (ctx, fd, text) => ctx.io[fd].write(text);
const error = (ctx, text) => write(ctx, 2, `${text}\n`);
const isName = name => /^[A-Za-z_]\w*$/.test(name);
const shellQuote = value => (/^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`);

// \n, \t, \x41, \0101... as in `echo -e`, `printf` and `$'...'`. `\c` stops all output.
const unescape = (text, octalNeedsZero) => {
	let stopped = false;
	const result = text.replace(/\\(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|(0[0-7]{0,3}|[1-7][0-7]{0,2})|(.))/gs, (match, hex, unicode, octal, other, offset) => {
		if (stopped) {
			return '';
		} else if (hex || unicode) {
			return String.fromCodePoint(parseInt(hex ?? unicode, 16));
		} else if (octal !== undefined) {
			if (octalNeedsZero && octal[0] !== '0') {
				return match;
			}
			return String.fromCharCode(parseInt(octal, 8) & 255);
		} else if (other === 'c') {
			stopped = offset;
			return '';
		}

		return {a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\'}[other] ?? match;
	});

	return {text: result, stopped: stopped !== false};
};

const integer = (ctx, name, value) => {
	if (!/^\s*[-+]?\d+\s*$/.test(value)) {
		error(ctx, `bash: ${name}: ${value}: integer expression expected`);
		return null;
	}

	return BigInt(value.trim());
};

// --- test, [ and [[ ]] ---

export const fileTest = (sh, ctx, op, operand) => {
	if (op === '-n') {
		return operand !== '';
	} else if (op === '-z') {
		return operand === '';
	} else if (op === '-t') {
		return Boolean(ctx.io[Number(operand)]?.isTTY);
	} else if (op === '-v') {
		return sh.getVar(ctx.state, operand) !== undefined;
	}

	const path = normalize(ctx.state.cwd, operand);
	const found = sh.fs.lookup(path, {follow: op !== '-L' && op !== '-h'});
	if (found.error || operand === '') {
		return false;
	}

	const {entry} = found;
	switch (op) {
		case '-e':
		case '-a':
			return true;
		case '-f':
			return entry.type === 'file';
		case '-d':
			return entry.type === 'dir';
		case '-c':
			return entry.type === 'char';
		case '-L':
		case '-h':
			return entry.type === 'link';
		case '-s':
			return entry.type === 'dir' || (entry.type === 'file' && entry.text().length > 0);
		case '-r':
			return sh.fs.access(path, 0o4) === null;
		case '-w':
			return sh.fs.access(path, 0o2) === null;
		case '-x':
			return sh.fs.access(path, 0o1) === null;
		case '-O':
		case '-G':
			return entry.owner === 'robin';
		case '-k':
			return Boolean(entry.mode & 0o1000);
		default:
			return false;
	}
};

// `left op right` for test and [[ ]]; null after reporting a bad number.
export const binaryTest = (sh, ctx, name, op, left, right) => {
	const numeric = {'-eq': 0, '-ne': 0, '-lt': 0, '-le': 0, '-gt': 0, '-ge': 0};
	if (op in numeric) {
		const a = typeof left === 'bigint' ? left : integer(ctx, name, left);
		const b = typeof right === 'bigint' ? right : integer(ctx, name, right);
		if (a === null || b === null) {
			return null;
		}
		return {'-eq': a === b, '-ne': a !== b, '-lt': a < b, '-le': a <= b, '-gt': a > b, '-ge': a >= b}[op];
	}

	switch (op) {
		case '=':
		case '==':
			return left === right;
		case '!=':
			return left !== right;
		case '<':
			return left < right;
		case '>':
			return left > right;
		case '-ef': {
			const a = sh.fs.lookup(normalize(ctx.state.cwd, left));
			const b = sh.fs.lookup(normalize(ctx.state.cwd, right));
			return !a.error && a.path === b.path;
		}
		default:
			// Everything was modified at the same moment, so nothing is newer or older.
			return false;
	}
};

const UNARY = new Set(['-a', '-b', '-c', '-d', '-e', '-f', '-g', '-h', '-k', '-n', '-p', '-r', '-s', '-t', '-u', '-v', '-w', '-x', '-z', '-G', '-L', '-N', '-O', '-S']);
const BINARY = new Set(['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef']);

class TestError extends Error {}

const test = (sh, ctx, name, args) => {
	let i = 0;
	const fail = message => {
		throw new TestError(message);
	};

	const primary = end => {
		const arg = args[i];
		if (arg === '(' && i + 1 < end) {
			i++;
			const value = or(end);
			if (args[i] !== ')') {
				fail(`\`)' expected, found ${args[i] ?? ']'}`);
			}
			i++;
			return value;
		} else if (UNARY.has(arg) && i + 1 < end && !BINARY.has(args[i + 1])) {
			i += 2;
			return fileTest(sh, ctx, arg, args[i - 1]);
		} else if (BINARY.has(args[i + 1]) && i + 2 < end) {
			i += 3;
			const result = binaryTest(sh, ctx, name, args[i - 2], arg, args[i - 1]);
			if (result === null) {
				throw new TestError(null);
			}
			return result;
		} else if (UNARY.has(arg) && i + 1 === end - 1 && end - i === 2) {
			fail(`${args[i + 1]}: unary operator expected`);
		}

		i++;
		return arg !== '';
	};
	const not = end => {
		if (args[i] === '!' && i + 1 < end) {
			i++;
			return !not(end);
		}
		return primary(end);
	};
	const and = end => {
		let value = not(end);
		while (args[i] === '-a' && i + 1 < end) {
			i++;
			value = not(end) && value;
		}
		return value;
	};
	const or = end => {
		let value = and(end);
		while (args[i] === '-o' && i + 1 < end) {
			i++;
			value = and(end) || value;
		}
		return value;
	};

	if (args.length === 0) {
		return 1;
	}

	try {
		const result = or(args.length);
		if (i < args.length) {
			fail(args.length - i === 1 || !BINARY.has(args[i]) ? 'too many arguments' : `${args[i]}: binary operator expected`);
		}
		return result ? 0 : 1;
	} catch (e) {
		if (!(e instanceof TestError)) {
			throw e;
		} else if (e.message !== 'null') {
			error(ctx, `bash: ${name}: ${e.message}`);
		}
		return 2;
	}
};

// --- printf ---

const printfNumber = (ctx, value) => {
	if (/^['"]/.test(value)) {
		return BigInt(value.codePointAt(1) ?? 0);
	} else if (/^\s*[-+]?(0[xX][0-9a-fA-F]+|0[0-7]*|\d+)\s*$/.test(value)) {
		const text = value.trim();
		const negative = text.startsWith('-');
		const digits = text.replace(/^[-+]/, '');
		const parsed = /^0[0-7]+$/.test(digits) ? BigInt(`0o${digits.slice(1)}`) : BigInt(digits);
		return negative ? -parsed : parsed;
	} else if (value === '') {
		return 0n;
	}

	error(ctx, `bash: printf: ${value}: invalid number`);
	ctx.printfFailed = true;
	return BigInt(parseInt(value, 10) || 0);
};

const pad = (text, flags, width) => {
	if (!width || text.length >= width) {
		return text;
	} else if (flags.includes('-')) {
		return text.padEnd(width);
	} else if (flags.includes('0') && /^[-+]?\d/.test(text)) {
		const sign = /^[-+]/.test(text) ? text[0] : '';
		return sign + text.slice(sign.length).padStart(width - sign.length, '0');
	}

	return text.padStart(width);
};

const printf = (ctx, format, args) => {
	let output = '';
	let index = 0;
	let consumed;
	let stopped = false;
	do {
		consumed = false;
		output += format.replace(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXfFeEgGcsbq%])|\\(?:x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/gs, (match, flags = '', width, precision, conversion) => {
			if (stopped) {
				return '';
			} else if (match[0] === '\\') {
				const escaped = unescape(match, false);
				stopped = escaped.stopped;
				return escaped.text;
			} else if (conversion === '%') {
				return '%';
			}

			const next = () => {
				consumed = true;
				return args[index++] ?? '';
			};
			const w = width === '*' ? Number(next()) : Number(width ?? 0);
			const p = precision === '*' ? Number(next()) : precision === undefined ? undefined : Number(precision || 0);
			const value = next();

			switch (conversion) {
				case 's':
					return pad(p === undefined ? value : value.slice(0, p), flags, w);
				case 'b': {
					const escaped = unescape(value, true);
					stopped = escaped.stopped;
					return pad(escaped.text, flags, w);
				}
				case 'q':
					return pad(shellQuote(value), flags, w);
				case 'c':
					return pad(value.charAt(0), flags, w);
				case 'd':
				case 'i': {
					const n = printfNumber(ctx, value);
					const sign = n >= 0n && flags.includes('+') ? '+' : n >= 0n && flags.includes(' ') ? ' ' : '';
					return pad(sign + String(n), flags, w);
				}
				case 'o':
				case 'u':
				case 'x':
				case 'X': {
					let n = printfNumber(ctx, value);
					n = n < 0n ? BigInt.asUintN(64, n) : n;
					const text = n.toString({o: 8, u: 10, x: 16, X: 16}[conversion]);
					const prefix = flags.includes('#') && n !== 0n ? {o: '0', x: '0x', X: '0X'}[conversion] ?? '' : '';
					return pad(prefix + (conversion === 'X' ? text.toUpperCase() : text), flags, w);
				}
				default: {
					const n = Number(value === '' ? 0 : value);
					if (Number.isNaN(n)) {
						error(ctx, `bash: printf: ${value}: invalid number`);
						ctx.printfFailed = true;
					}
					const number = Number.isNaN(n) ? 0 : n;
					const digits = p ?? 6;
					let text;
					if (conversion === 'f' || conversion === 'F') {
						text = number.toFixed(digits);
					} else if (conversion === 'e' || conversion === 'E') {
						text = number.toExponential(digits).replace(/e([-+])(\d)$/, 'e$10$2');
					} else {
						text = String(Number(number.toPrecision(digits || 1)));
					}
					text = /[EG]/.test(conversion) ? text.toUpperCase() : text;
					return pad((number >= 0 && flags.includes('+') ? '+' : '') + text, flags, w);
				}
			}
		});
	} while (consumed && index < args.length && !stopped);

	return output;
};

// --- help ---

const HELP = {
	':': [':', 'Null command.'],
	'.': ['. filename [arguments]', 'Execute commands from a file in the current shell.'],
	'[': ['[ arg... ]', 'Evaluate conditional expression.'],
	'[[': ['[[ expression ]]', 'Execute conditional command.'],
	'((': ['(( expression ))', 'Evaluate arithmetic expression.'],
	alias: ['alias [-p] [name[=value] ... ]', 'Define or display aliases.'],
	break: ['break [n]', 'Exit for, while, or until loops.'],
	case: ['case WORD in [PATTERN [| PATTERN]...) COMMANDS ;;]... esac', 'Execute commands based on pattern matching.'],
	cd: ['cd [-L|[-P [-e]] [-@]] [dir]', 'Change the shell working directory.'],
	command: ['command [-pVv] command [arg ...]', 'Execute a simple command or display information about commands.'],
	continue: ['continue [n]', 'Resume for, while, or until loops.'],
	echo: ['echo [-neE] [arg ...]', 'Write arguments to the standard output.'],
	eval: ['eval [arg ...]', 'Execute arguments as a shell command.'],
	exit: ['exit [n]', 'Exit the shell.'],
	export: ['export [-fn] [name[=value] ...] or export -p', 'Set export attribute for shell variables.'],
	false: ['false', 'Return an unsuccessful result.'],
	fg: ['fg [job_spec]', 'Move job to the foreground.'],
	for: ['for NAME [in WORDS ... ] ; do COMMANDS; done', 'Execute commands for each member in a list.'],
	function: ['function name { COMMANDS ; } or name () { COMMANDS ; }', 'Define shell function.'],
	help: ['help [-dms] [pattern ...]', 'Display information about builtin commands.'],
	history: ['history [-c] [-d offset] [n] or history -anrw [filename] or history -ps arg [arg...]', 'Display or manipulate the history list.'],
	if: ['if COMMANDS; then COMMANDS; [ elif COMMANDS; then COMMANDS; ]... [ else COMMANDS; ] fi', 'Execute commands based on conditional.'],
	jobs: ['jobs [-lnprs] [jobspec ...] or jobs -x command [args]', 'Display status of jobs.'],
	kill: ['kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 'Send a signal to a job.'],
	let: ['let arg [arg ...]', 'Evaluate arithmetic expressions.'],
	local: ['local [option] name[=value] ...', 'Define local variables.'],
	printf: ['printf [-v var] format [arguments]', 'Formats and prints ARGUMENTS under control of the FORMAT.'],
	pwd: ['pwd [-LP]', 'Print the name of the current working directory.'],
	read: ['read [-ers] [-a array] [-d delim] [-i text] [-n nchars] [-N nchars] [-p prompt] [-t timeout] [-u fd] [name ...]', 'Read a line from the standard input and split it into fields.'],
	return: ['return [n]', 'Return from a shell function.'],
	set: ['set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]', 'Set or unset values of shell options and positional parameters.'],
	shift: ['shift [n]', 'Shift positional parameters.'],
	source: ['source filename [arguments]', 'Execute commands from a file in the current shell.'],
	test: ['test [expr]', 'Evaluate conditional expression.'],
	true: ['true', 'Return a successful result.'],
	type: ['type [-afptP] name [name ...]', 'Display information about command type.'],
	unalias: ['unalias [-a] name [name ...]', 'Remove each NAME from the list of defined aliases.'],
	unset: ['unset [-f] [-v] [-n] [name ...]', 'Unset values and attributes of shell variables and functions.'],
	until: ['until COMMANDS; do COMMANDS; done', 'Execute commands as long as a test does not succeed.'],
	wait: ['wait [-fn] [-p var] [id ...]', 'Wait for job completion and return exit status.'],
	while: ['while COMMANDS; do COMMANDS; done', 'Execute commands as long as a test succeeds.'],
	'{': ['{ COMMANDS ; }', 'Group commands as a unit.'],
};

const helpIndex = version => {
	const names = Object.keys(HELP);
	const cell = name => {
		const synopsis = HELP[name][0];
		return synopsis.length > 36 ? `${synopsis.slice(0, 35)}>` : synopsis.padEnd(36);
	};
	const rows = Math.ceil(names.length / 2);
	const lines = Array.from({length: rows}, (_, i) => ` ${cell(names[i])}    ${names[i + rows] ? cell(names[i + rows]) : ''}`.trimEnd());

	return [
		`GNU bash, version ${version} (riscv64-redhat-linux-gnu)`,
		"These shell commands are defined internally.  Type `help' to see this list.",
		"Type `help name' to find out more about the function `name'.",
		"Use `info bash' to find out more about the shell in general.",
		"Use `man -k' or `info' to find out more about commands not in this list.",
		'',
		'A star (*) next to a name means that the command is disabled.',
		'',
		...lines,
		'',
	].join('\n');
};

// --- Jobs ---

const findJob = (sh, spec) => {
	if (spec === undefined || spec === '%%' || spec === '%+' || spec === '%') {
		return sh.jobs[sh.jobs.length - 1];
	} else if (spec === '%-') {
		return sh.jobs[sh.jobs.length - 2];
	} else if (/^%\d+$/.test(spec)) {
		return sh.jobs.find(job => job.id === Number(spec.slice(1)));
	} else if (spec.startsWith('%')) {
		return sh.jobs.find(job => job.text.startsWith(spec.slice(1)));
	}

	return sh.jobs.find(job => job.pid === Number(spec));
};

const readFile = (sh, ctx, name, file) => {
	const result = sh.fs.read(normalize(ctx.state.cwd, file));
	if (result.error) {
		error(ctx, `bash: ${file}: ${result.error}`);
		return null;
	}

	return result.text;
};

// Runs `source` text in the current shell: for eval and `.`.
const runText = async (sh, ctx, label, source) => {
	let program;
	try {
		program = parse(source);
	} catch (e) {
		if (!(e instanceof ParseError)) {
			throw e;
		}
		error(ctx, `bash: ${label}line 1: ${e.message}`);
		return 2;
	}

	return sh.run(program, ctx);
};

export const BUILTINS = {
	':': () => 0,
	true: () => 0,
	false: () => 1,

	echo: (sh, ctx, args) => {
		let newline = true;
		let escapes = false;
		let i = 0;
		for (; i < args.length && /^-[neE]+$/.test(args[i]); i++) {
			for (const flag of args[i].slice(1)) {
				if (flag === 'n') {
					newline = false;
				} else {
					escapes = flag === 'e';
				}
			}
		}

		let text = args.slice(i).join(' ');
		if (escapes) {
			const result = unescape(text, true);
			text = result.text;
			newline &&= !result.stopped;
		}
		write(ctx, 1, newline ? `${text}\n` : text);
		return 0;
	},

	printf: (sh, ctx, args) => {
		let variable = null;
		let rest = args;
		if (rest[0] === '-v') {
			variable = rest[1];
			rest = rest.slice(2);
		}
		if (rest[0] === '--') {
			rest = rest.slice(1);
		}
		if (rest.length === 0) {
			error(ctx, 'printf: usage: printf [-v var] format [arguments]');
			return 2;
		}

		ctx.printfFailed = false;
		const text = printf(ctx, rest[0], rest.slice(1));
		if (variable) {
			sh.setVar(ctx.state, variable, text);
		} else {
			write(ctx, 1, text);
		}
		return ctx.printfFailed ? 1 : 0;
	},

	cd: (sh, ctx, args) => {
		const operands = args.filter(arg => !/^-[LPe@]+$/.test(arg));
		if (operands.length > 1) {
			error(ctx, 'bash: cd: too many arguments');
			return 1;
		}

		let target = operands[0] ?? sh.getVar(ctx.state, 'HOME');
		const back = target === '-';
		if (back) {
			target = sh.getVar(ctx.state, 'OLDPWD');
		}
		if (target === undefined) {
			error(ctx, `bash: cd: ${back ? 'OLDPWD' : 'HOME'} not set`);
			return 1;
		} else if (target === '') {
			return 0;
		}

		const path = normalize(ctx.state.cwd, target);
		const found = sh.fs.lookup(path);
		const problem = found.error ?? (found.entry.type === 'dir' ? sh.fs.access(path, 0o1) : 'Not a directory');
		if (problem) {
			error(ctx, `bash: cd: ${target}: ${problem}`);
			return 1;
		}

		sh.setVar(ctx.state, 'OLDPWD', ctx.state.cwd);
		ctx.state.cwd = path;
		sh.setVar(ctx.state, 'PWD', path);
		if (back) {
			write(ctx, 1, `${path}\n`);
		}
		if (!ctx.subshell) {
			sh.onCwd(displayPath(path));
		}
		return 0;
	},

	pwd: (sh, ctx, args) => {
		const physical = args.includes('-P');
		write(ctx, 1, `${physical ? sh.fs.lookup(ctx.state.cwd).path : ctx.state.cwd}\n`);
		return 0;
	},

	test: (sh, ctx, args) => test(sh, ctx, 'test', args),

	'[': (sh, ctx, args) => {
		if (args[args.length - 1] !== ']') {
			error(ctx, "bash: [: missing `]'");
			return 2;
		}
		return test(sh, ctx, '[', args.slice(0, -1));
	},

	read: async (sh, ctx, args) => {
		let raw = false;
		let prompt = null;
		let array = null;
		const names = [];
		for (let i = 0; i < args.length; i++) {
			const flags = args[i].match(/^-([rsape]+)$/);
			if (!flags || names.length) {
				names.push(args[i]);
				continue;
			}
			for (const flag of flags[1]) {
				if (flag === 'r') {
					raw = true;
				} else if (flag === 'p') {
					prompt = args[++i] ?? '';
				} else if (flag === 'a') {
					array = args[++i];
				}
			}
		}

		const invalid = [...names, ...(array ? [array] : [])].find(name => !isName(name));
		if (invalid) {
			error(ctx, `bash: read: \`${invalid}': not a valid identifier`);
			return 1;
		} else if (prompt !== null && ctx.io[0].isTTY) {
			write(ctx, 2, prompt);
		}

		let line = '';
		let complete = true;
		for (;;) {
			const result = await ctx.io[0].readLine(ctx.abort);
			if (result === null) {
				complete = false;
				break;
			}
			complete = result.complete;
			if (!raw && result.line.endsWith('\\') && result.complete) {
				line += result.line.slice(0, -1);
				continue;
			}
			line += result.line;
			break;
		}
		if (!raw) {
			line = line.replace(/\\(.)/g, '$1');
		}

		const ifs = sh.getVar(ctx.state, 'IFS') ?? ' \t\n';
		const charClass = chars => `[${chars.replace(/[\\\]^-]/g, '\\$&')}]`;
		const white = [...ifs].filter(c => /\s/.test(c)).join('');
		const trimmed = white ? line.replace(new RegExp(`^${charClass(white)}+|${charClass(white)}+$`, 'g'), '') : line;
		const separator = ifs ? new RegExp(`${charClass(ifs)}+`) : null;

		if (array) {
			sh.setVar(ctx.state, array, trimmed === '' ? [] : separator ? trimmed.split(separator) : [trimmed]);
		} else if (names.length === 0) {
			sh.setVar(ctx.state, 'REPLY', line);
		} else {
			// Each name takes a field; the last one takes whatever is left.
			let rest = trimmed;
			names.forEach((name, i) => {
				const match = i < names.length - 1 && separator ? separator.exec(rest) : null;
				sh.setVar(ctx.state, name, match ? rest.slice(0, match.index) : rest);
				rest = match ? rest.slice(match.index + match[0].length) : '';
			});
		}

		return complete ? 0 : 1;
	},

	export: (sh, ctx, args) => {
		const operands = args.filter(arg => arg !== '-n');
		if (operands.length === 0 || operands[0] === '-p') {
			for (const [name, entry] of sh.variables(ctx.state)) {
				if (entry.exported) {
					write(ctx, 1, `declare -x ${name}="${String(entry.value).replace(/["\\$`]/g, '\\$&')}"\n`);
				}
			}
			return 0;
		}

		let status = 0;
		for (const arg of operands) {
			const match = arg.match(/^([A-Za-z_]\w*)(?:=(.*))?$/s);
			if (!match) {
				error(ctx, `bash: export: \`${arg}': not a valid identifier`);
				status = 1;
				continue;
			} else if (match[2] !== undefined) {
				sh.setVar(ctx.state, match[1], match[2]);
			}
			sh.markExported(ctx.state, match[1], !args.includes('-n'));
		}
		return status;
	},

	local: (sh, ctx, args) => {
		if (ctx.depth === 0) {
			error(ctx, 'bash: local: can only be used in a function');
			return 1;
		}

		let status = 0;
		for (const arg of args) {
			const match = arg.match(/^([A-Za-z_]\w*)(?:=(.*))?$/s);
			if (!match) {
				error(ctx, `bash: local: \`${arg}': not a valid identifier`);
				status = 1;
				continue;
			}
			sh.setLocal(ctx.state, match[1], match[2] ?? '');
		}
		return status;
	},

	unset: (sh, ctx, args) => {
		const functions = args.includes('-f');
		let status = 0;
		for (const name of args.filter(arg => !/^-[fvn]$/.test(arg))) {
			if (functions) {
				ctx.state.functions.delete(name);
			} else if (!isName(name)) {
				error(ctx, `bash: unset: \`${name}': not a valid identifier`);
				status = 1;
			} else {
				sh.unsetVar(ctx.state, name);
			}
		}
		return status;
	},

	set: (sh, ctx, args) => {
		if (args.length === 0) {
			for (const [name, entry] of sh.variables(ctx.state)) {
				const value = Array.isArray(entry.value)
					? `(${Object.entries(entry.value).map(([i, v]) => `[${i}]=${shellQuote(v)}`).join(' ')})`
					: shellQuote(entry.value);
				write(ctx, 1, `${name}=${value}\n`);
			}
			return 0;
		}

		const dashes = args.indexOf('--');
		const operands = dashes >= 0 ? args.slice(dashes + 1) : args.filter(arg => !/^[-+][a-zA-Z]+$/.test(arg) && arg !== '-o' && arg !== '+o');
		if (dashes >= 0 || operands.length) {
			ctx.state.positional = operands;
		}
		return 0;
	},

	shift: (sh, ctx, args) => {
		const count = Number(args[0] ?? 1);
		if (!Number.isInteger(count) || count < 0) {
			error(ctx, `bash: shift: ${args[0]}: numeric argument required`);
			return 1;
		} else if (count > ctx.state.positional.length) {
			return 1;
		}
		ctx.state.positional = ctx.state.positional.slice(count);
		return 0;
	},

	return: (sh, ctx, args) => {
		if (ctx.depth === 0 && !ctx.sourcing) {
			error(ctx, "bash: return: can only `return' from a function or sourced script");
			return 1;
		}
		throw new Return(args[0] === undefined ? ctx.state.status : Number(args[0]) & 255);
	},

	break: (sh, ctx, args) => {
		if (ctx.loops === 0) {
			error(ctx, "bash: break: only meaningful in a `for', `while', or `until' loop");
			return 0;
		}
		throw new Break(Math.min(Number(args[0] ?? 1) || 1, ctx.loops));
	},

	continue: (sh, ctx, args) => {
		if (ctx.loops === 0) {
			error(ctx, "bash: continue: only meaningful in a `for', `while', or `until' loop");
			return 0;
		}
		throw new Continue(Math.min(Number(args[0] ?? 1) || 1, ctx.loops));
	},

	exit: (sh, ctx, args) => {
		const value = args[0];
		if (value !== undefined && !/^[-+]?\d+$/.test(value)) {
			error(ctx, `bash: exit: ${value}: numeric argument required`);
			throw new Exit(2);
		}
		throw new Exit(value === undefined ? ctx.state.status : Number(value) & 255);
	},

	eval: (sh, ctx, args) => (args.length ? runText(sh, ctx, 'eval: ', args.join(' ')) : 0),

	source: async (sh, ctx, args) => {
		if (args.length === 0) {
			error(ctx, 'bash: source: filename argument required\nsource: usage: source filename [arguments]');
			return 2;
		}

		const text = readFile(sh, ctx, 'source', args[0]);
		if (text === null) {
			return 1;
		}

		const saved = ctx.state.positional;
		if (args.length > 1) {
			ctx.state.positional = args.slice(1);
		}
		try {
			return await runText(sh, {...ctx, sourcing: true}, `${args[0]}: `, text);
		} catch (e) {
			if (e instanceof Return) {
				return e.status;
			}
			throw e;
		} finally {
			ctx.state.positional = saved;
		}
	},

	let: async (sh, ctx, args) => {
		if (args.length === 0) {
			error(ctx, 'bash: let: expression expected');
			return 1;
		}
		let value = 0n;
		for (const arg of args) {
			value = await sh.arith(arg, ctx);
		}
		return value === 0n ? 1 : 0;
	},

	alias: (sh, ctx, args) => {
		const {aliases} = ctx.state;
		const operands = args.filter(arg => arg !== '-p');
		const show = name => write(ctx, 1, `alias ${name}='${aliases.get(name).replace(/'/g, "'\\''")}'\n`);
		if (operands.length === 0) {
			[...aliases.keys()].sort().forEach(show);
			return 0;
		}

		let status = 0;
		for (const arg of operands) {
			const eq = arg.indexOf('=');
			if (eq > 0) {
				aliases.set(arg.slice(0, eq), arg.slice(eq + 1));
			} else if (aliases.has(arg)) {
				show(arg);
			} else {
				error(ctx, `bash: alias: ${arg}: not found`);
				status = 1;
			}
		}
		return status;
	},

	unalias: (sh, ctx, args) => {
		if (args.includes('-a')) {
			ctx.state.aliases.clear();
			return 0;
		} else if (args.length === 0) {
			error(ctx, 'unalias: usage: unalias [-a] name [name ...]');
			return 2;
		}

		let status = 0;
		for (const name of args) {
			if (!ctx.state.aliases.delete(name)) {
				error(ctx, `bash: unalias: ${name}: not found`);
				status = 1;
			}
		}
		return status;
	},

	type: (sh, ctx, args) => {
		const terse = args.includes('-t');
		const names = args.filter(arg => !/^-[afptP]+$/.test(arg));
		let status = 0;
		for (const name of names) {
			const {aliases, functions} = ctx.state;
			const say = (kind, text) => write(ctx, 1, `${terse ? kind : text}\n`);
			if (aliases.has(name)) {
				say('alias', `${name} is aliased to \`${aliases.get(name)}'`);
			} else if (KEYWORDS.has(name)) {
				say('keyword', `${name} is a shell keyword`);
			} else if (functions.has(name)) {
				say('function', `${name} is a function\n${functions.get(name).text}`);
			} else if (BUILTINS[name]) {
				say('builtin', `${name} is a shell builtin`);
			} else if (sh.commandPath(name)) {
				say('file', `${name} is ${sh.commandPath(name)}`);
			} else {
				if (!terse) {
					error(ctx, `bash: type: ${name}: not found`);
				}
				status = 1;
			}
		}
		return status;
	},

	command: async (sh, ctx, args) => {
		if (args[0] === '-v' || args[0] === '-V') {
			let status = 0;
			for (const name of args.slice(1)) {
				const path = sh.commandPath(name);
				if (ctx.state.aliases.has(name)) {
					write(ctx, 1, `alias ${name}='${ctx.state.aliases.get(name)}'\n`);
				} else if (ctx.state.functions.has(name) || BUILTINS[name] || KEYWORDS.has(name)) {
					write(ctx, 1, `${name}\n`);
				} else if (path) {
					write(ctx, 1, `${path}\n`);
				} else {
					status = 1;
				}
			}
			return status;
		}

		return args.length ? sh.invoke(args, ctx, {functions: false}) : 0;
	},

	help: (sh, ctx, args) => {
		if (args.length === 0) {
			write(ctx, 1, helpIndex(sh.version));
			return 0;
		}

		let found = false;
		for (const pattern of args) {
			for (const name of Object.keys(HELP).filter(key => key === pattern || (pattern.length > 1 && key.startsWith(pattern)))) {
				found = true;
				write(ctx, 1, `${name}: ${HELP[name][0]}\n    ${HELP[name][1]}\n`);
			}
		}
		if (!found) {
			error(ctx, `bash: help: no help topics match \`${args[args.length - 1]}'.  Try \`help help' or \`man -k ${args[args.length - 1]}' or \`info ${args[args.length - 1]}'.`);
			return 1;
		}
		return 0;
	},

	history: (sh, ctx, args) => {
		if (args[0] === '-c') {
			sh.clearHistory();
			return 0;
		} else if (args[0] === '-d') {
			const offset = Number(args[1]);
			if (!Number.isInteger(offset) || offset < 1 || offset > sh.history.length) {
				error(ctx, `bash: history: ${args[1] ?? ''}: history position out of range`);
				return 1;
			}
			sh.deleteHistory(offset - 1);
			return 0;
		} else if (args[0] !== undefined && !/^\d+$/.test(args[0])) {
			error(ctx, `bash: history: ${args[0]}: numeric argument required`);
			return 1;
		}

		const count = args[0] === undefined ? sh.history.length : Number(args[0]);
		const start = Math.max(sh.history.length - count, 0);
		write(ctx, 1, sh.history.slice(start).map((line, i) => `${String(start + i + 1).padStart(5)}  ${line}\n`).join(''));
		return 0;
	},

	jobs: (sh, ctx, args) => {
		const pids = args.includes('-p');
		const long = args.includes('-l');
		sh.jobs.forEach((job, i) => {
			const marker = i === sh.jobs.length - 1 ? '+' : i === sh.jobs.length - 2 ? '-' : ' ';
			write(ctx, 1, pids ? `${job.pid}\n` : `${sh.jobLine(job, marker, long)}\n`);
		});
		return 0;
	},

	fg: async (sh, ctx, args) => {
		const job = findJob(sh, args[0]);
		if (!job) {
			error(ctx, `bash: fg: ${args[0] ?? 'current'}: no such job`);
			return 1;
		}

		write(ctx, 1, `${job.text}\n`);
		const off = ctx.abort.on(reason => job.abort.abort(reason));
		try {
			const result = await job.promise;
			sh.forgetJob(job);
			return result.status;
		} finally {
			off();
		}
	},

	wait: async (sh, ctx, args) => {
		const jobs = args.length ? args.map(spec => findJob(sh, spec)) : [...sh.jobs];
		let status = 0;
		for (const job of jobs) {
			if (!job) {
				status = 127;
				continue;
			}
			status = (await ctx.abort.race(job.promise)).status;
			sh.forgetJob(job);
		}
		return status;
	},

	kill: (sh, ctx, args) => {
		if (args[0] === '-l' || args[0] === '-L') {
			if (args[1] !== undefined) {
				const signal = /^\d+$/.test(args[1]) ? SIGNALS[(Number(args[1]) & 127) - 1] : parseSignal(args[1]) && String(SIGNALS.indexOf(parseSignal(args[1])) + 1);
				if (!signal) {
					error(ctx, `bash: kill: ${args[1]}: invalid signal specification`);
					return 1;
				}
				write(ctx, 1, `${signal}\n`);
				return 0;
			}
			const cells = SIGNALS.map((name, i) => `${String(i + 1).padStart(2)}) SIG${name}`);
			const rows = [];
			for (let i = 0; i < cells.length; i += 5) {
				rows.push(cells.slice(i, i + 5).join('\t'));
			}
			write(ctx, 1, `${rows.join('\n')}\n`);
			return 0;
		}

		let signal = 'TERM';
		let rest = args;
		if (rest[0] === '-s' || rest[0] === '-n') {
			signal = parseSignal(rest[1] ?? '');
			if (!signal) {
				error(ctx, `bash: kill: ${rest[1] ?? ''}: invalid signal specification`);
				return 1;
			}
			rest = rest.slice(2);
		} else if (/^-./.test(rest[0] ?? '') && rest[0] !== '--') {
			signal = parseSignal(rest[0]);
			if (!signal) {
				error(ctx, `bash: kill: ${rest[0].slice(1)}: invalid signal specification`);
				return 1;
			}
			rest = rest.slice(1);
		}
		if (rest[0] === '--') {
			rest = rest.slice(1);
		}
		if (rest.length === 0) {
			error(ctx, 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
			return 2;
		}

		let status = 0;
		for (const target of rest) {
			let pid;
			if (target.startsWith('%')) {
				const job = findJob(sh, target);
				if (!job) {
					error(ctx, `bash: kill: ${target}: no such job`);
					status = 1;
					continue;
				}
				({pid} = job);
			} else if (/^-?\d+$/.test(target)) {
				pid = Number(target);
			} else {
				error(ctx, `bash: kill: ${target}: arguments must be process or job IDs`);
				status = 1;
				continue;
			}

			const result = sh.kill(pid, signal);
			if (result !== 'ok') {
				error(ctx, `bash: kill: (${pid}) - ${result === 'denied' ? 'Operation not permitted' : 'No such process'}`);
				status = 1;
			}
		}
		return status;
	},
};

BUILTINS['.'] = BUILTINS.source;

