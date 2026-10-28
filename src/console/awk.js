import {Pipe, Output, pipeInput, textInput} from './io';
import {strftime} from './util';

// awk, as gawk does it: a lexer, a parser to a tree, and an interpreter that's
// async all the way down, so its loops can yield and ^C stops them.

const VERSION = 'GNU Awk 5.3.2, API 4.0, PMA Avon 8-g1, (GNU MPFR 4.2.2, GNU MP 6.3.0)';
// Loop iterations, records and calls between yields to the shell's loop protection.
const STEPS = 10000;
const MAX_DEPTH = 10000;
const BUFFER = 8192;

const USAGE = `Usage: awk [POSIX or GNU style options] -f progfile [--] file ...
Usage: awk [POSIX or GNU style options] [--] 'program' file ...
POSIX options:\t\tGNU long options: (standard)
\t-f progfile\t\t--file=progfile
\t-F fs\t\t\t--field-separator=fs
\t-v var=val\t\t--assign=var=val
Short options:\t\tGNU long options: (extensions)
\t-e 'program-text'\t--source='program-text'
\t-h\t\t\t--help
\t-V\t\t\t--version

gawk is a pattern scanning and processing language.
By default it reads standard input and writes standard output.

Examples:
\tawk '{ sum += $1 }; END { print sum }' file
\tawk -F: '{ print $1 }' /etc/passwd
`;

// --- Values: numbers, strings, strnums (input that looks numeric), and undefined for uninitialised ---

class StrNum {
	constructor(text, number) {
		this.text = text;
		this.number = number;
	}
}

const NUMERIC = /^[ \t\n\r\f\v]*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[ \t\n\r\f\v]*$/;
const LEADING = /^[ \t\n\r\f\v]*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;

const strnum = text => (NUMERIC.test(text) ? new StrNum(text, Number(text.trim())) : text);
const numeric = value => typeof value === 'number' || value instanceof StrNum || value === undefined;

const toNumber = value => {
	if (typeof value === 'number') {
		return value;
	} else if (value instanceof StrNum) {
		return value.number;
	}
	const match = (value ?? '').match(LEADING);
	return match ? Number(match[0].trim()) : 0;
};

const truthy = value => (value instanceof StrNum ? value.number !== 0 : Boolean(value));

// An untyped function argument: an array, in the caller too, once it's used as one.
class Pending {
	constructor(bind) {
		this.bind = bind;
	}
}

class Fatal extends Error {
	constructor(message, token = null) {
		super(message);
		this.token = token;
	}
}

// Control flow, thrown through the interpreter.
class Jump {
	constructor(kind, value) {
		this.kind = kind;
		this.value = value;
	}
}

// --- printf ---

const pad = (text, flags, width) => {
	if (text.length >= width) {
		return text;
	} else if (flags.includes('-')) {
		return text.padEnd(width);
	} else if (flags.includes('0') && /^[-+ ]?(\d|0x)/i.test(text)) {
		const sign = /^[-+ ]/.test(text) ? text[0] : '';
		return sign + text.slice(sign.length).padStart(width - sign.length, '0');
	}
	return text.padStart(width);
};

const special = n => (Number.isNaN(n) ? 'nan' : n > 0 ? 'inf' : '-inf');

// |n| as exact decimal digits, and where the point goes in them: 2.5 is {digits: '25', point: 1}.
const decimal = n => {
	if (Math.abs(n) >= 1e21) {
		const digits = String(BigInt(Math.abs(n)));
		return {digits, point: digits.length};
	}
	const [mantissa, exponent] = Math.abs(n).toExponential(99).split('e');
	const digits = mantissa.replace('.', '');
	const point = Number(exponent) + 1;
	return point < 0 ? {digits: '0'.repeat(-point) + digits, point: 0} : {digits, point};
};

// The first `count` digits, rounded half to even as C's printf rounds; a carry makes one more.
const round = (digits, count) => {
	const kept = digits.slice(0, count).padEnd(count, '0');
	const next = digits[count] ?? '0';
	const up = next > '5' || (next === '5' && (/[1-9]/.test(digits.slice(count + 1)) || Number(kept.at(-1) ?? 0) % 2 === 1));
	return up ? String(BigInt(kept || '0') + 1n).padStart(count, '0') : kept;
};

const fixed = (n, precision) => {
	const {digits, point} = decimal(n);
	const kept = round(digits, point + precision);
	const whole = kept.slice(0, kept.length - precision).replace(/^0+(?=\d)/, '') || '0';
	return precision ? `${whole}.${kept.slice(kept.length - precision)}` : whole;
};

// Mantissa digits and exponent, for %e and for %g to choose by.
const scientific = (n, precision) => {
	if (n === 0) {
		return {mantissa: '0'.repeat(precision + 1), exponent: 0};
	}
	const {digits, point} = decimal(n);
	const first = digits.search(/[1-9]/);
	const kept = round(digits.slice(first), precision + 1);
	return {mantissa: kept.slice(0, precision + 1), exponent: point - first - 1 + kept.length - precision - 1};
};

const exponential = (n, precision) => {
	const {mantissa, exponent} = scientific(n, precision);
	const sign = exponent < 0 ? '-' : '+';
	return `${mantissa[0]}${precision ? `.${mantissa.slice(1)}` : ''}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
};

const floating = (n, conversion, precision, alternate) => {
	if (!Number.isFinite(n)) {
		return special(n);
	}
	const digits = precision ?? 6;
	const lower = conversion.toLowerCase();
	let text;
	if (lower === 'f') {
		text = fixed(n, digits);
	} else if (lower === 'e') {
		text = exponential(n, digits);
	} else {
		const significant = digits || 1;
		const {exponent} = scientific(n, significant - 1);
		text = exponent < -4 || exponent >= significant ? exponential(n, significant - 1) : fixed(n, significant - 1 - exponent);
		text = alternate ? text : text.replace(/\.(\d*?)0+(?=e|$)/, (match, kept) => (kept ? `.${kept}` : ''));
	}
	text = (n < 0 || Object.is(n, -0) ? '-' : '') + text;
	return conversion === lower ? text : text.toUpperCase();
};

const integer = n => (Number.isFinite(n) ? BigInt(Math.trunc(n)) : null);

// sprintf; `ranOut` reports the conversion that had no argument left.
const format = (spec, args, convfmt, ranOut) => {
	let index = 0;
	return spec.replace(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?([cdiouxXeEfFgGs%])?/g, (match, flags, width, precision, conversion, offset) => {
		if (conversion === '%') {
			return '%';
		} else if (conversion === undefined) {
			return match;
		}
		const next = () => {
			if (index >= args.length) {
				ranOut(offset);
			}
			return args[index++];
		};
		const w = width === '*' ? toNumber(next()) : Number(width ?? 0);
		const p = precision === '*' ? toNumber(next()) : precision === undefined ? undefined : Number(precision || 0);
		const allFlags = w < 0 ? `${flags}-` : flags;
		const value = next();
		let text;
		switch (conversion) {
			case 'c':
				text = typeof value === 'number' || value instanceof StrNum ? String.fromCodePoint(Math.trunc(toNumber(value)) & 0x1fffff) : [...stringOf(value, convfmt)][0] ?? '';
				break;
			case 's': {
				const string = stringOf(value, convfmt);
				text = p === undefined ? string : [...string].slice(0, p).join('');
				break;
			}
			case 'd':
			case 'i': {
				const n = integer(toNumber(value));
				if (n === null) {
					text = special(toNumber(value));
					break;
				}
				const digits = (n < 0n ? -n : n).toString().padStart(p ?? 1, '0');
				text = (n < 0n ? '-' : allFlags.includes('+') ? '+' : allFlags.includes(' ') ? ' ' : '') + (p === 0 && n === 0n ? '' : digits);
				break;
			}
			case 'o':
			case 'u':
			case 'x':
			case 'X': {
				let n = integer(toNumber(value)) ?? 0n;
				n = n < 0n ? BigInt.asUintN(64, n) : n;
				const digits = n.toString({o: 8, u: 10, x: 16, X: 16}[conversion]).padStart(p ?? 1, '0');
				const prefix = allFlags.includes('#') && n !== 0n ? {o: '0', x: '0x', X: '0X'}[conversion] ?? '' : '';
				text = prefix + (conversion === 'X' ? digits.toUpperCase() : digits);
				break;
			}
			default: {
				const n = toNumber(value);
				text = floating(n, conversion, p, allFlags.includes('#'));
				if (!text.startsWith('-')) {
					text = (allFlags.includes('+') ? '+' : allFlags.includes(' ') ? ' ' : '') + text;
				}
			}
		}
		return pad(text, allFlags, Math.abs(w));
	});
};

const numberString = (n, fmt) => {
	if (Number.isInteger(n)) {
		return Object.is(n, -0) ? '-0' : BigInt(n).toString();
	} else if (!Number.isFinite(n)) {
		return special(n);
	}
	return format(fmt, [n], fmt, () => {});
};

const stringOf = (value, fmt) => {
	if (typeof value === 'number') {
		return numberString(value, fmt);
	}
	return value instanceof StrNum ? value.text : value ?? '';
};

// --- Regular expressions: POSIX EREs, with gawk's extras, as JavaScript ones ---

const CLASSES = {
	alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t',
	punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9a-fA-F', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~', word: '\\w',
};

const ESCAPES = {n: '\n', t: '\t', r: '\r', f: '\f', v: '\v', a: '\x07', b: '\b', '\\': '\\', '"': '"', '/': '/'};

const regexSource = source => {
	let out = '';
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (c === '\\') {
			const next = source[++i];
			if (next === undefined) {
				out += '\\\\';
			} else if (next === 'y' || next === '<' || next === '>') {
				out += '\\b';
			} else if (next === '`') {
				out += '^';
			} else if (next === "'") {
				out += '$';
			} else if (next === 'a' || next === 'b') {
				out += ESCAPES[next] === '\b' ? '\\x08' : '\\x07';
			} else if (next === '/' || next === '"') {
				out += next;
			} else {
				out += `\\${next}`;
			}
		} else if (c === '[') {
			let j = i + 1;
			let set = '[';
			if (source[j] === '^') {
				set += '^';
				j++;
			}
			if (source[j] === ']') {
				set += '\\]';
				j++;
			}
			for (; j < source.length && source[j] !== ']'; j++) {
				const end = source.indexOf(':]', j);
				if (source.startsWith('[:', j) && end > 0 && CLASSES[source.slice(j + 2, end)]) {
					set += CLASSES[source.slice(j + 2, end)];
					j = end + 1;
				} else if (source[j] === '\\') {
					set += `\\${source[++j] ?? '\\'}`;
				} else {
					set += source[j] === '[' ? '\\[' : source[j];
				}
			}
			if (j >= source.length) {
				throw new Fatal('Unmatched [, [^, [:, [., or [=');
			}
			out += `${set}]`;
			i = j;
		} else if (c === '{') {
			const interval = source.slice(i).match(/^\{\d+(,\d*)?\}/);
			out += interval && out ? interval[0] : '\\{';
			i += interval && out ? interval[0].length - 1 : 0;
		} else {
			out += c === '}' ? '\\}' : c;
		}
	}
	return out;
};

