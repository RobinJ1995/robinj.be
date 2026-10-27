// Word expansion, in bash's order: braces, tilde, parameters / command
// substitution / arithmetic, field splitting, pathname expansion, quote removal.
//
// `env` is the interpreter's side of it: get(name), getArray(name),
// set(name, value), positional(), ifs(), arith(text), substitute(program),
// glob(pattern) and home(user).

export class ExpansionError extends Error {}

const MAX_BRACE_RESULTS = 100_000;
const PLACEHOLDER = 0xe000;

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
export const escapeGlob = text => text.replace(/[*?[\]\\]/g, '\\$&');
export const hasGlob = pattern => /(^|[^\\])(\\\\)*[*?[]/.test(pattern);

const CLASSES = {
	alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s',
	blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9a-fA-F', word: '\\w',
};

// A glob pattern as a regular expression's source. In pathnames, wildcards stop at `/`.
export const patternSource = (pattern, pathname = false) => {
	let source = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === '\\') {
			i++;
			source += escapeRegExp(pattern[i] ?? '\\');
		} else if (c === '*') {
			source += pathname ? '[^/]*' : '[^]*';
		} else if (c === '?') {
			source += pathname ? '[^/]' : '[^]';
		} else if (c === '[') {
			let j = i + 1;
			const negate = pattern[j] === '!' || pattern[j] === '^';
			j += negate ? 1 : 0;
			let set = '';
			if (pattern[j] === ']') {
				set += '\\]';
				j++;
			}
			while (j < pattern.length && pattern[j] !== ']') {
				const named = pattern.slice(j).match(/^\[:(\w+):\]/);
				if (named) {
					set += CLASSES[named[1]] ?? '';
					j += named[0].length;
				} else if (pattern[j] === '\\') {
					set += escapeRegExp(pattern[j + 1] ?? '');
					j += 2;
				} else {
					set += pattern[j] === '-' ? '-' : escapeRegExp(pattern[j]);
					j++;
				}
			}
			if (j >= pattern.length) {
				source += '\\[';
			} else {
				source += `[${negate ? '^' : ''}${set}]`;
				i = j;
			}
		} else {
			source += escapeRegExp(c);
		}
	}

	return source;
};

export const matchPattern = (pattern, text) => new RegExp(`^(?:${patternSource(pattern)})$`).test(text);

// --- Brace expansion ---

const sequence = body => {
	const numeric = body.match(/^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/);
	const letters = body.match(/^([A-Za-z])\.\.([A-Za-z])(?:\.\.(-?\d+))?$/);
	if (!numeric && !letters) {
		return null;
	}

	const [, from, to, by] = numeric ?? letters;
	const start = numeric ? Number(from) : from.charCodeAt(0);
	const end = numeric ? Number(to) : to.charCodeAt(0);
	const step = Math.abs(Number(by ?? 1)) || 1;
	const count = Math.floor(Math.abs(end - start) / step) + 1;
	if (count > MAX_BRACE_RESULTS) {
		throw new ExpansionError(`brace expansion: failed to allocate memory for ${count} elements`);
	}

	const padded = numeric && (/^-?0\d/.test(from) || /^-?0\d/.test(to));
	const width = Math.max(from.length, to.length);
	const direction = end >= start ? 1 : -1;
	return Array.from({length: count}, (_, i) => {
		const value = start + i * step * direction;
		if (!numeric) {
			return String.fromCharCode(value);
		}
		return padded ? `${value < 0 ? '-' : ''}${String(Math.abs(value)).padStart(width - (value < 0 ? 1 : 0), '0')}` : String(value);
	});
};

