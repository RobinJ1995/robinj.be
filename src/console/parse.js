// Bash's grammar, enough of it for scripts typed at a prompt: lists, pipelines,
// redirections and here-documents, compound commands and functions. Words keep
// their quoting as parts, for the interpreter to expand.

export class ParseError extends Error {
	constructor(message, incomplete = false) {
		super(message);
		this.incomplete = incomplete;
	}
}

// More input would complete the command: the prompt continues with PS2.
const incomplete = () => new ParseError('syntax error: unexpected end of file', true);
const unexpected = text => new ParseError(`syntax error near unexpected token \`${text}'`);

const META = new Set([' ', '\t', '\n', '|', '&', ';', '(', ')', '<', '>']);
const OPERATORS = [';;&', ';;', ';&', ';', '&&', '&', '||', '|&', '|', '(', ')'];
const REDIRECT = /^(?:(\d+)?(<<<|<<-|<<|<>|<&|<|>>|>&|>\||>)|(&>>|&>))/;
const CLOSERS = new Set([')', ';;', ';&', ';;&']);
const COMPOUND = new Set(['group', 'subshell', 'if', 'while', 'for', 'cfor', 'case', 'arith', 'cond']);
const UNARY_TESTS = new Set(['-a', '-b', '-c', '-d', '-e', '-f', '-g', '-h', '-k', '-n', '-p', '-r', '-s', '-t', '-u', '-v', '-w', '-x', '-z', '-G', '-L', '-N', '-O', '-S']);
const BINARY_TESTS = new Set(['=', '==', '!=', '=~', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef']);

const words = (...list) => new Set(list);
const NONE = words();

const tokenText = token => {
	if (token.type === 'eof' || token.value === '\n') {
		return 'newline';
	}

	return token.type === 'word' ? token.text : token.value ?? token.op;
};

// Quote removal on raw text, for here-document delimiters.
const unquote = text => text.replace(/\\(.)|'([^']*)'|"((?:[^"\\]|\\.)*)"/gs,
	(_, escaped, single, double) => escaped ?? single ?? double.replace(/\\(.)/g, '$1'));