// --- Lexer ---

const KEYWORDS = new Set(['BEGIN', 'END', 'function', 'func', 'if', 'else', 'while', 'for', 'do', 'break', 'continue', 'next', 'nextfile', 'exit', 'return', 'delete', 'in', 'getline', 'print', 'printf']);
const BUILTINS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'sprintf', 'sin', 'cos', 'atan2', 'exp', 'log', 'sqrt', 'int', 'rand', 'srand', 'tolower', 'toupper', 'system', 'close', 'fflush', 'systime', 'strftime']);
const PUNCTUATION = ['**=', '&&', '||', '==', '<=', '>=', '!=', '++', '--', '+=', '-=', '*=', '/=', '%=', '^=', '>>', '!~', '**',
	'{', '}', '(', ')', '[', ']', ';', ',', '+', '-', '*', '/', '%', '^', '!', '>', '<', '|', '?', ':', '~', '$', '='];
// After these, a slash divides; anywhere else, it starts a regular expression.
const OPERANDS = new Set(['name', 'number', 'string', 'builtin', ')', ']', '$', '++', '--']);

class ParseError extends Error {
	constructor(message, token) {
		super(message);
		this.token = token;
	}
}

const unescape = (text, i) => {
	const c = text[i];
	if (/[0-7]/.test(c)) {
		const digits = text.slice(i).match(/^[0-7]{1,3}/)[0];
		return {char: String.fromCharCode(parseInt(digits, 8)), length: digits.length};
	} else if (c === 'x' && /[0-9a-fA-F]/.test(text[i + 1] ?? '')) {
		const digits = text.slice(i + 1).match(/^[0-9a-fA-F]{1,2}/)[0];
		return {char: String.fromCharCode(parseInt(digits, 16)), length: digits.length + 1};
	}
	return {char: ESCAPES[c] ?? c, length: 1};
};

// A string's escapes, as in a -v assignment.
const unescapeAll = text => {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\\' && i + 1 < text.length) {
			const {char, length} = unescape(text, i + 1);
			out += char;
			i += length;
		} else {
			out += text[i];
		}
	}
	return out;
};

const lex = (source, label) => {
	const tokens = [];
	let line = 1;
	let lineStart = 0;
	const push = (type, value, start) => tokens.push({type, value, start, line, column: start - lineStart, label, source});
	for (let i = 0; i < source.length;) {
		const c = source[i];
		const start = i;
		const previous = tokens[tokens.length - 1]?.type;
		if (c === '\\' && (source[i + 1] === '\n' || source.startsWith('\r\n', i + 1))) {
			i += source[i + 1] === '\n' ? 2 : 3;
			line++;
			lineStart = i;
		} else if (c === ' ' || c === '\t' || c === '\r') {
			i++;
		} else if (c === '\n') {
			push('newline', '\n', i++);
			line++;
			lineStart = i;
		} else if (c === '#') {
			while (i < source.length && source[i] !== '\n') {
				i++;
			}
		} else if (c === '"') {
			let value = '';
			for (i++; source[i] !== '"'; i++) {
				if (i >= source.length || source[i] === '\n') {
					throw new ParseError('unterminated string', {start, line, column: start - lineStart, label, source});
				} else if (source[i] === '\\' && source[i + 1] === '\n') {
					i++;
				} else if (source[i] === '\\') {
					const {char, length} = unescape(source, i + 1);
					value += char;
					i += length;
				} else {
					value += source[i];
				}
			}
			i++;
			push('string', value, start);
		} else if (c === '/' && !OPERANDS.has(previous)) {
			let value = '';
			let bracket = false;
			for (i++; bracket || source[i] !== '/'; i++) {
				if (i >= source.length || source[i] === '\n') {
					throw new ParseError('unterminated regexp', {start, line, column: start - lineStart, label, source});
				} else if (source[i] === '\\') {
					value += source[i] + source[++i];
					continue;
				} else if (source[i] === '[' && !bracket) {
					bracket = true;
					value += source[i];
					if (source[i + 1] === '^') {
						value += source[++i];
					}
					if (source[i + 1] === ']') {
						value += source[++i];
					}
					continue;
				} else if (source[i] === ']') {
					bracket = false;
				}
				value += source[i];
			}
			i++;
			push('regex', value, start);
		} else if (/[0-9.]/.test(c) && /^(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/.test(source.slice(i))) {
			const [text] = source.slice(i).match(/^(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/);
			i += text.length;
			push('number', Number(text), start);
		} else if (/[A-Za-z_]/.test(c)) {
			const [word] = source.slice(i).match(/^\w+/);
			i += word.length;
			if (KEYWORDS.has(word)) {
				push(word === 'func' ? 'function' : word, word, start);
			} else if (BUILTINS.has(word)) {
				push('builtin', word, start);
			} else {
				push(source[i] === '(' ? 'funcname' : 'name', word, start);
			}
		} else {
			const punctuation = PUNCTUATION.find(p => source.startsWith(p, i));
			if (!punctuation) {
				throw new ParseError(`invalid char '${c}' in expression`, {start, line, column: start - lineStart, label, source});
			}
			i += punctuation.length;
			push(punctuation === '**' ? '^' : punctuation === '**=' ? '^=' : punctuation, punctuation, start);
		}
	}
	push('newline', '\n', source.length);
	push('eof', '', source.length);
	return tokens;
};

// --- Parser ---

const ASSIGNMENTS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '^=']);
const RELATIONS = new Set(['<', '<=', '==', '!=', '>', '>=']);
// What can follow an expression to concatenate with it.
const CONCATENATES = new Set(['number', 'string', 'regex', 'name', 'funcname', 'builtin', '$', '(', '++', '--']);
// How many arguments each built-in takes.
const ARITY = {
	length: [0, 1], substr: [2, 3], index: [2, 2], split: [2, 3], sub: [2, 3], gsub: [2, 3], match: [2, 3], sprintf: [1, Infinity],
	sin: [1, 1], cos: [1, 1], atan2: [2, 2], exp: [1, 1], log: [1, 1], sqrt: [1, 1], int: [1, 1], rand: [0, 0], srand: [0, 1],
	tolower: [1, 1], toupper: [1, 1], system: [1, 1], close: [1, 1], fflush: [0, 1], systime: [0, 0], strftime: [0, 3],
};

