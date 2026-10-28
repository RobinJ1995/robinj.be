// Shell arithmetic: 64-bit signed integers, C's operators, variables by name.

export class ArithError extends Error {
	constructor(message, token, expression) {
		super(message);
		this.token = token;
		this.expression = expression;
	}
}

const TOKEN = /\s*(?:(0[xX][0-9a-fA-F]*|\d+#[0-9a-zA-Z@_]*|\d+)|([A-Za-z_]\w*)|(\*\*=|<<=|>>=|\+\+|--|\*\*|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%&|^]=|[-+*/%<>=!~&|^?:,()]))/y;
const PRECEDENCE = {
	'||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
	'<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 11,
};
const ASSIGNMENTS = new Set(['=', '*=', '/=', '%=', '+=', '-=', '<<=', '>>=', '&=', '^=', '|=', '**=']);
const MAX_DEPTH = 1024;

const int = value => BigInt.asIntN(64, value);

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ@_';

const number = text => {
	const based = text.match(/^(\d+)#(.*)$/);
	if (based) {
		const base = Number(based[1]);
		if (base < 2 || base > 64) {
			throw new ArithError('invalid arithmetic base', text);
		}
		let value = 0n;
		for (const c of based[2]) {
			const digit = DIGITS.indexOf(base <= 36 ? c.toLowerCase() : c);
			if (digit < 0 || digit >= base) {
				throw new ArithError('value too great for base', text);
			}
			value = value * BigInt(base) + BigInt(digit);
		}
		return int(value);
	} else if (/^0[xX]$/.test(text)) {
		throw new ArithError('invalid number', text);
	} else if (/^0\d/.test(text)) {
		if (/[89]/.test(text)) {
			throw new ArithError('value too great for base', text);
		}
		return int(BigInt(`0o${text.slice(1)}`));
	}

	return int(BigInt(text));
};

const apply = (op, a, b, token) => {
	switch (op) {
		case '+': return int(a + b);
		case '-': return int(a - b);
		case '*': return int(a * b);
		case '/':
		case '%':
			if (b === 0n) {
				throw new ArithError('division by 0', token);
			}
			return int(op === '/' ? a / b : a % b);
		case '**': {
			if (b < 0n) {
				throw new ArithError('exponent less than 0', token);
			}
			// By squaring, wrapping at every step: a ** b in full can take forever.
			let result = 1n;
			for (let base = a, exponent = b; exponent > 0n; base = int(base * base), exponent >>= 1n) {
				if (exponent & 1n) {
					result = int(result * base);
				}
			}
			return result;
		}
		case '<<': return int(a << (b & 63n));
		case '>>': return int(a >> (b & 63n));
		case '<': return a < b ? 1n : 0n;
		case '>': return a > b ? 1n : 0n;
		case '<=': return a <= b ? 1n : 0n;
		case '>=': return a >= b ? 1n : 0n;
		case '==': return a === b ? 1n : 0n;
		case '!=': return a !== b ? 1n : 0n;
		case '&': return a & b;
		case '|': return a | b;
		case '^': return a ^ b;
		default: throw new ArithError('syntax error in expression', token);
	}
};

class Evaluator {
	constructor(text, vars, depth, innermost) {
		this.text = text;
		this.vars = vars;
		this.depth = depth;
		this.innermost = innermost;
		this.tokens = [];
		this.i = 0;

		let pos = 0;
		while (!/^\s*$/.test(text.slice(pos))) {
			TOKEN.lastIndex = pos;
			const match = TOKEN.exec(text);
			if (!match) {
				throw new ArithError('syntax error: invalid arithmetic operator', text.slice(pos).trim());
			}
			const at = pos + match[0].length - match[0].trimStart().length;
			pos = TOKEN.lastIndex;
			this.tokens.push({num: match[1], name: match[2], op: match[3], at});
		}
	}

	rest(token = this.tokens[this.i]) {
		return token ? this.text.slice(token.at).trim() : '';
	}

	peekOp() {
		return this.tokens[this.i]?.op;
	}

	expect(op) {
		if (this.peekOp() !== op) {
			throw new ArithError(`syntax error: \`${op}' expected`, this.rest());
		}
		this.i++;
	}

	variable(name) {
		const value = this.vars.get(name) ?? '';
		if (value === '') {
			return 0n;
		} else if (/^\s*-?\d+\s*$/.test(value)) {
			return int(BigInt(value.trim()));
		} else if (this.depth >= MAX_DEPTH) {
			throw new ArithError('expression recursion level exceeded', this.text.trim(), this.text);
		}

		this.innermost.text = value;
		return new Evaluator(value, this.vars, this.depth + 1, this.innermost).run();
	}

	run() {
		if (this.tokens.length === 0) {
			return 0n;
		}
		const value = this.comma(true);
		if (this.i < this.tokens.length) {
			throw new ArithError('syntax error in expression', this.rest());
		}

		return value;
	}

	comma(live) {
		let value = this.assignment(live);
		while (this.peekOp() === ',') {
			this.i++;
			value = this.assignment(live);
		}

		return value;
	}

	assignment(live) {
		const target = this.tokens[this.i];
		const op = this.tokens[this.i + 1]?.op;
		if (target?.name && ASSIGNMENTS.has(op)) {
			this.i += 2;
			const right = this.assignment(live);
			if (!live) {
				return right;
			}
			const value = op === '=' ? right : apply(op.slice(0, -1), this.variable(target.name), right, this.rest(target));
			this.vars.set(target.name, String(value));
			return value;
		}

		return this.conditional(live);
	}

	conditional(live) {
		const condition = this.binary(1, live);
		if (this.peekOp() !== '?') {
			return condition;
		}

		this.i++;
		const yes = this.assignment(live && condition !== 0n);
		this.expect(':');
		const no = this.assignment(live && condition === 0n);
		return condition !== 0n ? yes : no;
	}

	binary(min, live) {
		let left = this.unary(live);
		for (;;) {
			const token = this.tokens[this.i];
			const precedence = PRECEDENCE[token?.op];
			if (!precedence || precedence < min) {
				return left;
			}
			this.i++;

			if (token.op === '&&' || token.op === '||') {
				const decided = token.op === '&&' ? left === 0n : left !== 0n;
				const right = this.binary(precedence + 1, live && !decided);
				left = decided ? BigInt(token.op === '||') : BigInt(right !== 0n);
			} else {
				const right = this.binary(token.op === '**' ? precedence : precedence + 1, live);
				left = live ? apply(token.op, left, right, this.rest(token)) : 0n;
			}
		}
	}

	unary(live) {
		const token = this.tokens[this.i];
		if (token?.op === '++' || token?.op === '--') {
			const target = this.tokens[this.i + 1];
			if (!target?.name) {
				throw new ArithError('syntax error: operand expected', this.rest(token));
			}
			this.i += 2;
			const value = int(this.variable(target.name) + (token.op === '++' ? 1n : -1n));
			if (live) {
				this.vars.set(target.name, String(value));
			}
			return value;
		} else if (['-', '+', '!', '~'].includes(token?.op)) {
			this.i++;
			const value = this.unary(live);
			return {'-': int(-value), '+': value, '!': BigInt(value === 0n), '~': ~value}[token.op];
		}

		return this.postfix(live);
	}

	postfix(live) {
		const token = this.tokens[this.i];
		const after = this.tokens[this.i + 1]?.op;
		if (token?.name && (after === '++' || after === '--')) {
			this.i += 2;
			const value = this.variable(token.name);
			if (live) {
				this.vars.set(token.name, String(int(value + (after === '++' ? 1n : -1n))));
			}
			return value;
		}

		return this.primary(live);
	}

	primary(live) {
		const token = this.tokens[this.i];
		if (!token) {
			throw new ArithError('syntax error: operand expected', this.rest(this.tokens[this.i - 1]));
		}

		this.i++;
		if (token.op === '(') {
			const value = this.comma(live);
			this.expect(')');
			return value;
		} else if (token.num !== undefined) {
			return number(token.num);
		} else if (token.name) {
			return live ? this.variable(token.name) : 0n;
		}

		throw new ArithError('syntax error: operand expected', this.rest(token));
	}
}

// `vars` reads and writes shell variables: {get(name), set(name, value)}.
export const evaluate = (text, vars) => {
	const innermost = {text};
	try {
		return new Evaluator(text, vars, 0, innermost).run();
	} catch (e) {
		// Most engines run out of stack before MAX_DEPTH; Firefox calls it InternalError.
		if (e instanceof RangeError || e?.name === 'InternalError') {
			throw new ArithError('expression recursion level exceeded', innermost.text.trim(), innermost.text);
		}
		throw e;
	}
};