const ANSI_C = {a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?'};

// Splits `init; cond; step` of a C-style for loop, outside parentheses.
const splitArith = raw => {
	const parts = [''];
	let depth = 0;
	for (const c of raw) {
		depth += c === '(' ? 1 : c === ')' ? -1 : 0;
		if (c === ';' && depth === 0) {
			parts.push('');
		} else {
			parts[parts.length - 1] += c;
		}
	}

	return parts;
};

class Parser {
	constructor(src, pos = 0, aliases = null) {
		this.src = src;
		this.pos = pos;
		this.heredocs = [];
		this.ahead = null;
		this.aliases = aliases;
		this.expanding = [];
	}

	// --- Characters to tokens ---

	skipBlanks() {
		for (;;) {
			const c = this.src[this.pos];
			if (c === ' ' || c === '\t') {
				this.pos++;
			} else if (c === '\\' && this.src[this.pos + 1] === '\n') {
				this.pos += 2;
			} else if (c === '#') {
				while (this.pos < this.src.length && this.src[this.pos] !== '\n') {
					this.pos++;
				}
			} else {
				return;
			}
		}
	}

	lex(mode) {
		this.skipBlanks();
		const start = this.pos;
		const rest = this.src.slice(start);
		if (start >= this.src.length) {
			if (this.heredocs.length) {
				throw incomplete();
			}
			return {type: 'eof', start, end: start};
		} else if (rest[0] === '\n') {
			this.pos++;
			this.readHeredocs();
			return {type: 'op', value: '\n', start, end: this.pos};
		} else if (mode === 'cond' && (rest[0] === '<' || rest[0] === '>')) {
			this.pos++;
			return {type: 'word', parts: [{t: 'lit', v: rest[0]}], text: rest[0], start, end: this.pos};
		}

		const redirect = mode !== 'regex' && rest.match(REDIRECT);
		if (redirect && mode !== 'cond') {
			this.pos += redirect[0].length;
			const op = redirect[2] ?? redirect[3];
			return {type: 'redir', op, fd: redirect[1] === undefined ? null : Number(redirect[1]), start, end: this.pos};
		}

		const operator = mode !== 'regex' || !'()|'.includes(rest[0]) ? OPERATORS.find(op => rest.startsWith(op)) : null;
		if (operator) {
			this.pos += operator.length;
			return {type: 'op', value: operator, start, end: this.pos};
		}

		return this.readWord(start, mode);
	}

	readWord(start, mode) {
		const src = this.src;
		const parts = [];
		let lit = '';
		let litStart = this.pos;
		let depth = 0;
		const flush = (end = this.pos) => {
			if (lit) {
				parts.push({t: 'lit', v: lit, start: litStart, end});
			}
			lit = '';
		};
		const push = (part, from) => {
			flush(from);
			parts.push({...part, start: from, end: this.pos});
			litStart = this.pos;
		};

		while (this.pos < src.length) {
			const c = src[this.pos];
			const from = this.pos;
			if (mode === 'regex' && (c === '(' || c === '|' || (c === ')' && depth > 0))) {
				depth += c === '(' ? 1 : c === ')' ? -1 : 0;
				lit += c;
				this.pos++;
			} else if (META.has(c)) {
				break;
			} else if (c === '\\') {
				if (this.pos + 1 >= src.length) {
					throw incomplete();
				}
				this.pos += 2;
				if (src[from + 1] !== '\n') {
					push({t: 'q', v: src[from + 1]}, from);
				}
			} else if (c === "'") {
				const end = src.indexOf("'", this.pos + 1);
				if (end < 0) {
					throw incomplete();
				}
				this.pos = end + 1;
				push({t: 'q', v: src.slice(from + 1, end)}, from);
			} else if (c === '"') {
				this.pos++;
				const inner = this.readQuoted(true);
				push({t: 'dq', parts: inner}, from);
			} else if (c === '$' || c === '`') {
				const part = this.readDollar(false);
				if (part) {
					push(part, from);
				} else {
					lit += c;
					this.pos++;
				}
			} else {
				lit += c;
				this.pos++;
			}
		}
		flush();

		const token = {type: 'word', parts, start, end: this.pos, text: src.slice(start, this.pos)};
		if (mode === 'normal' && src[this.pos] === '(' && /^[A-Za-z_]\w*\+?=$/.test(token.text)) {
			this.pos++;
			token.array = this.readArray();
			token.end = this.pos;
		}

		return token;
	}

	// The elements of `name=(...)`.
	readArray() {
		const elements = [];
		for (;;) {
			this.skipBlanks();
			const c = this.src[this.pos];
			if (c === undefined) {
				throw incomplete();
			} else if (c === ')') {
				this.pos++;
				return elements;
			} else if (c === '\n') {
				this.pos++;
			} else if (META.has(c)) {
				throw unexpected(c);
			} else {
				elements.push(this.readWord(this.pos, 'word').parts);
			}
		}
	}

	// Inside double quotes (`quotes`), or a here-document's body (not).
	readQuoted(quotes) {
		const src = this.src;
		const parts = [];
		let lit = '';
		let litStart = this.pos;
		const flush = (end = this.pos) => {
			if (lit) {
				parts.push({t: 'q', v: lit, start: litStart, end});
			}
			lit = '';
		};

		for (;;) {
			if (this.pos >= src.length) {
				if (quotes) {
					throw incomplete();
				}
				break;
			}

			const c = src[this.pos];
			const from = this.pos;
			if (quotes && c === '"') {
				this.pos++;
				break;
			} else if (c === '\\') {
				const next = src[this.pos + 1];
				if (next === undefined) {
					if (quotes) {
						throw incomplete();
					}
					lit += c;
					this.pos++;
				} else if (next === '\n') {
					this.pos += 2;
				} else if ('$`\\'.includes(next) || (quotes && next === '"')) {
					lit += next;
					this.pos += 2;
				} else {
					lit += c;
					this.pos++;
				}
			} else if (c === '$' || c === '`') {
				const part = this.readDollar(true);
				if (part) {
					flush(from);
					parts.push({...part, start: from, end: this.pos});
					litStart = this.pos;
				} else {
					lit += c;
					this.pos++;
				}
			} else {
				lit += c;
				this.pos++;
			}
		}
		flush();

		return parts;
	}

	// `$...` or a backquote at this.pos; null when the `$` is just a dollar sign.
	readDollar(quoted) {
		const src = this.src;
		const next = src[this.pos + 1];
		if (src[this.pos] === '`') {
			let body = '';
			let i = this.pos + 1;
			for (; src[i] !== '`'; i++) {
				if (i >= src.length) {
					throw incomplete();
				} else if (src[i] === '\\' && '$`\\'.includes(src[i + 1])) {
					i++;
				}
				body += src[i];
			}
			this.pos = i + 1;
			return {t: 'cmd', program: parse(body, this.aliases)};
		} else if (next === '(' && src[this.pos + 2] === '(') {
			this.pos += 3;
			return {t: 'arith', raw: this.readArith()};
		} else if (next === '(') {
			const sub = new Parser(src, this.pos + 2, this.aliases);
			const program = sub.compoundList(NONE);
			sub.expectOp(')');
			// Less whatever its aliases added to its copy of the text.
			this.pos = sub.pos - (sub.src.length - src.length);
			return {t: 'cmd', program};
		} else if (next === '{') {
			this.pos += 2;
			return this.readBraceParam();
		} else if (next === "'" && !quoted) {
			this.pos += 2;
			return {t: 'q', v: this.readAnsiC()};
		} else if (next === '"' && !quoted) {
			this.pos += 2;
			return {t: 'dq', parts: this.readQuoted(true)};
		}

		const name = src.slice(this.pos + 1).match(/^(?:[A-Za-z_]\w*|[0-9@*#?$!-])/);
		if (!name) {
			return null;
		}
		this.pos += 1 + name[0].length;
		return {t: 'param', name: name[0]};
	}

	readAnsiC() {
		let text = '';
		for (;;) {
			const c = this.src[this.pos];
			if (c === undefined) {
				throw incomplete();
			} else if (c === "'") {
				this.pos++;
				return text;
			} else if (c !== '\\') {
				text += c;
				this.pos++;
				continue;
			}

			const escape = this.src.slice(this.pos + 1).match(/^(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|([0-7]{1,3})|c(.)|(.))/s);
			if (!escape) {
				throw incomplete();
			}
			this.pos += 1 + escape[0].length;
			const [, hex, unicode, octal, control, other] = escape;
			if (hex || unicode) {
				text += String.fromCodePoint(parseInt(hex ?? unicode, 16));
			} else if (octal) {
				text += String.fromCharCode(parseInt(octal, 8));
			} else if (control) {
				text += String.fromCharCode(control.toUpperCase().charCodeAt(0) & 31);
			} else {
				text += ANSI_C[other] ?? `\\${other}`;
			}
		}
	}

	// Up to the `))` closing `$((` or `((`.
	readArith() {
		const start = this.pos;
		let depth = 0;
		for (;;) {
			const c = this.src[this.pos];
			if (c === undefined) {
				throw incomplete();
			} else if (c === '(') {
				depth++;
			} else if (c === ')' && depth > 0) {
				depth--;
			} else if (c === ')') {
				if (this.src[this.pos + 1] !== ')') {
					throw unexpected(')');
				}
				this.pos += 2;
				return this.src.slice(start, this.pos - 2);
			}
			this.pos++;
		}
	}

	// `${...}`, from just after the brace.
	readBraceParam() {
		const src = this.src;
		const start = this.pos;
		const rest = () => src.slice(this.pos);
		const part = {t: 'param'};
		const bad = () => {
			const end = src.indexOf('}', this.pos);
			if (end < 0) {
				throw incomplete();
			}
			this.pos = end + 1;
			return {t: 'param', bad: `\${${src.slice(start, end)}}`};
		};

		if (/^#(?:[A-Za-z_]|\d|[@*?$!-])/.test(rest()) && !rest().startsWith('#}')) {
			part.length = true;
			this.pos++;
		} else if (/^![A-Za-z_]/.test(rest())) {
			part.indirect = true;
			this.pos++;
		}

		const name = rest().match(/^(?:[A-Za-z_]\w*|\d+|[@*#?$!-])/);
		if (!name) {
			return bad();
		}
		part.name = name[0];
		this.pos += name[0].length;

		if (src[this.pos] === '[') {
			const end = src.indexOf(']', this.pos);
			if (end < 0) {
				throw incomplete();
			}
			part.index = src.slice(this.pos + 1, end);
			this.pos = end + 1;
		}

		if (src[this.pos] === '}') {
			this.pos++;
			return part;
		} else if (this.pos >= src.length) {
			throw incomplete();
		} else if (part.length) {
			return bad();
		}

		const op = rest().match(/^(?::[-=+?]|[-=+?]|##|#|%%|%|\/\/|\/#|\/%|\/|\^\^|\^|,,|,|:)/);
		if (!op) {
			return bad();
		}
		part.op = op[0];
		this.pos += op[0].length;

		if (part.op === ':') {
			const end = this.findBrace();
			[part.offset, part.count] = src.slice(this.pos, end).split(':');
			this.pos = end + 1;
			return part;
		} else if (part.op.startsWith('/')) {
			part.pattern = this.readOperand('/');
			part.replacement = src[this.pos] === '/' ? (this.pos++, this.readOperand('}')) : [];
		} else {
			part.arg = this.readOperand('}');
		}
		this.pos++;

		return part;
	}

	findBrace() {
		let depth = 0;
		for (let i = this.pos; i < this.src.length; i++) {
			if (this.src[i] === '{') {
				depth++;
			} else if (this.src[i] === '}' && depth-- === 0) {
				return i;
			}
		}

		throw incomplete();
	}

	// The word after an operator in `${...}`: quotes work, spaces are literal.
	readOperand(stop) {
		const src = this.src;
		const parts = [];
		let lit = '';
		let depth = 0;
		const flush = () => {
			if (lit) {
				parts.push({t: 'lit', v: lit});
			}
			lit = '';
		};

		for (;;) {
			const c = src[this.pos];
			if (c === undefined) {
				throw incomplete();
			} else if ((c === '}' && depth === 0) || (c === stop && stop === '/')) {
				break;
			} else if (c === '\\' && this.pos + 1 < src.length) {
				flush();
				parts.push({t: 'q', v: src[this.pos + 1]});
				this.pos += 2;
			} else if (c === "'") {
				const end = src.indexOf("'", this.pos + 1);
				if (end < 0) {
					throw incomplete();
				}
				flush();
				parts.push({t: 'q', v: src.slice(this.pos + 1, end)});
				this.pos = end + 1;
			} else if (c === '"') {
				flush();
				this.pos++;
				parts.push({t: 'dq', parts: this.readQuoted(true)});
			} else if (c === '$' || c === '`') {
				const part = this.readDollar(false);
				if (part) {
					flush();
					parts.push(part);
				} else {
					lit += c;
					this.pos++;
				}
			} else {
				depth += c === '{' ? 1 : c === '}' ? -1 : 0;
				lit += c;
				this.pos++;
			}
		}
		flush();

		return parts;
	}

	readHeredocs() {
		for (const doc of this.heredocs) {
			let body = '';
			for (;;) {
				if (this.pos >= this.src.length) {
					throw incomplete();
				}
				const newline = this.src.indexOf('\n', this.pos);
				const end = newline < 0 ? this.src.length : newline;
				let line = this.src.slice(this.pos, end);
				this.pos = Math.min(end + 1, this.src.length);
				if (doc.strip) {
					line = line.replace(/^\t+/, '');
				}
				if (line === doc.delimiter) {
					break;
				}
				body += `${line}\n`;
			}
			doc.body = doc.quoted ? [{t: 'q', v: body}] : new Parser(body, 0, this.aliases).readQuoted(false);
		}
		this.heredocs = [];
	}

	// --- Tokens to commands ---

	peek(mode = 'normal') {
		if (this.ahead && (this.ahead.mode === mode || this.ahead.type === 'eof' || this.ahead.value === '\n')) {
			return this.ahead;
		} else if (this.ahead) {
			this.pos = this.ahead.start;
		}

		this.ahead = {...this.lex(mode), mode};
		return this.ahead;
	}

	next(mode) {
		const token = this.peek(mode);
		this.ahead = null;
		return token;
	}

	isWord(token, ...values) {
		return token.type === 'word' && values.includes(token.text);
	}

	isOp(token, ...values) {
		return token.type === 'op' && values.includes(token.value);
	}

	fail(token) {
		throw token.type === 'eof' ? incomplete() : unexpected(tokenText(token));
	}

	expectWord(...values) {
		const token = this.peek();
		if (!this.isWord(token, ...values)) {
			this.fail(token);
		}
		return this.next();
	}

	expectOp(value, mode) {
		const token = this.peek(mode);
		if (!this.isOp(token, value)) {
			this.fail(token);
		}
		return this.next(mode);
	}

	skipNewlines() {
		while (this.isOp(this.peek(), '\n')) {
			this.next();
		}
	}

	program() {
		const list = this.compoundList(NONE);
		const token = this.peek();
		if (token.type !== 'eof') {
			this.fail(token);
		}

		return list;
	}

	// Commands separated by `;`, `&` or newlines, until one of `stops`.
	compoundList(stops) {
		const items = [];
		for (;;) {
			this.skipNewlines();
			const token = this.peek();
			if (token.type === 'eof' || (token.type === 'op' && CLOSERS.has(token.value)) || (token.type === 'word' && stops.has(token.text))) {
				break;
			}

			const node = this.andOr();
			const separator = this.peek();
			const item = {node, async: false, text: this.src.slice(token.start, separator.start).trim()};
			items.push(item);
			if (this.isOp(separator, ';', '&')) {
				this.next();
				item.async = separator.value === '&';
			} else if (!this.isOp(separator, '\n')) {
				break;
			}
		}

		return {type: 'list', items};
	}

	requiredList(stops) {
		const list = this.compoundList(stops);
		if (list.items.length === 0) {
			this.fail(this.peek());
		}

		return list;
	}

	andOr() {
		const first = this.pipeline();
		const rest = [];
		while (this.isOp(this.peek(), '&&', '||')) {
			const op = this.next().value;
			this.skipNewlines();
			rest.push({op, pipeline: this.pipeline()});
		}

		return rest.length ? {type: 'andor', first, rest} : first;
	}

	pipeline() {
		const negate = this.isWord(this.peek(), '!');
		if (negate) {
			this.next();
		}

		const commands = [this.command()];
		const stderr = [];
		while (this.isOp(this.peek(), '|', '|&')) {
			stderr.push(this.next().value === '|&');
			this.skipNewlines();
			commands.push(this.command());
		}

		return commands.length === 1 && !negate ? commands[0] : {type: 'pipeline', commands, stderr, negate};
	}

	command() {
		const token = this.peek();
		if (token.type === 'op' && token.value === '(' && this.src[token.end] === '(') {
			this.ahead = null;
			this.pos = token.end + 1;
			return this.withRedirects({type: 'arith', raw: this.readArith()});
		} else if (this.isOp(token, '(')) {
			this.next();
			const body = this.compoundList(NONE);
			this.expectOp(')');
			return this.withRedirects({type: 'subshell', body});
		} else if (token.type !== 'word' && token.type !== 'redir') {
			this.fail(token);
		}

		switch (token.type === 'word' && token.text) {
			case '{': {
				this.next();
				const body = this.requiredList(words('}'));
				this.expectWord('}');
				return this.withRedirects({type: 'group', body});
			}
			case 'if':
				return this.withRedirects(this.ifClause());
			case 'while':
			case 'until':
				return this.withRedirects(this.whileClause());
			case 'for':
				return this.withRedirects(this.forClause());
			case 'case':
				return this.withRedirects(this.caseClause());
			case 'function':
				return this.functionDefinition(true);
			case '[[':
				return this.withRedirects(this.condCommand());
			case 'then':
			case 'elif':
			case 'else':
			case 'fi':
			case 'do':
			case 'done':
			case 'esac':
			case '}':
				throw unexpected(token.text);
			default:
				break;
		}

		if (this.expandAlias(token)) {
			return this.command();
		} else if (token.type === 'word' && /^[^$`'"\\=]+$/.test(token.text)) {
			const saved = {pos: this.pos, ahead: this.ahead};
			this.next();
			if (this.isOp(this.peek(), '(')) {
				this.pos = saved.pos;
				this.ahead = saved.ahead;
				return this.functionDefinition(false);
			}
			this.pos = saved.pos;
			this.ahead = saved.ahead;
		}

		return this.simpleCommand();
	}

	// An unquoted alias in command position is replaced by its text, which is
	// then read as if typed; an alias isn't expanded again within its own text.
	expandAlias(token) {
		const name = token.type === 'word' && token.parts.length === 1 && token.parts[0].t === 'lit' ? token.text : null;
		const text = name === null ? undefined : this.aliases?.get(name);
		this.expanding = this.expanding.filter(alias => alias.end > token.start);
		if (text === undefined || this.expanding.some(alias => alias.name === name)) {
			return false;
		}

		for (const alias of this.expanding) {
			alias.end += text.length - (token.end - token.start);
		}
		this.expanding.push({name, end: token.start + text.length});
		this.src = this.src.slice(0, token.start) + text + this.src.slice(token.end);
		this.pos = token.start;
		this.ahead = null;
		return true;
	}

	functionDefinition(keyword) {
		const start = this.peek().start;
		if (keyword) {
			this.next();
		}
		const name = this.next();
		if (name.type !== 'word') {
			this.fail(name);
		}
		if (this.isOp(this.peek(), '(')) {
			this.next();
			this.expectOp(')');
		}
		this.skipNewlines();
		const body = this.command();
		if (!COMPOUND.has(body.type)) {
			throw unexpected(tokenText(this.peek()));
		}

		const end = this.ahead ? this.ahead.start : this.pos;
		return {type: 'function', name: name.text, body, text: this.src.slice(start, end).trim()};
	}

	withRedirects(node) {
		node.redirs = [];
		while (this.peek().type === 'redir') {
			node.redirs.push(this.redirect(this.next()));
		}

		return node;
	}

	redirect(token) {
		const target = this.peek();
		if (target.type !== 'word') {
			throw unexpected(tokenText(target));
		}
		this.next();

		const redirect = {fd: token.fd, op: token.op, target: target.parts, text: target.text};
		if (token.op === '<<' || token.op === '<<-') {
			redirect.heredoc = {
				delimiter: unquote(target.text),
				quoted: target.parts.some(part => part.t !== 'lit'),
				strip: token.op === '<<-',
				body: null,
			};
			this.heredocs.push(redirect.heredoc);
		}

		return redirect;
	}

	simpleCommand() {
		const node = {type: 'simple', assigns: [], words: [], redirs: []};
		for (;;) {
			const token = this.peek();
			if (token.type === 'redir') {
				node.redirs.push(this.redirect(this.next()));
				continue;
			} else if (token.type !== 'word') {
				break;
			} else if (node.words.length === 0 && !assignmentOf(token) && this.expandAlias(token)) {
				continue;
			}

			this.next();
			const assignment = node.words.length === 0 && assignmentOf(token);
			if (assignment) {
				node.assigns.push(assignment);
			} else {
				node.words.push(token.parts);
			}
		}

		if (!node.assigns.length && !node.words.length && !node.redirs.length) {
			this.fail(this.peek());
		}

		return node;
	}

	ifClause() {
		this.next();
		const clauses = [];
		let otherwise = null;
		for (;;) {
			const condition = this.requiredList(words('then'));
			this.expectWord('then');
			const body = this.requiredList(words('elif', 'else', 'fi'));
			clauses.push({condition, body});
			const keyword = this.expectWord('elif', 'else', 'fi').text;
			if (keyword === 'else') {
				otherwise = this.requiredList(words('fi'));
				this.expectWord('fi');
			}
			if (keyword !== 'elif') {
				return {type: 'if', clauses, otherwise};
			}
		}
	}

	whileClause() {
		const until = this.next().text === 'until';
		const condition = this.requiredList(words('do'));
		this.expectWord('do');
		const body = this.requiredList(words('done'));
		this.expectWord('done');

		return {type: 'while', until, condition, body};
	}

	loopBody() {
		if (this.isOp(this.peek(), ';')) {
			this.next();
		}
		this.skipNewlines();
		this.expectWord('do');
		const body = this.requiredList(words('done'));
		this.expectWord('done');

		return body;
	}

	forClause() {
		this.next();
		const token = this.peek();
		if (this.isOp(token, '(') && this.src[token.end] === '(') {
			this.ahead = null;
			this.pos = token.end + 1;
			const sections = splitArith(this.readArith());
			if (sections.length !== 3) {
				throw unexpected('((');
			}
			const [init, condition, step] = sections;
			return {type: 'cfor', init, condition, step, body: this.loopBody()};
		} else if (token.type !== 'word') {
			this.fail(token);
		}

		const name = this.next().text;
		if (!/^[A-Za-z_]\w*$/.test(name)) {
			throw new ParseError(`\`${name}': not a valid identifier`);
		}

		let items = null;
		this.skipNewlines();
		if (this.isWord(this.peek(), 'in')) {
			this.next();
			items = [];
			while (this.peek().type === 'word') {
				items.push(this.next().parts);
			}
			const separator = this.peek();
			if (!this.isOp(separator, ';', '\n')) {
				this.fail(separator);
			}
			this.next();
		}

		return {type: 'for', name, items, body: this.loopBody()};
	}

	caseClause() {
		this.next();
		const subject = this.next();
		if (subject.type !== 'word') {
			this.fail(subject);
		}
		this.skipNewlines();
		this.expectWord('in');

		const items = [];
		for (;;) {
			this.skipNewlines();
			if (this.isWord(this.peek(), 'esac')) {
				this.next();
				return {type: 'case', subject: subject.parts, items};
			} else if (this.isOp(this.peek(), '(')) {
				this.next();
			}

			const patterns = [];
			for (;;) {
				const pattern = this.next();
				if (pattern.type !== 'word') {
					this.fail(pattern);
				}
				patterns.push(pattern.parts);
				if (!this.isOp(this.peek(), '|')) {
					break;
				}
				this.next();
			}
			this.expectOp(')');

			const body = this.compoundList(words('esac'));
			const end = this.peek();
			let terminator = ';;';
			if (this.isOp(end, ';;', ';&', ';;&')) {
				terminator = this.next().value;
			} else if (!this.isWord(end, 'esac')) {
				this.fail(end);
			}
			items.push({patterns, body, terminator});
		}
	}

	condCommand() {
		this.next();
		const expression = this.condOr();
		const end = this.next('cond');
		if (!this.isWord(end, ']]')) {
			this.fail(end);
		}

		return {type: 'cond', expression};
	}

	condOr() {
		let left = this.condAnd();
		while (this.isOp(this.peek('cond'), '||')) {
			this.next('cond');
			left = {op: '||', left, right: this.condAnd()};
		}

		return left;
	}

	condAnd() {
		let left = this.condNot();
		while (this.isOp(this.peek('cond'), '&&')) {
			this.next('cond');
			left = {op: '&&', left, right: this.condNot()};
		}

		return left;
	}

	condNot() {
		if (this.isWord(this.peek('cond'), '!')) {
			this.next('cond');
			return {op: '!', operand: this.condNot()};
		}

		return this.condPrimary();
	}

	condPrimary() {
		const token = this.next('cond');
		if (this.isOp(token, '(')) {
			const inner = this.condOr();
			this.expectOp(')', 'cond');
			return inner;
		} else if (token.type !== 'word' || token.text === ']]') {
			this.fail(token);
		}

		const after = this.peek('cond');
		if (UNARY_TESTS.has(token.text) && after.type === 'word' && after.text !== ']]') {
			this.next('cond');
			return {op: 'unary', test: token.text, operand: after.parts};
		} else if (after.type === 'word' && BINARY_TESTS.has(after.text)) {
			this.next('cond');
			const right = this.next(after.text === '=~' ? 'regex' : 'cond');
			if (right.type !== 'word') {
				this.fail(right);
			}
			return {op: 'binary', test: after.text, left: token.parts, right: right.parts};
		}

		return {op: 'string', operand: token.parts};
	}
}

// `name=value`, `name+=value`, `name[index]=value` or `name=(...)`.
const assignmentOf = token => {
	const match = token.text.match(/^([A-Za-z_]\w*)(?:\[([^\]]*)\])?(\+?)=/);
	if (!match) {
		return null;
	}

	// The value is what follows the `=`, which is always in an unquoted part.
	const at = token.start + match[0].length;
	const value = [];
	for (const part of token.parts) {
		if (part.end <= at) {
			continue;
		} else if (part.start < at) {
			value.push({t: 'lit', v: part.v.slice(at - part.start)});
		} else {
			value.push(part);
		}
	}

	return {name: match[1], index: match[2], append: match[3] === '+', value, array: token.array};
};

// `aliases`, a Map, are expanded as the source is read, as an interactive bash does.
export const parse = (source, aliases = null) => new Parser(source, 0, aliases).program();

// Just the expansions in some text, as in an unquoted here-document: for `$(( ))`.
export const parseExpansions = text => new Parser(text).readQuoted(false);