class Parser {
	constructor(tokens) {
		this.tokens = tokens;
		this.pos = 0;
		this.functions = new Map();
		this.calls = [];
		this.params = null;
		this.context = null;
		this.loops = 0;
	}

	get peek() {
		return this.tokens[this.pos];
	}

	is(...types) {
		return types.includes(this.peek.type);
	}

	next() {
		return this.tokens[this.pos++];
	}

	fail(token = this.peek, message = null) {
		const end = token.type === 'newline' || token.type === 'eof';
		throw new ParseError(message ?? (end ? 'unexpected newline or end of string' : 'syntax error'), token);
	}

	expect(type) {
		if (!this.is(type)) {
			this.fail();
		}
		return this.next();
	}

	newlines() {
		while (this.is('newline')) {
			this.next();
		}
	}

	terminators() {
		while (this.is('newline', ';')) {
			this.next();
		}
	}

	program() {
		const program = {begin: [], end: [], rules: [], functions: this.functions};
		this.terminators();
		while (!this.is('eof')) {
			const start = this.peek;
			if (this.is('function')) {
				this.function();
			} else if (this.is('BEGIN', 'END')) {
				const kind = this.next().type;
				this.context = kind;
				if (!this.is('{')) {
					this.fail(start, `${kind} blocks must have an action part`);
				}
				program[kind === 'BEGIN' ? 'begin' : 'end'].push(this.block());
				this.context = null;
			} else {
				const rule = {token: start};
				if (!this.is('{')) {
					rule.pattern = this.expression();
					if (this.is(',')) {
						this.next();
						this.newlines();
						rule.until = this.expression();
					}
				}
				if (this.is('{')) {
					rule.action = this.block();
				} else if (!this.is('newline', ';', 'eof')) {
					this.fail();
				}
				program.rules.push(rule);
			}
			this.terminators();
		}

		for (const call of this.calls) {
			const fn = this.functions.get(call.name);
			if (!fn) {
				throw new Fatal(`function \`${call.name}' not defined`, call.token);
			} else if (call.args.length > fn.params.length) {
				throw new Fatal(`function \`${call.name}' called with more arguments than declared`, call.token);
			}
		}
		return program;
	}

	function() {
		this.next();
		const name = this.next();
		if (name.type !== 'name' && name.type !== 'funcname') {
			this.fail(name);
		} else if (this.functions.has(name.value)) {
			this.fail(name, `function \`${name.value}' previously defined`);
		}
		this.expect('(');
		const params = [];
		while (!this.is(')')) {
			params.push(this.expect('name').value);
			if (!this.is(')')) {
				this.expect(',');
				this.newlines();
			}
		}
		this.next();
		this.newlines();
		this.params = params;
		this.context = 'function';
		const fn = {name: name.value, params};
		this.functions.set(name.value, fn);
		fn.body = this.block();
		this.params = null;
		this.context = null;
	}

	block() {
		const token = this.expect('{');
		const body = [];
		this.terminators();
		while (!this.is('}')) {
			if (this.is('eof')) {
				this.fail();
			}
			body.push(this.statement());
			this.terminators();
		}
		this.next();
		return {type: 'block', body, token};
	}

	// A simple statement ends with a newline, a semicolon, or the closing brace.
	end() {
		if (this.is('newline', ';')) {
			this.next();
		} else if (!this.is('}', 'eof')) {
			this.fail();
		}
	}

	body() {
		this.newlines();
		if (this.is(';')) {
			this.next();
			return {type: 'block', body: []};
		}
		return this.statement();
	}

	loop(parse) {
		this.loops++;
		try {
			return parse();
		} finally {
			this.loops--;
		}
	}

	statement() {
		const token = this.peek;
		const node = this.statementOf(token);
		node.token ??= token;
		return node;
	}

	statementOf(token) {
		switch (token.type) {
			case '{':
				return this.block();
			case 'if': {
				this.next();
				this.expect('(');
				const test = this.expression();
				this.expect(')');
				const yes = this.body();
				const saved = this.pos;
				this.terminators();
				if (this.is('else')) {
					this.next();
					return {type: 'if', test, yes, no: this.body()};
				}
				this.pos = saved;
				return {type: 'if', test, yes};
			}
			case 'while': {
				this.next();
				this.expect('(');
				const test = this.expression();
				this.expect(')');
				if (this.is(';')) {
					this.next();
					return {type: 'while', test, body: {type: 'block', body: []}};
				}
				return {type: 'while', test, body: this.loop(() => this.body())};
			}
			case 'do': {
				this.next();
				const body = this.loop(() => this.body());
				this.terminators();
				this.expect('while');
				this.expect('(');
				const test = this.expression();
				this.expect(')');
				this.end();
				return {type: 'do', body, test};
			}
			case 'for':
				return this.forStatement();
			default: {
				const node = this.simple();
				this.end();
				return node;
			}
		}
	}

	forStatement() {
		this.next();
		this.expect('(');
		const [a, b, c, d] = this.tokens.slice(this.pos, this.pos + 4);
		if (a.type === 'name' && b.type === 'in' && c.type === 'name' && d.type === ')') {
			this.pos += 4;
			return {type: 'forin', variable: this.variable(a.value), array: this.variable(c.value), body: this.loop(() => this.body())};
		}
		const init = this.is(';') ? null : this.simple();
		this.expect(';');
		this.newlines();
		const test = this.is(';') ? null : this.expression();
		this.expect(';');
		this.newlines();
		const step = this.is(')') ? null : this.simple();
		this.expect(')');
		if (this.is(';')) {
			this.next();
			return {type: 'for', init, test, step, body: {type: 'block', body: []}};
		}
		return {type: 'for', init, test, step, body: this.loop(() => this.body())};
	}

	simple() {
		const token = this.peek;
		switch (token.type) {
			case 'print':
			case 'printf':
				return this.print();
			case 'delete': {
				this.next();
				const name = this.expect('name');
				if (this.is('[')) {
					this.next();
					const subscripts = this.list(']');
					return {type: 'delete', array: this.variable(name.value), subscripts};
				}
				return {type: 'delete', array: this.variable(name.value)};
			}
			case 'next':
			case 'nextfile':
				if (this.context === 'BEGIN' || this.context === 'END') {
					this.fail(token, `\`${token.type}' used in ${this.context} action`);
				}
				this.next();
				return {type: token.type};
			case 'break':
			case 'continue':
				if (!this.loops) {
					this.fail(token, `\`${token.type}' is not allowed outside a loop`);
				}
				this.next();
				return {type: token.type};
			case 'exit':
			case 'return': {
				if (token.type === 'return' && this.context !== 'function') {
					this.fail(token, '`return\' used outside function context');
				}
				this.next();
				const value = this.is('newline', ';', '}', 'eof') ? null : this.expression();
				return {type: token.type, value};
			}
			default:
				return {type: 'expression', expression: this.expression()};
		}
	}

