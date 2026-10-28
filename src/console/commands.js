import {FILES} from './files';
import {OS_RELEASE, MTIME, modeString, sizeOf, nameOf, parentOf} from './fs';
import {ansi, options, colour, readOperand, splitLines, strftime, shortDate, humanSize, columns, plural} from './util';
import {PROGRAMS} from './programs';
import {POWER} from './power';
import {PACKAGE_COMMANDS, PACKAGED as PACKAGE_OF} from './dnf';
import {kubectl} from './kubectl';

export const PACKAGED = PACKAGE_OF;

const USERS = ['root', 'bin', 'robin'];
const KERNEL_BUILD = '#1 SMP PREEMPT_DYNAMIC Fri Mar 13 13:37:00 UTC 2026';

const join = (dir, name) => (dir.endsWith('/') ? dir + name : `${dir}/${name}`);
const lookup = (api, path) => api.fs.lookup(api.resolve(path), {follow: false});
const onDevice = path => path === '/dev' || path.startsWith('/dev/');

const usage = (api, message) => {
	api.err(`${api.name}: ${message}\nTry '${api.name} --help' for more information.\n`);
	return 1;
};

// Numbered lines for `cat -n`, the count carrying on across files.
const numberer = () => {
	let n = 0;
	return text => text.replace(/^(.*)(\n|$)/gm, (match, line, newline) => (match === '' ? '' : `${String(++n).padStart(6)}\t${line}${newline}`));
};