const expandBraces = text => {
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '{') {
			continue;
		}

		let depth = 0;
		let close = -1;
		const commas = [];
		for (let j = i; j < text.length && close < 0; j++) {
			if (text[j] === '{') {
				depth++;
			} else if (text[j] === '}' && --depth === 0) {
				close = j;
			} else if (text[j] === ',' && depth === 1) {
				commas.push(j);
			}
		}
		if (close < 0) {
			continue;
		}

		let alternatives = sequence(text.slice(i + 1, close));
		if (commas.length) {
			alternatives = [...commas, close].map((at, k) => text.slice(k ? commas[k - 1] + 1 : i + 1, at));
		}
		if (!alternatives) {
			continue;
		}

		const prefix = text.slice(0, i);
		const suffix = text.slice(close + 1);
		const results = [];
		for (const alternative of alternatives) {
			results.push(...expandBraces(prefix + alternative + suffix));
			if (results.length > MAX_BRACE_RESULTS) {
				throw new ExpansionError(`brace expansion: failed to allocate memory for ${results.length} elements`);
			}
		}
		return results;
	}

	return [text];
};

// Brace expansion only looks at unquoted text: everything else stands in as a placeholder.
const braceExpand = parts => {
	if (!parts.some(part => part.t === 'lit' && part.v.includes('{'))) {
		return [parts];
	}

	const text = parts.map((part, i) => (part.t === 'lit' ? part.v : String.fromCharCode(PLACEHOLDER + i))).join('');
	return expandBraces(text).map(expanded => {
		const result = [];
		let lit = '';
		for (const c of expanded) {
			const index = c.charCodeAt(0) - PLACEHOLDER;
			if (index >= 0 && index < parts.length) {
				if (lit) {
					result.push({t: 'lit', v: lit});
				}
				lit = '';
				result.push(parts[index]);
			} else {
				lit += c;
			}
		}
		if (lit) {
			result.push({t: 'lit', v: lit});
		}

		return result;
	});
};

const tilde = (parts, env) => {
	const first = parts[0];
	const match = first?.t === 'lit' && first.v.match(/^~([A-Za-z_][\w-]*|[+-])?(?=\/|$)/);
	if (!match || (match[0] === first.v && parts.length > 1 && parts[1].t !== 'lit')) {
		return parts;
	}

	const path = env.home(match[1] ?? '');
	if (path === undefined) {
		return parts;
	}

	return [{t: 'q', v: path}, {t: 'lit', v: first.v.slice(match[0].length)}, ...parts.slice(1)];
};

// --- Fields ---

class Fields {
	constructor() {
		this.fields = [];
		this.current = null;
	}

	field() {
		this.current ??= {segments: [], quoted: false};
		return this.current;
	}

	add(text, quoted) {
		const field = this.field();
		field.segments.push({text, quoted});
		field.quoted ||= quoted;
	}

	end(keep = false) {
		if (keep) {
			this.field().keep = true;
		}
		if (this.current) {
			this.fields.push(this.current);
		}
		this.current = null;
	}

	// An unquoted expansion's value, split on IFS.
	split(value, ifs) {
		if (ifs === '') {
			this.add(value, false);
			return;
		}

		const white = [...ifs].filter(c => /\s/.test(c)).map(escapeRegExp).join('');
		const other = [...ifs].filter(c => !/\s/.test(c)).map(escapeRegExp).join('');
		const separator = new RegExp([other && `[${white}]*[${other}][${white}]*`, white && `[${white}]+`].filter(Boolean).join('|'), 'g');
		const hard = other && new RegExp(`[${other}]`);
		let from = 0;
		for (const match of value.matchAll(separator)) {
			if (match.index > from) {
				this.add(value.slice(from, match.index), false);
			}
			// A separator like `:` delimits a field even when it's empty.
			this.end(Boolean(hard && hard.test(match[0])));
			from = match.index + match[0].length;
		}
		if (from < value.length) {
			this.add(value.slice(from), false);
		}
	}
}

const caseChange = (op, value) => {
	switch (op) {
		case '^^': return value.toUpperCase();
		case ',,': return value.toLowerCase();
		case '^': return value.charAt(0).toUpperCase() + value.slice(1);
		default: return value.charAt(0).toLowerCase() + value.slice(1);
	}
};