	print() {
		const kind = this.next().type;
		let args = [];
		const ends = () => this.is('newline', ';', '}', 'eof', '>', '>>', '|');
		if (this.is('(')) {
			const saved = this.pos;
			this.next();
			const list = this.list(')');
			if (ends()) {
				args = list;
			} else {
				this.pos = saved;
			}
		}
		if (!args.length && !ends()) {
			args = [this.expression({noGt: true})];
			while (this.is(',')) {
				this.next();
				this.newlines();
				args.push(this.expression({noGt: true}));
			}
		}
		if (kind === 'printf' && !args.length) {
			this.fail();
		}
		let redirect = null;
		if (this.is('>', '>>', '|')) {
			const op = this.next().type;
			redirect = {op, target: this.concatenation({noGt: true})};
		}
		return {type: kind, args, redirect};
	}

	// Comma-separated expressions up to `close`, which is consumed.
	list(close) {
		const items = [];
		this.newlines();
		while (!this.is(close)) {
			items.push(this.expression());
			this.newlines();
			if (!this.is(close)) {
				this.expect(',');
				this.newlines();
			}
		}
		this.next();
		return items;
	}

	variable(name) {
		const index = this.params?.indexOf(name) ?? -1;
		return index >= 0 ? {type: 'local', name, index} : {type: 'var', name};
	}

	expression(flags = {}) {
		const left = this.ternary(flags);
		if (ASSIGNMENTS.has(this.peek.type) && ['var', 'local', 'field', 'index'].includes(left.type)) {
			const op = this.next().type;
			this.newlines();
			return {type: 'assign', op, target: left, value: this.expression(flags)};
		}
		return left;
	}

	ternary(flags) {
		const test = this.or(flags);
		if (!this.is('?')) {
			return test;
		}
		this.next();
		this.newlines();
		const yes = this.expression(flags);
		this.newlines();
		this.expect(':');
		this.newlines();
		return {type: 'cond', test, yes, no: this.expression(flags)};
	}

	or(flags) {
		let left = this.and(flags);
		while (this.is('||')) {
			this.next();
			this.newlines();
			left = {type: 'or', left, right: this.and(flags)};
		}
		return left;
	}

	and(flags) {
		let left = this.in(flags);
		while (this.is('&&')) {
			this.next();
			this.newlines();
			left = {type: 'and', left, right: this.in(flags)};
		}
		return left;
	}

	in(flags) {
		let left = this.match(flags);
		while (this.is('in')) {
			this.next();
			const subscripts = left.type === 'group' ? left.items : [left];
			left = {type: 'in', subscripts, array: this.variable(this.expect('name').value)};
		}
		return left;
	}

	match(flags) {
		let left = this.comparison(flags);
		while (this.is('~', '!~')) {
			const negate = this.next().type === '!~';
			left = {type: 'match', left, regex: this.comparison(flags), negate};
		}
		return left;
	}

	comparison(flags) {
		let left = this.concatenation(flags);
		while (this.is('|') && this.tokens[this.pos + 1].type === 'getline') {
			this.pos += 2;
			left = {type: 'pipe-getline', command: left, target: this.getlineTarget()};
		}
		if (RELATIONS.has(this.peek.type) && !(flags.noGt && this.is('>'))) {
			const op = this.next().type;
			left = {type: 'compare', op, left, right: this.concatenation(flags)};
		}
		return left;
	}

	concatenation(flags) {
		let left = this.additive(flags);
		while (CONCATENATES.has(this.peek.type)) {
			left = {type: 'concat', left, right: this.additive(flags)};
		}
		return left;
	}

	additive(flags) {
		let left = this.multiplicative(flags);
		while (this.is('+', '-')) {
			const op = this.next().type;
			left = {type: 'binary', op, left, right: this.multiplicative(flags)};
		}
		return left;
	}

	multiplicative(flags) {
		let left = this.unary(flags);
		while (this.is('*', '/', '%')) {
			const op = this.next().type;
			left = {type: 'binary', op, left, right: this.unary(flags)};
		}
		return left;
	}

	unary(flags) {
		if (this.is('!', '-', '+')) {
			const op = this.next().type;
			return {type: 'unary', op, operand: this.unary(flags)};
		}
		return this.power(flags);
	}

	power(flags) {
		const base = this.postfix(flags);
		if (this.is('^')) {
			this.next();
			return {type: 'binary', op: '^', left: base, right: this.unary(flags)};
		}
		return base;
	}

	postfix(flags) {
		const operand = this.primary(flags);
		if (this.is('++', '--') && ['var', 'local', 'field', 'index'].includes(operand.type)) {
			return {type: 'increment', op: this.next().type, prefix: false, target: operand};
		}
		return operand;
	}

	lvalue() {
		if (!this.is('$', 'name')) {
			this.fail();
		}
		return this.primary({});
	}

	getlineTarget() {
		return this.is('$', 'name') ? this.lvalue() : null;
	}

	primary(flags) {
		const token = this.next();
		switch (token.type) {
			case 'number':
				return {type: 'number', value: token.value};
			case 'string':
				return {type: 'string', value: token.value};
			case 'regex':
				return {type: 'regex', source: token.value, token};
			case '$': {
				if (this.is('++', '--')) {
					const op = this.next().type;
					return {type: 'field', index: {type: 'increment', op, prefix: true, target: this.lvalue()}};
				} else if (this.is('-', '!', '+')) {
					const op = this.next().type;
					return {type: 'field', index: {type: 'unary', op, operand: this.primary(flags)}};
				}
				return {type: 'field', index: this.primary(flags)};
			}
			case '++':
			case '--':
				return {type: 'increment', op: token.type, prefix: true, target: this.lvalue()};
			case '(': {
				this.newlines();
				const first = this.expression();
				this.newlines();
				if (this.is(',')) {
					this.next();
					const rest = this.list(')');
					if (!this.is('in')) {
						this.fail();
					}
					return {type: 'group', items: [first, ...rest]};
				}
				this.expect(')');
				return {type: 'grouping', expression: first};
			}
			case 'name':
				if (this.is('[')) {
					this.next();
					const subscripts = this.list(']');
					if (subscripts.length === 0) {
						this.fail(this.tokens[this.pos - 1]);
					}
					return {type: 'index', array: this.variable(token.value), subscripts};
				}
				return this.variable(token.value);
			case 'funcname': {
				this.next();
				const call = {type: 'call', name: token.value, args: this.list(')'), token};
				this.calls.push(call);
				return call;
			}
			case 'builtin': {
				if (!this.is('(')) {
					if (token.value !== 'length') {
						this.fail();
					}
					return {type: 'builtin', name: 'length', args: [], token};
				}
				this.next();
				const args = this.list(')');
				const [least, most] = ARITY[token.value];
				if (args.length < least || args.length > most) {
					throw new Fatal(`${args.length} is invalid as number of arguments for ${token.value}`, token);
				} else if (['split', 'match'].includes(token.value) && args.length > (token.value === 'split' ? 1 : 2) && !['var', 'local'].includes(args[token.value === 'split' ? 1 : 2].type)) {
					throw new Fatal(`${token.value}: ${token.value === 'split' ? 'second' : 'third'} argument is not an array`, token);
				} else if (['sub', 'gsub'].includes(token.value) && args[2] && !['var', 'local', 'field', 'index'].includes(args[2].type)) {
					throw new Fatal(`${token.value} third parameter is not a changeable object`, token);
				}
				return {type: 'builtin', name: token.value, args, token};
			}
			case 'getline': {
				const target = this.getlineTarget();
				if (this.is('<')) {
					this.next();
					return {type: 'getline', target, file: this.primary(flags)};
				}
				return {type: 'getline', target};
			}
			default:
				return this.fail(token);
		}
	}
}

const parse = sources => {
	const tokens = sources.flatMap(({text, label}, i) => {
		const lexed = lex(text, label);
		return i < sources.length - 1 ? lexed.slice(0, -1) : lexed;
	});
	return new Parser(tokens).program();
};

// --- Input: records, read as they're needed ---

class Records {
	constructor(input, abort) {
		this.input = input;
		this.abort = abort;
		this.buffer = '';
		this.pos = 0;
		this.ended = false;
	}