const ls = async api => {
	const opts = options(api, api.args, {
		flags: 'aAlh1dRrtSFC',
		long: {all: 'a', 'almost-all': 'A', 'human-readable': 'h', directory: 'd', recursive: 'R', reverse: 'r', classify: 'F', color: 'color'},
	});
	if (!opts) {
		return 2;
	}

	const painted = colour(opts, api);
	const long = opts.has('l');
	const oneColumn = opts.has('1') || (!api.stdout.isTTY && !opts.has('C'));
	let status = 0;

	const paint = (name, entry) => {
		let code = null;
		if (entry.type === 'dir') {
			code = entry.mode & 0o1000 && entry.mode & 0o002 ? '30;42' : '01;34';
		} else if (entry.type === 'link') {
			code = '01;36';
		} else if (entry.type === 'char') {
			code = '40;33;01';
		} else if (entry.mode & 0o111) {
			code = '01;32';
		}

		return painted && code ? ansi(code, name) : name;
	};
	const classify = entry => {
		if (!opts.has('F')) {
			return '';
		}
		return {dir: '/', link: '@'}[entry.type] ?? (entry.type === 'file' && entry.mode & 0o111 ? '*' : '');
	};
	const sorted = items => {
		const result = [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		if (opts.has('S')) {
			result.sort((a, b) => sizeOf(b.entry) - sizeOf(a.entry));
		}
		return opts.has('r') ? result.reverse() : result;
	};
	const links = (path, entry) => (entry.type === 'dir'
		? 2 + (api.fs.list(path).names ?? []).filter(name => api.fs.lookup(join(path, name), {follow: false}).entry?.type === 'dir').length
		: 1);

	const longListing = items => {
		const rows = items.map(item => {
			const {entry} = item;
			return {
				mode: `${modeString(entry)}.`,
				links: String(links(item.path, entry)),
				owner: entry.owner,
				size: entry.type === 'char' ? '1, 3' : opts.has('h') ? humanSize(sizeOf(entry)) : String(sizeOf(entry)),
				name: paint(item.name, entry) + (entry.type === 'link' ? ` -> ${entry.target}` : classify(entry)),
			};
		});
		const width = key => Math.max(...rows.map(row => row[key].length));
		return rows.map(row => [
			row.mode, row.links.padStart(width('links')), row.owner.padEnd(width('owner')), row.owner.padEnd(width('owner')),
			row.size.padStart(width('size')), shortDate(MTIME), row.name,
		].join(' ')).map(line => `${line}\n`).join('');
	};
	const shortListing = items => {
		const names = items.map(item => item.name + classify(item.entry));
		if (oneColumn) {
			return names.map((name, i) => `${paint(name, items[i].entry)}\n`).join('');
		}
		return columns(names, api.tty?.columns?.() ?? 80, (name, i) => paint(name, items[i].entry));
	};
	const listing = items => (long ? longListing(items) : shortListing(items));

	const directory = (path, label, header) => {
		const result = api.fs.list(path);
		if (result.error) {
			api.err(`ls: cannot open directory '${label}': ${result.error}\n`);
			status = 2;
			return [];
		}

		let names = result.names;
		if (opts.has('a')) {
			names = ['.', '..', ...names];
		} else if (!opts.has('A')) {
			names = names.filter(name => !name.startsWith('.'));
		}
		const items = sorted(names.map(name => {
			const full = name === '.' ? path : name === '..' ? parentOf(path) : join(path, name);
			return {name, path: full, entry: api.fs.lookup(full, {follow: false}).entry};
		}));

		if (header) {
			api.out(`${label}:\n`);
		}
		if (long) {
			const blocks = items.reduce((sum, item) => sum + (item.entry.type === 'dir' || (item.entry.type === 'file' && sizeOf(item.entry)) ? 4 : 0), 0);
			api.out(`total ${opts.has('h') ? humanSize(blocks * 1024) : blocks}\n`);
		}
		api.out(listing(items));

		return items.filter(item => item.entry.type === 'dir' && item.name !== '.' && item.name !== '..');
	};

	const operands = opts.operands.length ? opts.operands : ['.'];
	const files = [];
	const dirs = [];
	for (const operand of operands) {
		const path = api.resolve(operand);
		const found = api.fs.lookup(path, {follow: !long || operand.endsWith('/')});
		if (found.error) {
			api.err(`ls: cannot access '${operand}': ${found.error}\n`);
			status = 2;
		} else if (found.entry.type === 'dir' && !opts.has('d')) {
			dirs.push({operand, path});
		} else {
			files.push({name: operand, path, entry: found.entry});
		}
	}

	if (files.length) {
		api.out(listing(sorted(files)));
	}
	const headers = operands.length > 1 || opts.has('R');
	const walk = async (path, label, first) => {
		if (!first) {
			api.out('\n');
		}
		const subdirectories = directory(path, label, headers);
		if (opts.has('R')) {
			for (const sub of subdirectories) {
				await walk(sub.path, join(label, sub.name), false);
			}
		}
	};
	for (const [i, {operand, path}] of dirs.entries()) {
		await walk(path, operand, i === 0 && files.length === 0);
	}

	return status;
};

const tree = api => {
	const opts = options(api, api.args, {flags: 'adCn', values: 'L'});
	if (!opts) {
		return 2;
	}

	const painted = (api.stdout.isTTY || opts.has('C')) && !opts.has('n');
	const depthLimit = opts.has('L') ? Number(opts.get('L')) : Infinity;
	let directories = 0;
	let files = 0;
	const paint = (name, entry) => {
		if (!painted) {
			return name;
		}
		return entry.type === 'dir' ? ansi('01;34', name) : entry.type === 'link' ? ansi('01;36', name) : name;
	};

	const lines = (path, prefix, depth) => {
		const result = api.fs.list(path);
		const names = (result.names ?? []).filter(name => opts.has('a') || !name.startsWith('.'));
		return names.flatMap((name, i) => {
			const full = join(path, name);
			const {entry} = api.fs.lookup(full, {follow: false});
			const target = entry.type === 'link' ? api.fs.lookup(full).entry : null;
			const isDir = entry.type === 'dir' || target?.type === 'dir';
			if (opts.has('d') && !isDir) {
				return [];
			}

			const last = i === names.length - 1;
			let line = `${prefix}${last ? '└── ' : '├── '}${paint(name, entry)}${target ? ` -> ${entry.target}` : ''}`;
			if (isDir) {
				directories++;
			} else {
				files++;
			}

			const children = [];
			if (entry.type === 'dir' && depth < depthLimit) {
				if (api.fs.list(full).error) {
					line += '  [error opening dir]';
				} else {
					children.push(...lines(full, prefix + (last ? '    ' : '│   '), depth + 1));
				}
			}
			return [line, ...children];
		});
	};

	let status = 0;
	for (const root of opts.operands.length ? opts.operands : ['.']) {
		const path = api.resolve(root);
		const found = api.fs.lookup(path);
		if (found.error || found.entry.type !== 'dir' || api.fs.list(path).error) {
			api.out(`${root}  [error opening dir]\n`);
			status = 2;
			continue;
		}
		api.out([paint(root, found.entry), ...lines(path, '', 1)].map(line => `${line}\n`).join(''));
	}
	api.out(`\n${directories} director${directories === 1 ? 'y' : 'ies'}${opts.has('d') ? '' : `, ${plural(files, 'file')}`}\n`);

	return status;
};

// cat, plus `head`/`tail`: files, or standard input for none or `-`.
const cat = async api => {
	const opts = options(api, api.args, {flags: 'nu', long: {number: 'n'}});
	if (!opts) {
		return 1;
	}

	const number = opts.has('n') ? numberer() : text => text;
	let status = 0;
	for (const operand of opts.operands.length ? opts.operands : ['-']) {
		if (operand === '-') {
			for (let line = await api.readLine(); line; line = await api.readLine()) {
				api.out(number(line.line + (line.complete ? '\n' : '')));
			}
			continue;
		}

		const result = api.fs.read(api.resolve(operand));
		if (result.error) {
			api.err(`cat: ${operand}: ${result.error}\n`);
			status = 1;
		} else {
			api.out(number(result.text));
		}
	}

	return status;
};

const headOrTail = head => async api => {
	const args = api.args.flatMap(arg => (/^-\d+$/.test(arg) ? ['-n', arg.slice(1)] : [arg]));
	const opts = options(api, args, {flags: head ? 'qv' : 'qvf', values: 'nc', long: {lines: 'n', bytes: 'c', quiet: 'q', verbose: 'v', follow: 'f'}});
	if (!opts) {
		return 1;
	}

	const bytes = opts.has('c');
	const spec = String(opts.get(bytes ? 'c' : 'n') ?? '10');
	if (!/^[-+]?\d+$/.test(spec)) {
		api.err(`${api.name}: invalid number of ${bytes ? 'bytes' : 'lines'}: '${spec}'\n`);
		return 1;
	}

	const count = Math.abs(Number(spec));
	const pick = text => {
		const units = bytes ? [...text] : text.split(/(?<=\n)/);
		if (head) {
			return (spec.startsWith('-') ? units.slice(0, Math.max(units.length - count, 0)) : units.slice(0, count)).join('');
		}
		return (spec.startsWith('+') ? units.slice(Math.max(count - 1, 0)) : units.slice(Math.max(units.length - count, 0))).join('');
	};

	const operands = opts.operands.length ? opts.operands : ['-'];
	const headers = (operands.length > 1 && !opts.has('q')) || opts.has('v');
	let status = 0;
	for (const [i, operand] of operands.entries()) {
		if (headers) {
			api.out(`${i ? '\n' : ''}==> ${operand === '-' ? 'standard input' : operand} <==\n`);
		}

		// Reading a terminal line by line, head stops as soon as it has enough.
		if (operand === '-' && head && !bytes && !spec.startsWith('-')) {
			for (let n = 0; n < count; n++) {
				const line = await api.readLine();
				if (!line) {
					break;
				}
				api.out(line.line + (line.complete ? '\n' : ''));
			}
			continue;
		}

		const result = await readOperand(api, operand);
		if (result.error === 'Is a directory') {
			api.err(`${api.name}: error reading '${operand}': Is a directory\n`);
			status = 1;
		} else if (result.error) {
			api.err(`${api.name}: cannot open '${operand}' for reading: ${result.error}\n`);
			status = 1;
		} else {
			api.out(pick(result.text));
		}
	}

	if (!head && opts.has('f')) {
		await api.abort.race(new Promise(() => {}));
	}

	return status;
};

const BRE_SPECIAL = {'\\(': '(', '\\)': ')', '\\{': '{', '\\}': '}', '\\|': '|', '\\+': '+', '\\?': '?', '(': '\\(', ')': '\\)', '{': '\\{', '}': '\\}', '|': '\\|', '+': '\\+', '?': '\\?'};
const BRACKET_CLASSES = {alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9a-fA-F', blank: ' \\t'};

const grepRegex = (pattern, opts) => {
	let source;
	if (opts.has('F')) {
		source = pattern.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
	} else {
		source = pattern.replace(/\[:(\w+):\]/g, (match, name) => BRACKET_CLASSES[name] ?? match);
		if (!opts.has('E')) {
			source = source.replace(/\\[(){}|+?]|[(){}|+?]/g, match => BRE_SPECIAL[match]);
		}
	}
	if (opts.has('w')) {
		source = `(?<![\\w])(?:${source})(?![\\w])`;
	}
	if (opts.has('x')) {
		source = `^(?:${source})$`;
	}

	return new RegExp(source, `g${opts.has('i') ? 'i' : ''}`);
};

const grep = async api => {
	const opts = options(api, api.args, {
		flags: 'ivncloqsrRhHEFwx',
		values: 'e',
		long: {
			'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', 'files-with-matches': 'l', 'only-matching': 'o',
			quiet: 'q', silent: 'q', 'no-messages': 's', recursive: 'r', 'no-filename': 'h', 'with-filename': 'H', 'extended-regexp': 'E',
			'fixed-strings': 'F', 'word-regexp': 'w', 'line-regexp': 'x', regexp: 'e', color: 'color', colour: 'color',
		},
	});
	if (!opts) {
		return 2;
	}

	const operands = [...opts.operands];
	const pattern = opts.has('e') ? opts.get('e') : operands.shift();
	if (pattern === undefined) {
		api.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
		return 2;
	}

	let regex;
	try {
		regex = grepRegex(pattern, opts);
	} catch {
		api.err('grep: Invalid regular expression\n');
		return 2;
	}

	const recursive = opts.has('r') || opts.has('R');
	const painted = colour(opts, api);
	const paint = (code, text) => (painted ? `\x1b[${code}m\x1b[K${text}\x1b[m\x1b[K` : text);
	let status = 1;
	let errors = false;

	const inputs = [];
	const collect = (operand, path) => {
		const found = api.fs.lookup(path);
		if (found.error) {
			inputs.push({operand, error: found.error});
		} else if (found.entry.type === 'dir' && recursive) {
			const listing = api.fs.list(path);
			if (listing.error) {
				inputs.push({operand, error: listing.error});
			}
			for (const name of listing.names ?? []) {
				collect(join(operand, name), join(path, name));
			}
		} else {
			inputs.push({operand, path, dir: found.entry.type === 'dir'});
		}
	};
	if (operands.length === 0 && recursive) {
		collect('.', api.cwd);
		for (const input of inputs) {
			input.operand = input.operand.replace(/^\.\//, '');
		}
	} else {
		for (const operand of operands.length ? operands : ['-']) {
			if (operand === '-') {
				inputs.push({operand});
			} else {
				collect(operand, api.resolve(operand));
			}
		}
	}

	const named = !opts.has('h') && (opts.has('H') || inputs.length > 1 || recursive);
	for (const input of inputs) {
		if (input.error || input.dir) {
			if (!opts.has('s')) {
				api.err(`grep: ${input.operand}: ${input.error ?? 'Is a directory'}\n`);
			}
			errors = true;
			continue;
		}

		const result = input.path ? api.fs.read(input.path) : {text: await api.readAll()};
		if (result.error) {
			if (!opts.has('s')) {
				api.err(`grep: ${input.operand}: ${result.error}\n`);
			}
			errors = true;
			continue;
		}

		const label = input.operand === '-' ? '(standard input)' : input.operand;
		const prefix = number => (named ? paint(35, label) + paint(36, ':') : '') + (opts.has('n') ? paint(32, number) + paint(36, ':') : '');
		const {lines} = splitLines(result.text);
		let matches = 0;
		for (const [i, line] of lines.entries()) {
			regex.lastIndex = 0;
			const found = regex.test(line);
			if (found === opts.has('v')) {
				continue;
			}

			matches++;
			status = 0;
			if (opts.has('q')) {
				return 0;
			} else if (opts.has('c') || opts.has('l')) {
				continue;
			} else if (opts.has('o') && !opts.has('v')) {
				for (const match of line.matchAll(regex)) {
					if (match[0]) {
						api.out(`${prefix(i + 1)}${paint('01;31', match[0])}\n`);
					}
				}
			} else {
				const text = painted && !opts.has('v') ? line.replace(regex, match => (match ? paint('01;31', match) : match)) : line;
				api.out(`${prefix(i + 1)}${text}\n`);
			}
		}

		if (opts.has('c')) {
			api.out(`${named ? paint(35, label) + paint(36, ':') : ''}${matches}\n`);
		} else if (opts.has('l') && matches) {
			api.out(`${paint(35, label)}\n`);
		}
	}

	return errors && (status !== 0 || !opts.has('q')) ? 2 : status;
};

const wc = async api => {
	const opts = options(api, api.args, {flags: 'lwcm', long: {lines: 'l', words: 'w', bytes: 'c', chars: 'm'}});
	if (!opts) {
		return 1;
	}

	const chosen = ['l', 'w', 'm', 'c'].filter(flag => opts.has(flag));
	const counts = chosen.length ? chosen : ['l', 'w', 'c'];
	const operands = opts.operands.length ? opts.operands : ['-'];
	const rows = [];
	const total = {l: 0, w: 0, m: 0, c: 0};
	let status = 0;
	for (const operand of operands) {
		const result = await readOperand(api, operand);
		if (result.error) {
			api.err(`wc: ${operand}: ${result.error}\n`);
			status = 1;
			continue;
		}

		const {text} = result;
		const row = {
			name: operand === '-' && opts.operands.length === 0 ? '' : operand,
			l: (text.match(/\n/g) ?? []).length,
			w: text.split(/\s+/).filter(Boolean).length,
			m: [...text].length,
			c: new TextEncoder().encode(text).length,
		};
		rows.push(row);
		for (const key of Object.keys(total)) {
			total[key] += row[key];
		}
	}
	if (rows.length > 1) {
		rows.push({...total, name: 'total'});
	}

	// As GNU wc: no padding for a single count of a single file, wide for pipes.
	let width = String(total.c).length;
	if (counts.length === 1 && operands.length === 1) {
		width = 1;
	} else if (operands.includes('-')) {
		width = 7;
	}
	api.out(rows.map(row => `${[...counts.map(key => String(row[key]).padStart(width)), row.name].filter(Boolean).join(' ')}\n`).join(''));

	return status;
};

// cp, mv: everything checks out right up to the write.
const copyOrMove = move => api => {
	const opts = options(api, api.args, {flags: move ? 'fivnu' : 'rRafivnpu', long: {recursive: 'r', force: 'f', interactive: 'i', verbose: 'v'}});
	if (!opts) {
		return 1;
	}

	const {operands} = opts;
	if (operands.length === 0) {
		return usage(api, 'missing file operand');
	} else if (operands.length === 1) {
		return usage(api, `missing destination file operand after '${operands[0]}'`);
	}

	const destination = operands[operands.length - 1];
	const target = api.fs.lookup(api.resolve(destination));
	const intoDirectory = !target.error && target.entry.type === 'dir';
	if (operands.length > 2 && !intoDirectory) {
		api.err(`${api.name}: target '${destination}' is not a directory\n`);
		return 1;
	}

	let status = 1;
	for (const source of operands.slice(0, -1)) {
		const found = lookup(api, source);
		const to = intoDirectory ? join(destination, nameOf(api.resolve(source))) : destination;
		if (found.error) {
			api.err(`${api.name}: cannot stat '${source}': ${found.error}\n`);
		} else if (found.entry.type === 'dir' && !move && !opts.has('r') && !opts.has('R') && !opts.has('a')) {
			api.err(`cp: -r not specified; omitting directory '${source}'\n`);
		} else if (api.resolve(to) === found.path) {
			api.err(`${api.name}: '${source}' and '${to}' are the same file\n`);
		} else if (move) {
			api.err(`mv: cannot move '${source}' to '${to}': ${api.fs.writeError(api.resolve(to)) === 'Permission denied' ? 'Permission denied' : 'Read-only file system'}\n`);
		} else {
			const problem = api.fs.writeError(api.resolve(to)) ?? 'Read-only file system';
			const kind = found.entry.type === 'dir' ? 'directory' : 'regular file';
			api.err(`cp: cannot create ${kind} '${to}': ${problem}\n`);
		}
	}

	return status;
};

const rm = api => {
	const opts = options(api, api.args, {flags: 'rRfidv', long: {recursive: 'r', force: 'f', dir: 'd', verbose: 'v', 'no-preserve-root': 'P', 'preserve-root': 'p'}});
	if (!opts) {
		return 1;
	}

	const force = opts.has('f');
	const recursive = opts.has('r') || opts.has('R');
	if (opts.operands.length === 0) {
		return force ? 0 : usage(api, 'missing operand');
	}

	let status = 0;
	const fail = (path, reason) => {
		api.err(`rm: cannot remove '${path}': ${reason}\n`);
		status = 1;
	};
	const remove = (label, path) => {
		const found = api.fs.lookup(path, {follow: false});
		if (found.entry?.type === 'dir' && recursive) {
			const listing = api.fs.list(path);
			if (listing.error) {
				fail(label, listing.error);
				return;
			}
			for (const name of listing.names) {
				remove(join(label, name), join(path, name));
			}
		}
		fail(label, onDevice(path) ? 'Permission denied' : 'Read-only file system');
	};

	for (const operand of opts.operands) {
		const path = api.resolve(operand);
		const found = api.fs.lookup(path, {follow: false});
		if (recursive && path === '/' && !opts.has('P')) {
			api.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n");
			status = 1;
		} else if (/(^|\/)\.\.?\/?$/.test(operand)) {
			api.err(`rm: refusing to remove '.' or '..' directory: skipping '${operand}'\n`);
			status = 1;
		} else if (found.error) {
			if (!force || found.error !== 'No such file or directory') {
				fail(operand, found.error);
			}
		} else if (found.entry.type === 'dir' && !recursive && !opts.has('d')) {
			fail(operand, 'Is a directory');
		} else {
			remove(operand, path);
		}
	}

	return status;
};

const create = (verb, kind) => api => {
	const opts = options(api, api.args, {flags: 'pvacm', long: {parents: 'p', verbose: 'v'}});
	if (!opts) {
		return 1;
	} else if (opts.operands.length === 0) {
		return usage(api, 'missing operand');
	}

	let status = 0;
	for (const operand of opts.operands) {
		const path = api.resolve(operand);
		const found = api.fs.lookup(path);
		if (api.name === 'touch' && found.entry?.type === 'char') {
			continue;
		} else if (api.name === 'mkdir' && !found.error) {
			if (!opts.has('p')) {
				api.err(`mkdir: cannot create directory '${operand}': File exists\n`);
				status = 1;
			}
			continue;
		}

		const problem = found.error && found.error !== 'No such file or directory' ? found.error : api.fs.writeError(path);
		api.err(`${api.name}: ${verb} ${kind}'${operand}': ${problem ?? 'Read-only file system'}\n`);
		status = 1;
	}

	return status;
};

const rmdir = api => {
	if (api.args.length === 0) {
		return usage(api, 'missing operand');
	}

	for (const operand of api.args.filter(arg => !arg.startsWith('-'))) {
		const found = lookup(api, operand);
		let problem = 'Read-only file system';
		if (found.error) {
			problem = found.error;
		} else if (found.entry.type !== 'dir') {
			problem = 'Not a directory';
		}
		api.err(`rmdir: failed to remove '${operand}': ${problem}\n`);
	}

	return 1;
};

const change = (verb, validate) => api => {
	const opts = options(api, api.args.filter(arg => !/^-[rwxXst]+$/.test(arg) || api.name !== 'chmod'), {flags: 'Rvfch', long: {recursive: 'R', verbose: 'v'}});
	if (!opts) {
		return 1;
	}

	const [spec, ...files] = opts.operands;
	const dashedMode = api.name === 'chmod' ? api.args.find(arg => /^-[rwxXst]+$/.test(arg)) : undefined;
	const mode = spec === undefined ? dashedMode : spec;
	if (mode === undefined || (files.length === 0 && !dashedMode)) {
		return usage(api, mode === undefined ? 'missing operand' : `missing operand after '${mode}'`);
	}

	const invalid = validate(dashedMode ?? mode);
	if (invalid) {
		return usage(api, invalid);
	}

	for (const file of dashedMode ? opts.operands : files) {
		const path = api.resolve(file);
		const found = api.fs.lookup(path);
		if (found.error) {
			api.err(`${api.name}: cannot access '${file}': ${found.error}\n`);
		} else {
			api.err(`${api.name}: changing ${verb} of '${file}': ${onDevice(found.path) ? 'Operation not permitted' : 'Read-only file system'}\n`);
		}
	}

	return 1;
};

const chmod = change('permissions', mode => (
	/^[0-7]{1,4}$/.test(mode) || /^([ugoa]*[-+=]([rwxXst]*|[ugo]))(,[ugoa]*[-+=]([rwxXst]*|[ugo]))*$/.test(mode) ? null : `invalid mode: '${mode}'`
));

const chown = change('ownership', spec => {
	const [owner, group] = spec.split(/[:.]/);
	if (owner && !USERS.includes(owner)) {
		return `invalid user: '${spec}'`;
	} else if (group && !USERS.includes(group)) {
		return `invalid group: '${spec}'`;
	}
	return null;
});

const sleep = async api => {
	if (api.args.length === 0) {
		return usage(api, 'missing operand');
	}

	let seconds = 0;
	for (const arg of api.args) {
		const match = arg.match(/^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/);
		if (arg === 'inf' || arg === 'infinity') {
			seconds = Infinity;
		} else if (!match) {
			return usage(api, `invalid time interval '${arg}'`);
		} else {
			seconds += Number(match[1]) * {'': 1, s: 1, m: 60, h: 3600, d: 86400}[match[2]];
		}
	}

	for (let remaining = seconds * 1000; remaining > 0; remaining -= 2 ** 30) {
		await api.sleep(Math.min(remaining, 2 ** 30));
	}
	return 0;
};

const date = api => {
	const opts = options(api, api.args, {flags: 'uRI', values: 'ds', long: {utc: 'u', universal: 'u', 'rfc-email': 'R', 'iso-8601': 'I', date: 'd', set: 's'}});
	if (!opts) {
		return 1;
	}

	const formats = opts.operands.filter(operand => operand.startsWith('+'));
	const extra = opts.operands.find(operand => !operand.startsWith('+'));
	if (extra !== undefined) {
		api.err(`date: invalid date '${extra}'\n`);
		return 1;
	}

	let when = new Date();
	const text = opts.get('d') ?? opts.get('s');
	if (text !== undefined) {
		const relative = {now: 0, today: 0, yesterday: -1, tomorrow: 1}[text.trim().toLowerCase()];
		const epoch = text.match(/^@(-?\d+)$/);
		when = relative !== undefined ? new Date(Date.now() + relative * 86_400_000) : new Date(epoch ? Number(epoch[1]) * 1000 : Date.parse(text));
		if (Number.isNaN(when.getTime())) {
			api.err(`date: invalid date '${text}'\n`);
			return 1;
		}
	}

	let format = '%a %b %e %H:%M:%S %Z %Y';
	if (formats.length) {
		format = formats[0].slice(1);
	} else if (opts.has('R')) {
		format = '%a, %d %b %Y %H:%M:%S %z';
	} else if (opts.has('I')) {
		format = opts.get('I') === true || opts.get('I') === 'date' ? '%F' : '%FT%T%z';
	}

	let status = 0;
	if (opts.has('s')) {
		api.err('date: cannot set date: Operation not permitted\n');
		status = 1;
	}
	api.out(`${strftime(format, when, opts.has('u'))}\n`);

	return status;
};

const uname = api => {
	const opts = options(api, api.args, {flags: 'asnrvmpio', long: {all: 'a', 'kernel-name': 's', nodename: 'n', 'kernel-release': 'r', 'kernel-version': 'v', machine: 'm', processor: 'p', 'hardware-platform': 'i', 'operating-system': 'o'}});
	if (!opts) {
		return 1;
	}

	const all = opts.has('a');
	const fields = [
		['s', 'Linux'], ['n', 'robinj.be'], ['r', OS_RELEASE.kernel], ['v', KERNEL_BUILD], ['m', 'riscv64'],
		['p', all ? null : 'unknown'], ['i', all ? null : 'unknown'], ['o', 'GNU/Linux'],
	];
	const chosen = fields.filter(([flag, value]) => value !== null && (all || opts.has(flag)));
	api.out(`${(chosen.length ? chosen : [fields[0]]).map(([, value]) => value).join(' ')}\n`);

	return 0;
};

const lsbRelease = api => {
	const opts = options(api, api.args, {flags: 'vidrcash', long: {version: 'v', id: 'i', description: 'd', release: 'r', codename: 'c', all: 'a', short: 's', help: 'h'}});
	if (!opts) {
		return 1;
	}

	const all = opts.has('a');
	const rows = [
		['v', 'LSB Version', 'n/a'],
		['i', 'Distributor ID', OS_RELEASE.name.replace(/\s/g, '')],
		['d', 'Description', `${OS_RELEASE.name} ${OS_RELEASE.version} (${OS_RELEASE.edition})`],
		['r', 'Release', OS_RELEASE.version],
		['c', 'Codename', OS_RELEASE.codename.replace(/\s/g, '')],
	].filter(([flag]) => all || opts.has(flag));
	const shown = rows.length ? rows : [['v', 'LSB Version', 'n/a']];
	api.out(opts.has('s') ? `${shown.map(([, , value]) => value).join(' ')}\n` : shown.map(([, label, value]) => `${label}:\t${value}\n`).join(''));

	return 0;
};

const env = api => {
	let i = 0;
	let clear = false;
	const extra = new Map();
	for (; i < api.args.length; i++) {
		const arg = api.args[i];
		if (arg === '-i' || arg === '-' || arg === '--ignore-environment') {
			clear = true;
		} else if (/^[A-Za-z_]\w*=/.test(arg)) {
			extra.set(arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1));
		} else {
			break;
		}
	}

	if (i < api.args.length) {
		if (!api.shell.available(api.args[i]) && !['echo', 'true', 'false', 'pwd'].includes(api.args[i])) {
			api.err(`env: '${api.args[i]}': No such file or directory\n`);
			return 127;
		}
		return api.run(api.args.slice(i));
	}

	const variables = new Map([...(clear ? [] : api.env), ...extra]);
	if (!clear) {
		variables.set('_', '/usr/bin/env');
	}
	api.out([...variables].map(([name, value]) => `${name}=${value}\n`).join(''));

	return 0;
};

const seq = async api => {
	const opts = options(api, api.args, {flags: 'w', values: 'sf', long: {separator: 's', 'equal-width': 'w'}, numeric: true});
	if (!opts) {
		return 1;
	}

	const {operands} = opts;
	if (operands.length === 0) {
		return usage(api, 'missing operand');
	} else if (operands.length > 3) {
		return usage(api, `extra operand '${operands[3]}'`);
	}
	const invalid = operands.find(operand => !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(operand));
	if (invalid !== undefined) {
		return usage(api, `invalid floating point argument: '${invalid}'`);
	}

	const [first, step, last] = operands.length === 1 ? ['1', '1', operands[0]] : operands.length === 2 ? [operands[0], '1', operands[1]] : operands;
	if (Number(step) === 0) {
		return usage(api, `invalid Zero increment value: '${step}'`);
	}

	const decimals = Math.max(...[first, step].map(n => (n.split('.')[1] ?? '').length));
	const width = opts.has('w') ? Math.max(Number(first).toFixed(decimals).length, Number(last).toFixed(decimals).length) : 0;
	const separator = opts.get('s') ?? '\n';
	const format = value => {
		const text = value.toFixed(decimals);
		return width ? (value < 0 ? `-${text.slice(1).padStart(width - 1, '0')}` : text.padStart(width, '0')) : text;
	};

	let chunk = [];
	let printed = false;
	const flush = () => {
		if (chunk.length) {
			api.out((printed ? separator : '') + chunk.join(separator));
			printed = true;
			chunk = [];
		}
	};
	const up = Number(step) > 0;
	for (let i = 0; ; i++) {
		const value = Number(first) + i * Number(step);
		if (up ? value > Number(last) + 1e-9 : value < Number(last) - 1e-9) {
			break;
		}
		chunk.push(format(value));
		if (chunk.length >= 1000) {
			flush();
			await api.sleep(0);
		}
	}
	flush();
	if (printed) {
		api.out('\n');
	}

	return 0;
};

const which = api => {
	let status = 0;
	for (const name of api.args.filter(arg => !arg.startsWith('-'))) {
		const path = name.includes('/') ? api.resolve(name) : api.shell.commandPath(name);
		const found = path && api.fs.lookup(path);
		if (found && !found.error && api.fs.access(path, 0o1) === null && found.entry.type !== 'dir') {
			api.out(`${name.includes('/') ? name : path}\n`);
		} else {
			api.err(`which: no ${name} in (${api.env.get('PATH') ?? ''})\n`);
			status = 1;
		}
	}

	return api.args.length ? status : 1;
};

// The editor's files open in the editor; nothing else can.
const openFile = api => {
	if (api.args.length === 0) {
		if (api.name === 'editor') {
			api.system.launch('editor');
			return 0;
		}
		api.err(`${api.name}: missing file operand\n`);
		return 1;
	}

	let status = 0;
	for (const operand of api.args) {
		const path = api.resolve(operand);
		const found = api.fs.lookup(path);
		if (FILES[found.path]?.page) {
			api.shell.onOpenFile(FILES[found.path].page);
		} else {
			api.err(`${api.name}: ${operand}: ${found.error ?? 'cannot be opened in the editor'}\n`);
			status = 1;
		}
	}

	return status;
};

const SUDO_USAGE = `usage: sudo -h | -K | -k | -V
usage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]
usage: sudo -l [-ABkNnS] [-g group] [-h host] [-p prompt] [-U user] [-u user] [command [arg ...]]
usage: sudo [-ABbEHkNnPS] [-r role] [-t type] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] [VAR=value] [-i | -s] [command [arg ...]]
usage: sudo -e [-ABkNnS] [-r role] [-t type] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] file ...
`;

// Robin's password is never the one typed. Three tries, with PAM's delay after each.
const authenticate = async (api, {fromStdin, prompt}) => {
	for (let attempt = 1; attempt <= 3; attempt++) {
		let password;
		if (fromStdin) {
			api.err(prompt);
			password = (await api.readLine())?.line ?? null;
		} else {
			password = await api.readPassword(prompt);
		}

		if (password === null) {
			api.err(attempt > 1 ? `sudo: ${attempt - 1} incorrect password attempt${attempt > 2 ? 's' : ''}\n` : 'sudo: no password was provided\n');
			return 1;
		}
		await api.sleep(2000);
		if (attempt < 3) {
			api.err('Sorry, try again.\n');
		}
	}

	api.err('sudo: 3 incorrect password attempts\n');
	return 1;
};

// Everything needs Robin's password, except dnf: so that cowsay can be installed.
const sudo = async api => {
	const args = [...api.args];
	let fromStdin = false;
	let nonInteractive = false;
	let shell = false;
	let prompt = `[sudo] password for ${api.user}: `;
	while (args[0]?.startsWith('-')) {
		const flag = args.shift();
		if (flag === '--') {
			break;
		} else if (flag === '-h' || flag === '--help') {
			api.out(SUDO_USAGE);
			return 0;
		} else if (flag === '-V' || flag === '--version') {
			api.out('Sudo version 1.9.15p5\n');
			return 0;
		} else if (flag === '-l' || flag === '--list') {
			api.out('User robin may run the following commands on robinj.be:\n    (ALL) ALL\n    (root) NOPASSWD: /usr/bin/dnf\n');
			return 0;
		} else if (flag === '-k' || flag === '-K') {
			return 0;
		} else if ((flag === '-v' || flag === '--validate') && nonInteractive) {
			api.err('sudo: a password is required\n');
			return 1;
		} else if (flag === '-v' || flag === '--validate') {
			return authenticate(api, {fromStdin, prompt});
		} else if (flag === '-S' || flag === '--stdin') {
			fromStdin = true;
		} else if (flag === '-n' || flag === '--non-interactive') {
			nonInteractive = true;
		} else if (flag === '-i' || flag === '-s' || flag === '--login' || flag === '--shell') {
			shell = true;
		} else if (flag === '-p' || flag === '--prompt') {
			prompt = (args.shift() ?? '').replace(/%u|%p/g, api.user).replace(/%h|%H/g, 'robinj.be');
		} else if (['-u', '-g', '-C', '-D', '-h', '-r', '-t', '-T', '-U', '-R'].includes(flag)) {
			args.shift();
		}
	}

	const [name] = args;
	if (!shell && name === undefined) {
		api.err(SUDO_USAGE);
		return 1;
	} else if (!shell && !name.startsWith('/') && !api.shell.available(name)) {
		api.err(`sudo: ${name}: command not found\n`);
		return 1;
	} else if (!shell && (name === 'dnf' || name === '/usr/bin/dnf')) {
		return api.run(['dnf', ...args.slice(1)], undefined, {user: 'root'});
	} else if (nonInteractive) {
		api.err('sudo: a password is required\n');
		return 1;
	}

	return authenticate(api, {fromStdin, prompt});
};

const su = async api => {
	let user = 'root';
	for (let i = 0; i < api.args.length; i++) {
		const arg = api.args[i];
		if (['-c', '-s', '-g', '-G', '--command', '--shell', '--group'].includes(arg)) {
			i++;
		} else if (!arg.startsWith('-')) {
			user = arg;
			break;
		}
	}

	if (!USERS.includes(user)) {
		api.err(`su: user ${user} does not exist or the user entry does not contain all the required fields\n`);
		return 1;
	}

	await api.readPassword('Password: ');
	await api.sleep(2000);
	api.err('su: Authentication failure\n');
	return 1;
};

// bash -c 'commands', bash file, or another shell reading the terminal.
const bash = async api => {
	if (api.args[0] === '-c') {
		if (api.args.length < 2) {
			api.err('bash: -c: option requires an argument\n');
			return 2;
		}
		return api.script(api.args[1], api.args.slice(3));
	} else if (api.args.length) {
		const result = api.fs.read(api.resolve(api.args[0]));
		if (result.error) {
			api.err(`bash: ${api.args[0]}: ${result.error}\n`);
			return 127;
		}
		return api.script(result.text, api.args.slice(1));
	}

	let status = 0;
	for (;;) {
		api.err(api.shell.prompt());
		const line = await api.readLine();
		if (!line) {
			api.err('exit\n');
			return status;
		}
		try {
			status = await api.script(line.line);
		} catch (e) {
			api.err(`bash: ${e.message}\n`);
			status = 2;
		}
		if (/^\s*exit\b/.test(line.line)) {
			return status;
		}
	}
};

const launch = app => api => {
	api.system.launch(app);
	return 0;
};

export const COMMANDS = {
	ls,
	tree,
	cat,
	head: headOrTail(true),
	tail: headOrTail(false),
	grep,
	wc,
	cp: copyOrMove(false),
	mv: copyOrMove(true),
	rm,
	rmdir,
	mkdir: create('cannot create', 'directory '),
	touch: create('cannot touch', ''),
	chmod,
	chown,
	sleep,
	date,
	uname,
	lsb_release: lsbRelease,
	env,
	seq,
	which,
	sudo,
	su,
	bash,
	sh: bash,
	whoami: api => {
		if (api.args.length) {
			return usage(api, `extra operand '${api.args[0]}'`);
		}
		api.out(`${api.user}\n`);
		return 0;
	},
	hostname: api => {
		if (api.args.some(arg => !arg.startsWith('-'))) {
			api.err('hostname: you must be root to change the host name\n');
			return 1;
		}
		api.out(api.args.includes('-s') ? 'robinj\n' : 'robinj.be\n');
		return 0;
	},
	clear: api => {
		api.out('\x1b[H\x1b[2J\x1b[3J');
		return 0;
	},
	pwd: api => {
		api.out(`${api.cwd}\n`);
		return 0;
	},
	echo: api => {
		const newline = api.args[0] !== '-n';
		api.out(api.args.slice(newline ? 0 : 1).join(' ') + (newline ? '\n' : ''));
		return 0;
	},
	true: () => 0,
	false: () => 1,
	'xdg-open': openFile,
	open: openFile,
	editor: openFile,
	nano: openFile,
	vi: openFile,
	vim: openFile,
	emacs: openFile,
	code: openFile,
	web: launch('web'),
	terminal: launch('terminal'),
	desktop: api => {
		api.err('desktop: Failed to setup: A Wayland compositor is already running\n');
		return 1;
	},
	kubectl,
	...PROGRAMS,
	...POWER,
	...PACKAGE_COMMANDS,
};