const removeAffix = (op, pattern, value) => {
	const regex = new RegExp(`^(?:${patternSource(pattern)})$`);
	const lengths = [...Array(value.length + 1).keys()];
	if (op === '#' || op === '##') {
		const length = (op === '#' ? lengths : lengths.reverse()).find(n => regex.test(value.slice(0, n)));
		return length === undefined ? value : value.slice(length);
	}

	const start = (op === '%' ? lengths.reverse() : lengths).find(n => regex.test(value.slice(n)));
	return start === undefined ? value : value.slice(0, start);
};

const replace = (op, pattern, replacement, value) => {
	if (pattern === '') {
		return value;
	}

	const source = patternSource(pattern);
	const anchored = {'/#': `^(?:${source})`, '/%': `(?:${source})$`}[op] ?? source;
	return value.replace(new RegExp(anchored, op === '//' ? 'g' : ''), () => replacement);
};

const parameter = async (part, env, quoted) => {
	if (part.bad) {
		throw new ExpansionError(`${part.bad}: bad substitution`);
	}

	let {name} = part;
	if (part.indirect) {
		name = env.get(name) ?? '';
		if (!/^(?:[A-Za-z_]\w*|\d+|[@*#?$!-])$/.test(name)) {
			throw new ExpansionError(`${name}: invalid indirect expansion`);
		}
	}

	const all = part.index === '@' || part.index === '*';
	const list = name === '@' || name === '*' || all;
	const star = name === '*' || part.index === '*';
	let values;
	if (name === '@' || name === '*') {
		values = env.positional();
	} else if (all) {
		values = env.getArray(name);
	} else if (part.index !== undefined) {
		const value = env.getArray(name)?.[Number(await env.arith(part.index))];
		values = value === undefined ? undefined : [value];
	} else {
		const value = env.get(name);
		values = value === undefined ? undefined : [value];
	}

	if (part.length) {
		return {values: [String(list ? (values ?? []).length : [...(values?.[0] ?? '')].length)]};
	}

	const joined = (values ?? []).join(star && quoted ? (env.ifs()[0] ?? '') : ' ');
	const result = list => (star && quoted ? {values: [list.join(env.ifs()[0] ?? '')]} : {values: list, multi: true});
	const current = () => (list ? result(values ?? []) : {values: values ?? ['']});
	const missing = part.op?.length === 2 && part.op[0] === ':' ? joined === '' : values === undefined || (list && values.length === 0);
	const operand = async () => env.expandString(part.arg);

	switch (part.op?.replace(/^:(?=.)/, '')) {
		case undefined:
			return current();
		case '-':
			return missing ? {values: [await operand()]} : current();
		case '=': {
			if (!missing) {
				return current();
			} else if (!/^[A-Za-z_]\w*$/.test(name) || part.index !== undefined) {
				throw new ExpansionError(`$${name}: cannot assign in this way`);
			}
			const value = await operand();
			env.set(name, value);
			return {values: [value]};
		}
		case '+':
			return {values: [missing ? '' : await operand()]};
		case '?':
			if (missing) {
				throw new ExpansionError(`${name}: ${(await operand()) || 'parameter null or not set'}`);
			}
			return current();
		case '#':
		case '##':
		case '%':
		case '%%': {
			const pattern = await env.expandPattern(part.arg);
			const changed = (values ?? ['']).map(value => removeAffix(part.op, pattern, value));
			return list ? result(changed) : {values: changed};
		}
		case '/':
		case '//':
		case '/#':
		case '/%': {
			const pattern = await env.expandPattern(part.pattern);
			const replacement = await env.expandString(part.replacement);
			const changed = (values ?? ['']).map(value => replace(part.op, pattern, replacement, value));
			return list ? result(changed) : {values: changed};
		}
		case '^':
		case '^^':
		case ',':
		case ',,': {
			const changed = (values ?? ['']).map(value => caseChange(part.op, value));
			return list ? result(changed) : {values: changed};
		}
		case ':': {
			const source = list ? (name === '@' || name === '*' ? [env.get('0'), ...(values ?? [])] : values ?? []) : [...(values?.[0] ?? '')];
			let offset = Number(await env.arith(part.offset || '0'));
			offset = offset < 0 ? Math.max(source.length + offset, 0) : offset;
			let end = source.length;
			if (part.count !== undefined) {
				const count = Number(await env.arith(part.count || '0'));
				end = count < 0 ? source.length + count : offset + count;
				if (end < offset) {
					throw new ExpansionError(`${part.count}: substring expression < 0`);
				}
			}
			const slice = source.slice(offset, end);
			return list ? result(slice) : {values: [slice.join('')]};
		}
		default:
			throw new ExpansionError(`\${${name}${part.op}}: bad substitution`);
	}
};

const addPart = async (fields, part, env, quoted, split) => {
	switch (part.t) {
		case 'lit':
			fields.add(part.v, quoted);
			break;
		case 'q':
			fields.add(part.v, true);
			break;
		case 'dq': {
			const [only] = part.parts;
			const atOnly = part.parts.length === 1 && only.t === 'param' && !only.op && !only.length
				&& (only.name === '@' || only.index === '@');
			if (!atOnly) {
				fields.field().quoted = true;
			}
			for (const inner of part.parts) {
				await addPart(fields, inner, env, true, split);
			}
			break;
		}
		default: {
			let result;
			if (part.t === 'param') {
				result = await parameter(part, env, quoted);
			} else if (part.t === 'cmd') {
				result = {values: [(await env.substitute(part.program)).replace(/\n+$/, '')]};
			} else {
				result = {values: [String(await env.arith(part.raw))]};
			}

			const values = result.multi && !split ? [result.values.join(' ')] : result.values;
			values.forEach((value, i) => {
				if (i > 0) {
					fields.end();
				}
				if (quoted || !split) {
					fields.add(value, quoted);
				} else {
					fields.split(value, env.ifs());
				}
			});
		}
	}
};

const toFields = async (parts, env, split) => {
	const fields = new Fields();
	for (const part of parts) {
		await addPart(fields, part, env, false, split);
	}
	fields.end();

	return fields.fields.filter(field => field.quoted || field.keep || field.segments.some(segment => segment.text !== ''));
};

const textOf = field => field.segments.map(segment => segment.text).join('');
const patternOf = field => field.segments.map(segment => (segment.quoted ? escapeGlob(segment.text) : segment.text)).join('');

// Words to arguments: everything, globbing included.
export const expandWords = async (words, env) => {
	const result = [];
	for (const word of words) {
		for (const parts of braceExpand(word)) {
			for (const field of await toFields(tilde(parts, env), env, true)) {
				const globbing = field.segments.some(segment => !segment.quoted && /[*?[]/.test(segment.text));
				const matches = globbing ? env.glob(patternOf(field)) : [];
				result.push(...(matches.length ? matches : [textOf(field)]));
			}
		}
	}

	return result;
};

// One string, without splitting or globbing: assignments, here-documents, operands.
export const expandString = async (parts, env) => (await toFields(tilde(parts, env), env, false)).map(textOf).join(' ');

// A pattern for `case`, `[[ == ]]` and `${x#...}`: quoted characters match literally.
export const expandPattern = async (parts, env) => (await toFields(parts, env, false)).map(patternOf).join(' ');

// The right side of `=~`: quoted characters match literally, the rest is a regex.
export const expandRegex = async (parts, env) => (await toFields(parts, env, false))
	.map(field => field.segments.map(segment => (segment.quoted ? escapeRegExp(segment.text) : segment.text)).join(''))
	.join(' ');