	separator(rs) {
		if (rs === '\n' || rs.length === 1) {
			const at = this.buffer.indexOf(rs, this.pos);
			return at < 0 ? null : {start: at, end: at + 1};
		}
		const regex = rs === '' ? /\n\n+/g : new RegExp(regexSource(rs), 'g');
		regex.lastIndex = this.pos;
		for (let match = regex.exec(this.buffer); match; match = regex.exec(this.buffer)) {
			if (match[0]) {
				return {start: match.index, end: match.index + match[0].length};
			}
			regex.lastIndex++;
		}
		return null;
	}

	// The next record and its terminator, or null at the end.
	async next(rs) {
		for (;;) {
			while (rs === '' && this.buffer[this.pos] === '\n') {
				this.pos++;
			}
			const found = this.separator(rs);
			const complete = found && (rs.length <= 1 && rs !== '' ? true : found.end < this.buffer.length || this.ended);
			if (complete) {
				const record = this.buffer.slice(this.pos, found.start);
				const terminator = this.buffer.slice(found.start, found.end);
				this.pos = found.end;
				return {record, terminator};
			} else if (this.ended) {
				let record = this.buffer.slice(this.pos);
				this.pos = this.buffer.length;
				if (!record) {
					return null;
				}
				const terminator = rs === '' && record.endsWith('\n') ? '\n' : '';
				record = terminator ? record.slice(0, -1) : record;
				return {record, terminator};
			}

			const chunk = await this.input.read(this.abort);
			if (chunk === null) {
				this.ended = true;
			} else {
				this.buffer = this.buffer.slice(this.pos) + chunk;
				this.pos = 0;
			}
		}
	}
}

// --- The interpreter ---

class Awk {
	constructor(api, program, {argv, assignments}) {
		this.api = api;
		this.program = program;
		this.globals = new Map(Object.entries({
			FS: ' ', OFS: ' ', ORS: '\n', RS: '\n', NR: 0, NF: 0, FNR: 0, FILENAME: '', SUBSEP: '\x1c', RSTART: 0, RLENGTH: -1,
			CONVFMT: '%.6g', OFMT: '%.6g', RT: '', ERRNO: '', ARGC: argv.length,
		}));
		this.globals.set('ARGV', new Map(argv.map((arg, i) => [String(i), strnum(arg)])));
		this.globals.set('ENVIRON', new Map([...api.env].map(([name, value]) => [name, strnum(value)])));
		this.assignments = assignments;
		this.frame = [];
		this.depth = 0;
		this.steps = 0;
		this.record = {text: '', fields: []};
		this.splitters = new Map();
		this.ranges = new Map();
		this.regexes = new Map();
		this.output = '';
		this.files = new Map();
		this.readers = new Map();
		this.main = null;
		this.argIndex = 1;
		this.status = 0;
		this.seed = 0;
		this.random = this.generator(0);
		this.token = null;
	}

	// --- Errors ---

	fatal(message) {
		throw new Fatal(message);
	}

	where() {
		const token = this.token;
		const fnr = this.globals.get('FNR');
		const context = fnr > 0 ? `(FILENAME=${stringOf(this.globals.get('FILENAME')) || '-'} FNR=${fnr}) ` : '';
		return `${token ? `${token.label}:${token.line}: ` : ''}${context}`;
	}

	// --- Variables ---

	slot(node) {
		return node.type === 'local' ? this.frame[node.index] : node.name === 'NF' ? this.nf() : this.globals.get(node.name);
	}

	scalar(node) {
		const value = this.slot(node);
		if (value instanceof Map) {
			this.fatal(`attempt to use array \`${node.name}' in a scalar context`);
		}
		return value instanceof Pending ? undefined : value;
	}

	assign(node, value) {
		if (this.slot(node) instanceof Map) {
			this.fatal(`attempt to use array \`${node.name}' in a scalar context`);
		} else if (node.type === 'local') {
			this.frame[node.index] = value;
		} else if (node.name === 'NF') {
			this.setNF(toNumber(value));
		} else {
			this.globals.set(node.name, value);
		}
		return value;
	}

	array(node) {
		const value = this.slot(node);
		if (value instanceof Map) {
			return value;
		} else if (value !== undefined && !(value instanceof Pending)) {
			this.fatal(`attempt to use scalar \`${node.name}' as an array`);
		}
		const array = value instanceof Pending ? value.bind() : new Map();
		if (node.type === 'local') {
			this.frame[node.index] = array;
		} else {
			this.globals.set(node.name, array);
		}
		return array;
	}

	str(value) {
		return stringOf(value, stringOf(this.globals.get('CONVFMT')));
	}

	async subscript(subscripts) {
		const keys = [];
		for (const node of subscripts) {
			keys.push(this.str(await this.evaluate(node)));
		}
		return keys.join(this.str(this.globals.get('SUBSEP')));
	}

	// --- Records and fields ---

	setRecord(text) {
		this.record = {text, fields: null, fs: this.str(this.globals.get('FS'))};
	}

	split() {
		if (!this.record.fields) {
			this.record.fields = this.fields(this.record.text, this.record.fs, this.str(this.globals.get('RS')) === '').map(strnum);
		}
		return this.record.fields;
	}

	fields(text, fs, paragraph) {
		if (fs === ' ') {
			const trimmed = text.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
			return trimmed ? trimmed.split(/[ \t\n]+/) : [];
		} else if (text === '') {
			return [];
		} else if (fs === '') {
			return [...text];
		}
		const key = `${paragraph}${fs}`;
		if (!this.splitters.has(key)) {
			const source = fs.length === 1 ? fs.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') : this.regexFrom(fs);
			this.splitters.set(key, new RegExp(`${source}${paragraph ? '|\\n' : ''}`, 'g'));
		}
		const regex = this.splitters.get(key);
		regex.lastIndex = 0;
		const parts = [];
		let from = 0;
		for (let match = regex.exec(text); match; match = regex.exec(text)) {
			if (!match[0]) {
				regex.lastIndex++;
				continue;
			}
			parts.push(text.slice(from, match.index));
			from = match.index + match[0].length;
		}
		parts.push(text.slice(from));
		return parts;
	}

	nf() {
		return this.split().length;
	}

	field(index) {
		if (index === 0) {
			return strnum(this.record.text);
		}
		return this.split()[index - 1];
	}

	rebuild() {
		this.record.text = this.record.fields.map(value => this.str(value)).join(this.str(this.globals.get('OFS')));
	}

	setField(index, value) {
		if (index === 0) {
			this.setRecord(this.str(value));
			return value;
		}
		const fields = this.split();
		while (fields.length < index) {
			fields.push('');
		}
		fields[index - 1] = value;
		this.rebuild();
		return value;
	}

	setNF(n) {
		const fields = this.split();
		fields.length = Math.max(Math.trunc(n), 0);
		for (let i = 0; i < fields.length; i++) {
			fields[i] ??= '';
		}
		this.rebuild();
	}

	async fieldIndex(node) {
		const index = Math.trunc(toNumber(await this.evaluate(node)));
		if (index < 0) {
			this.fatal(`attempt to access field ${index}`);
		}
		return index;
	}

	// --- Regular expressions ---

	regexFrom(source) {
		try {
			return regexSource(source);
		} catch (e) {
			return this.fatal(`${e.message}: /${source}/`);
		}
	}

	regex(source, flags = '') {
		const key = `${flags}/${source}`;
		if (!this.regexes.has(key)) {
			const converted = this.regexFrom(source);
			try {
				this.regexes.set(key, new RegExp(converted, flags));
			} catch (e) {
				const reason = /Unterminated group/.test(e.message) ? 'Unmatched ( or \\(' : /Unmatched '\)'/.test(e.message) ? 'Unmatched ) or \\)' : /Nothing to repeat/.test(e.message) ? 'Invalid preceding regular expression' : 'Invalid regular expression';
				this.fatal(`${reason}: /${source}/`);
			}
		}
		const regex = this.regexes.get(key);
		regex.lastIndex = 0;
		return regex;
	}

	async regexOf(node, flags) {
		return this.regex(node.type === 'regex' ? node.source : this.str(await this.evaluate(node)), flags);
	}

	// --- Output ---

	async flush() {
		if (this.output) {
			this.api.out(this.output);
			this.output = '';
			await this.api.drain();
		}
	}

	async write(text, redirect) {
		if (!redirect) {
			this.output += text;
			if (this.output.length >= BUFFER || this.api.stdout.isTTY) {
				await this.flush();
			}
			return;
		}

		const name = this.str(await this.evaluate(redirect.target));
		if (redirect.op === '|') {
			const pipe = this.files.get(name) ?? {command: name, text: ''};
			this.files.set(name, pipe);
			pipe.text += text;
			return;
		} else if (name === '/dev/stdout' || name === '-') {
			await this.write(text, null);
			return;
		}

		await this.flush();
		if (name === '/dev/stderr') {
			this.api.err(text);
			return;
		} else if (!this.files.has(name)) {
			const opened = this.api.openWrite(name);
			if (opened.error) {
				this.fatal(`can't redirect to \`${name}' (${opened.error})`);
			}
			this.files.set(name, {output: opened.output});
		}
		this.files.get(name).output.write(text);
	}

	async run(command, io) {
		await this.flush();
		return this.api.run(['bash', '-c', command], io);
	}

	async close(name) {
		const file = this.files.get(name);
		const reader = this.readers.get(name);
		this.files.delete(name);
		this.readers.delete(name);
		if (file?.command !== undefined) {
			return this.run(file.command, [textInput(file.text), this.api.stdout, this.api.stderr]);
		} else if (reader?.process) {
			reader.pipe.hangUp();
			return reader.process;
		}
		return file || reader ? 0 : -1;
	}

	// --- Input ---

	// The next record of the main input, across the files in ARGV; null at the end.
	async nextMain() {
		for (;;) {
			if (this.main) {
				const next = await this.main.next(this.str(this.globals.get('RS')));
				if (next) {
					this.globals.set('RT', next.terminator);
					return next.record;
				}
				this.main = null;
			}

			const argv = this.globals.get('ARGV');
			const argc = toNumber(this.globals.get('ARGC'));
			if (this.argIndex >= argc) {
				if (this.usedFiles) {
					return null;
				}
				this.usedFiles = true;
				this.main = new Records(this.api.stdin, this.api.abort);
				this.globals.set('FILENAME', '');
				this.globals.set('FNR', 0);
				continue;
			}

			const arg = this.str(argv.get(String(this.argIndex++)));
			const assignment = arg.match(/^([A-Za-z_]\w*)=(.*)$/s);
			if (assignment) {
				this.globals.set(assignment[1], strnum(unescapeAll(assignment[2])));
			} else if (arg) {
				this.usedFiles = true;
				const opened = arg === '-' ? {input: this.api.stdin} : this.api.openRead(arg);
				if (opened.error === 'Is a directory') {
					this.api.err(`${this.api.name}: warning: command line argument \`${arg}' is a directory: skipped\n`);
					continue;
				} else if (opened.error) {
					this.token = null;
					this.globals.set('FNR', 0);
					this.fatal(`cannot open file \`${arg}' for reading: ${opened.error}`);
				}
				this.main = new Records(opened.input, this.api.abort);
				this.globals.set('FILENAME', arg);
				this.globals.set('FNR', 0);
			}
		}
	}

	count() {
		this.globals.set('NR', toNumber(this.globals.get('NR')) + 1);
		this.globals.set('FNR', toNumber(this.globals.get('FNR')) + 1);
	}

	async getline(node) {
		let text;
		if (node.type === 'pipe-getline') {
			const command = this.str(await this.evaluate(node.command));
			if (!this.readers.has(command)) {
				const pipe = new Pipe();
				await this.flush();
				// ^C ends awk too: what the command makes of it doesn't matter then.
				const process = this.api.run(['bash', '-c', command], [textInput(''), new Output(chunk => pipe.write(chunk), {drain: () => pipe.drain()}), this.api.stderr])
					.catch(() => 2)
					.finally(() => pipe.close());
				this.readers.set(command, {records: new Records(pipeInput(pipe), this.api.abort), pipe, process});
			}
			text = (await this.readers.get(command).records.next(this.str(this.globals.get('RS'))))?.record;
			if (text !== undefined) {
				this.globals.set('NR', toNumber(this.globals.get('NR')) + 1);
			}
		} else if (node.file) {
			const name = this.str(await this.evaluate(node.file));
			if (!this.readers.has(name)) {
				const opened = name === '-' ? {input: this.api.stdin} : this.api.openRead(name);
				if (opened.error) {
					this.globals.set('ERRNO', opened.error);
					return -1;
				}
				await this.flush();
				this.readers.set(name, {records: new Records(opened.input, this.api.abort)});
			}
			text = (await this.readers.get(name).records.next(this.str(this.globals.get('RS'))))?.record;
		} else {
			await this.flush();
			text = await this.nextMain();
			if (text !== null) {
				this.count();
			}
		}

		if (text === undefined || text === null) {
			return 0;
		} else if (node.target) {
			await this.store(node.target, strnum(text));
		} else {
			this.setRecord(text);
		}
		return 1;
	}

	// --- Evaluation ---

	async step() {
		if (++this.steps % STEPS === 0) {
			await this.flush();
			await this.api.tick();
			await this.api.sleep(0);
		}
	}

	async store(target, value) {
		switch (target.type) {
			case 'field':
				return this.setField(await this.fieldIndex(target.index), value);
			case 'index': {
				const array = this.array(target.array);
				array.set(await this.subscript(target.subscripts), value);
				return value;
			}
			default:
				return this.assign(target, value);
		}
	}

	// The value at an lvalue, and how to change it, with its subscript worked out once.
	async reference(target) {
		switch (target.type) {
			case 'field': {
				const index = await this.fieldIndex(target.index);
				return {get: () => this.field(index), set: value => this.setField(index, value)};
			}
			case 'index': {
				const array = this.array(target.array);
				const key = await this.subscript(target.subscripts);
				return {get: () => array.get(key), set: value => {
					array.set(key, value);
					return value;
				}};
			}
			default:
				return {get: () => this.scalar(target), set: value => this.assign(target, value)};
		}
	}

	arithmetic(op, a, b) {
		switch (op) {
			case '+':
				return a + b;
			case '-':
				return a - b;
			case '*':
				return a * b;
			case '/':
				if (b === 0) {
					this.fatal('division by zero attempted');
				}
				return a / b;
			case '%':
				if (b === 0) {
					this.fatal('division by zero attempted in `%\'');
				}
				return a % b;
			default:
				return a ** b;
		}
	}

	compare(op, a, b) {
		let order;
		if (numeric(a) && numeric(b)) {
			const x = toNumber(a);
			const y = toNumber(b);
			order = x < y ? -1 : x > y ? 1 : x === y ? 0 : NaN;
		} else {
			const x = this.str(a);
			const y = this.str(b);
			order = x < y ? -1 : x > y ? 1 : 0;
		}
		return Number({'<': order < 0, '<=': order <= 0, '==': order === 0, '!=': order !== 0, '>': order > 0, '>=': order >= 0}[op]);
	}

	async evaluate(node) {
		switch (node.type) {
			case 'number':
			case 'string':
				return node.value;
			case 'regex':
				return Number(this.regex(node.source).test(this.record.text));
			case 'grouping':
				return this.evaluate(node.expression);
			case 'var':
			case 'local':
				return this.scalar(node);
			case 'field':
				return this.field(await this.fieldIndex(node.index));
			case 'index': {
				const array = this.array(node.array);
				const key = await this.subscript(node.subscripts);
				if (!array.has(key)) {
					array.set(key, undefined);
				}
				return array.get(key);
			}
			case 'assign': {
				const ref = await this.reference(node.target);
				const value = await this.evaluate(node.value);
				if (node.op === '=') {
					return ref.set(value);
				}
				return ref.set(this.arithmetic(node.op[0], toNumber(ref.get()), toNumber(value)));
			}
			case 'increment': {
				const ref = await this.reference(node.target);
				const old = toNumber(ref.get());
				ref.set(old + (node.op === '++' ? 1 : -1));
				return node.prefix ? old + (node.op === '++' ? 1 : -1) : old;
			}
			case 'cond':
				return this.evaluate(truthy(await this.evaluate(node.test)) ? node.yes : node.no);
			case 'or':
				return Number(truthy(await this.evaluate(node.left)) || truthy(await this.evaluate(node.right)));
			case 'and':
				return Number(truthy(await this.evaluate(node.left)) && truthy(await this.evaluate(node.right)));
			case 'in':
				return Number(this.array(node.array).has(await this.subscript(node.subscripts)));
			case 'match': {
				const text = this.str(await this.evaluate(node.left));
				return Number((await this.regexOf(node.regex)).test(text) !== node.negate);
			}
			case 'compare':
				return this.compare(node.op, await this.evaluate(node.left), await this.evaluate(node.right));
			case 'concat':
				return this.str(await this.evaluate(node.left)) + this.str(await this.evaluate(node.right));
			case 'binary':
				return this.arithmetic(node.op, toNumber(await this.evaluate(node.left)), toNumber(await this.evaluate(node.right)));
			case 'unary': {
				const value = await this.evaluate(node.operand);
				return node.op === '!' ? Number(!truthy(value)) : node.op === '-' ? -toNumber(value) : toNumber(value);
			}
			case 'call':
				return this.call(node);
			case 'builtin':
				return this.builtin(node);
			default:
				return this.getline(node);
		}
	}

	async call(node) {
		const fn = this.program.functions.get(node.name);
		const caller = this.frame;
		const frame = new Array(fn.params.length).fill(undefined);
		for (const [i, arg] of node.args.entries()) {
			if (arg.type === 'var' || arg.type === 'local') {
				const value = this.slot(arg);
				frame[i] = value === undefined ? new Pending(() => {
					const saved = this.frame;
					this.frame = caller;
					try {
						return this.array(arg);
					} finally {
						this.frame = saved;
					}
				}) : value;
			} else {
				frame[i] = await this.evaluate(arg);
			}
		}
		if (this.depth >= MAX_DEPTH) {
			this.fatal(`function \`${node.name}' called too deeply (more than ${MAX_DEPTH} levels)`);
		}

		await this.step();
		this.depth++;
		this.frame = frame;
		try {
			await this.execute(fn.body);
			return undefined;
		} catch (e) {
			if (e instanceof Jump && e.kind === 'return') {
				return e.value;
			}
			throw e;
		} finally {
			this.frame = caller;
			this.depth--;
		}
	}

	async values(nodes) {
		const values = [];
		for (const node of nodes) {
			values.push(await this.evaluate(node));
		}
		return values;
	}

	async substitute(node, global) {
		const [regexNode, replacementNode, targetNode = {type: 'field', index: {type: 'number', value: 0}}] = node.args;
		const regex = await this.regexOf(regexNode, 'g');
		const replacement = this.str(await this.evaluate(replacementNode));
		const ref = await this.reference(targetNode);
		const text = this.str(ref.get());
		let result = '';
		let from = 0;
		let previous = -1;
		let count = 0;
		for (let match = regex.exec(text); match && (global || !count); match = regex.exec(text)) {
			if (!match[0]) {
				regex.lastIndex++;
				// No empty match right where the last one ended.
				if (match.index === previous) {
					continue;
				}
			}
			result += text.slice(from, match.index) + replacement.replace(/\\\\|\\&|&/g, part => (part === '&' ? match[0] : part[1]));
			from = match.index + match[0].length;
			previous = from;
			count++;
		}
		if (count) {
			ref.set(result + text.slice(from));
		}
		return count;
	}

	async builtin(node) {
		const {name, args} = node;
		const arg = async i => this.evaluate(args[i]);
		const number = async i => toNumber(await arg(i));
		const string = async i => this.str(await arg(i));
		switch (name) {
			case 'length': {
				if (!args.length) {
					return [...this.record.text].length;
				}
				const target = args[0];
				if ((target.type === 'var' || target.type === 'local') && this.slot(target) instanceof Map) {
					return this.slot(target).size;
				}
				return [...await string(0)].length;
			}
			case 'substr': {
				const chars = [...await string(0)];
				const start = Math.round(await number(1));
				const length = args.length > 2 ? Math.round(await number(2)) : Infinity;
				const from = Math.max(start, 1);
				const to = Math.min(start + length, chars.length + 1);
				return to > from ? chars.slice(from - 1, to - 1).join('') : '';
			}
			case 'index': {
				const text = await string(0);
				const at = text.indexOf(await string(1));
				return at < 0 ? 0 : [...text.slice(0, at)].length + 1;
			}
			case 'split': {
				const text = await string(0);
				const array = this.array(args[1]);
				let parts;
				if (args.length < 3) {
					parts = this.fields(text, this.str(this.globals.get('FS')), false);
				} else if (args[2].type === 'regex') {
					parts = text ? this.fields(text, `(${args[2].source})`, false) : [];
				} else {
					parts = this.fields(text, await string(2), false);
				}
				array.clear();
				parts.forEach((part, i) => array.set(String(i + 1), strnum(part)));
				return parts.length;
			}
			case 'sub':
			case 'gsub':
				return this.substitute(node, name === 'gsub');
			case 'match': {
				const text = await string(0);
				const match = (await this.regexOf(args[1])).exec(text);
				const start = match ? [...text.slice(0, match.index)].length + 1 : 0;
				const length = match ? [...match[0]].length : -1;
				this.globals.set('RSTART', start);
				this.globals.set('RLENGTH', length);
				if (args[2]) {
					const array = this.array(args[2]);
					array.clear();
					(match ?? []).forEach((group, i) => {
						if (group !== undefined) {
							array.set(String(i), strnum(group));
						}
					});
				}
				return start;
			}
			case 'sprintf': {
				const values = await this.values(args);
				return this.sprintf(this.str(values[0]), values.slice(1));
			}
			case 'sin':
			case 'cos':
			case 'exp':
			case 'sqrt':
				return Math[name](await number(0));
			case 'log':
				return Math.log(await number(0));
			case 'atan2':
				return Math.atan2(await number(0), await number(1));
			case 'int':
				return Math.trunc(await number(0));
			case 'rand':
				return this.random();
			case 'srand': {
				const previous = this.seed;
				this.seed = args.length ? await number(0) : Math.floor(Date.now() / 1000);
				this.random = this.generator(this.seed);
				return previous;
			}
			case 'tolower':
				return (await string(0)).toLowerCase();
			case 'toupper':
				return (await string(0)).toUpperCase();
			case 'system':
				return this.run(await string(0), [this.api.stdin, this.api.stdout, this.api.stderr]);
			case 'close':
				return this.close(await string(0));
			case 'fflush':
				await this.flush();
				return 0;
			case 'systime':
				return Math.floor(Date.now() / 1000);
			default: {
				const values = await this.values(args);
				const when = values.length > 1 ? new Date(toNumber(values[1]) * 1000) : new Date();
				return strftime(values.length ? this.str(values[0]) : '%a %b %e %H:%M:%S %Z %Y', when, values.length > 2 && truthy(values[2]));
			}
		}
	}

	sprintf(spec, values) {
		return format(spec, values, this.str(this.globals.get('CONVFMT')), offset => {
			this.fatal(`not enough arguments to satisfy format string\n\t\`${spec}'\n\t${' '.repeat(offset + 1)}^ ran out for this one`);
		});
	}

	// A seeded generator, so srand(n) repeats itself.
	generator(seed) {
		let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
		return () => {
			state = (state + 0x6d2b79f5) >>> 0;
			let t = state;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	// --- Statements ---

	async execute(node) {
		this.token = node.token ?? this.token;
		switch (node.type) {
			case 'block':
				for (const statement of node.body) {
					await this.execute(statement);
				}
				return;
			case 'expression':
				await this.evaluate(node.expression);
				return;
			case 'print': {
				const ofmt = this.str(this.globals.get('OFMT'));
				const values = node.args.length ? await this.values(node.args) : [strnum(this.record.text)];
				const text = values.map(value => (typeof value === 'number' ? stringOf(value, ofmt) : this.str(value))).join(this.str(this.globals.get('OFS')));
				await this.write(text + this.str(this.globals.get('ORS')), node.redirect);
				return;
			}
			case 'printf': {
				const values = await this.values(node.args);
				await this.write(this.sprintf(this.str(values[0]), values.slice(1)), node.redirect);
				return;
			}
			case 'if':
				if (truthy(await this.evaluate(node.test))) {
					await this.execute(node.yes);
				} else if (node.no) {
					await this.execute(node.no);
				}
				return;
			case 'while':
				while (truthy(await this.evaluate(node.test))) {
					if (await this.iterate(node.body)) {
						return;
					}
				}
				return;
			case 'do':
				do {
					if (await this.iterate(node.body)) {
						return;
					}
				} while (truthy(await this.evaluate(node.test)));
				return;
			case 'for':
				if (node.init) {
					await this.execute(node.init);
				}
				while (!node.test || truthy(await this.evaluate(node.test))) {
					if (await this.iterate(node.body)) {
						return;
					} else if (node.step) {
						await this.execute(node.step);
					}
				}
				return;
			case 'forin': {
				const array = this.array(node.array);
				for (const key of [...array.keys()]) {
					if (!array.has(key)) {
						continue;
					}
					this.assign(node.variable, strnum(key));
					if (await this.iterate(node.body)) {
						return;
					}
				}
				return;
			}
			case 'delete': {
				const array = this.array(node.array);
				if (node.subscripts) {
					array.delete(await this.subscript(node.subscripts));
				} else {
					array.clear();
				}
				return;
			}
			case 'exit':
				throw new Jump('exit', node.value ? toNumber(await this.evaluate(node.value)) : null);
			case 'return':
				throw new Jump('return', node.value ? await this.evaluate(node.value) : undefined);
			default:
				throw new Jump(node.type);
		}
	}

	// One time round a loop's body: true when it was broken out of.
	async iterate(body) {
		await this.step();
		try {
			await this.execute(body);
		} catch (e) {
			if (e instanceof Jump && e.kind === 'break') {
				return true;
			} else if (!(e instanceof Jump) || e.kind !== 'continue') {
				throw e;
			}
		}
		return false;
	}

	async matches(rule, index) {
		if (!rule.pattern) {
			return true;
		} else if (!rule.until) {
			return truthy(await this.evaluate(rule.pattern));
		} else if (this.ranges.get(index)) {
			this.ranges.set(index, !truthy(await this.evaluate(rule.until)));
			return true;
		} else if (truthy(await this.evaluate(rule.pattern))) {
			this.ranges.set(index, !truthy(await this.evaluate(rule.until)));
			return true;
		}
		return false;
	}

	async rules() {
		for (let text = await this.nextMain(); text !== null; text = await this.nextMain()) {
			await this.step();
			this.count();
			this.setRecord(text);
			try {
				for (const [i, rule] of this.program.rules.entries()) {
					this.token = rule.token;
					if (await this.matches(rule, i)) {
						await this.execute(rule.action ?? {type: 'print', args: [], token: this.token});
					}
				}
			} catch (e) {
				if (e instanceof Jump && e.kind === 'nextfile') {
					this.main = null;
				} else if (!(e instanceof Jump) || e.kind !== 'next') {
					throw e;
				}
			}
		}
	}

	// Runs a part of the program; true when it called exit.
	async exited(body) {
		try {
			await body();
			return false;
		} catch (e) {
			if (e instanceof Jump && e.kind !== 'exit') {
				this.fatal(`\`${e.kind}' cannot be called from a BEGIN or END rule`);
			} else if (!(e instanceof Jump)) {
				throw e;
			}
			this.status = e.value === null ? this.status : e.value;
			return true;
		}
	}

	async start() {
		for (const [name, value] of this.assignments) {
			this.globals.set(name, value);
		}
		const blocks = list => async () => {
			for (const block of list) {
				await this.execute(block);
			}
		};

		// Input is only read when there are rules for it; END runs even after an exit.
		if (!(await this.exited(blocks(this.program.begin))) && (this.program.rules.length || this.program.end.length)) {
			await this.exited(() => this.rules());
		}
		await this.exited(blocks(this.program.end));
		await this.finish();
		return this.status & 0xff;
	}

	async finish() {
		await this.flush();
		for (const name of [...this.files.keys(), ...this.readers.keys()]) {
			await this.close(name);
		}
	}
}

// --- The command ---

const awkOptions = (api, args) => {
	const sources = [];
	const assignments = [];
	let fs = null;
	const fail = message => {
		api.err(`${api.name}: ${message}\n${USAGE}`);
		return null;
	};
	let i = 0;
	for (; i < args.length; i++) {
		const arg = args[i];
		const long = arg.match(/^--([\w-]+)(?:=(.*))?$/s);
		const short = arg.match(/^-([Fvfe])(.*)$/s);
		let option;
		let value;
		if (arg === '--') {
			i++;
			break;
		} else if (long && ['version', 'help'].includes(long[1])) {
			return {[long[1]]: true};
		} else if (long) {
			option = {'field-separator': 'F', assign: 'v', file: 'f', source: 'e'}[long[1]];
			if (!option) {
				return fail(`unrecognized option '${arg}'`);
			}
			value = long[2] ?? args[++i];
		} else if (arg === '-V' || arg === '-h') {
			return {[arg === '-V' ? 'version' : 'help']: true};
		} else if (short) {
			[, option] = short;
			value = short[2] || args[++i];
		} else if (arg.startsWith('-') && arg.length > 1) {
			return fail(`invalid option -- '${arg[1]}'`);
		} else {
			break;
		}
		if (value === undefined) {
			return fail(`option requires an argument -- '${option}'`);
		} else if (option === 'F') {
			fs = value === 't' ? '\t' : unescapeAll(value);
		} else if (option === 'v') {
			const match = value.match(/^([A-Za-z_]\w*)=(.*)$/s);
			if (!match) {
				api.err(`${api.name}: fatal: \`${value}' argument to \`-v' not in \`var=value' form\n`);
				return null;
			}
			assignments.push([match[1], strnum(unescapeAll(match[2]))]);
		} else {
			sources.push({option, value});
		}
	}

	return {sources, assignments, fs, operands: args.slice(i)};
};

export const awk = async api => {
	const opts = awkOptions(api, api.args);
	if (!opts) {
		return 2;
	} else if (opts.version) {
		api.out(`${VERSION}\nCopyright (C) 1989, 1991-2025 Free Software Foundation.\n`);
		return 0;
	} else if (opts.help) {
		api.out(USAGE);
		return 0;
	}

	const {operands} = opts;
	const sources = [];
	for (const {option, value} of opts.sources) {
		if (option === 'e') {
			sources.push({text: value, label: 'cmd. line'});
			continue;
		}
		const opened = value === '-' ? {input: api.stdin} : api.openRead(value);
		if (opened.error) {
			api.err(`${api.name}: fatal: can't open source file \`${value}' for reading: ${opened.error}\n`);
			return 2;
		}
		sources.push({text: await opened.input.readAll(api.abort), label: value});
	}
	if (sources.length === 0) {
		if (operands.length === 0) {
			api.err(USAGE);
			return 2;
		}
		sources.push({text: operands.shift(), label: 'cmd. line'});
	}

	let program;
	try {
		program = parse(sources);
	} catch (e) {
		const {token} = e;
		if (e instanceof Fatal) {
			api.err(`${api.name}: ${token.label}:${token.line}: fatal: ${e.message}\n`);
			return 2;
		}
		const prefix = `${api.name}: ${token.label}:${token.line}: `;
		api.err(`${prefix}${token.source.split('\n')[token.line - 1]}\n${prefix}${' '.repeat(token.column)}^ ${e.message}\n`);
		return 1;
	}

	const assignments = opts.fs === null ? opts.assignments : [['FS', opts.fs], ...opts.assignments];
	const interpreter = new Awk(api, program, {argv: [api.name, ...operands], assignments});
	try {
		return await interpreter.start();
	} catch (e) {
		if (!(e instanceof Fatal)) {
			throw e;
		}
		await interpreter.flush();
		api.err(`${api.name}: ${interpreter.where()}fatal: ${e.message}\n`);
		return 2;
	}
};
