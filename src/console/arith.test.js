import {describe, it, expect} from 'vitest';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {evaluate, ArithError} from './arith';

const variables = (initial = {}) => {
	const values = new Map(Object.entries(initial));
	return {get: name => values.get(name), set: (name, value) => values.set(name, value), values};
};

const calc = (text, vars = variables()) => evaluate(text, vars);

const failure = text => {
	try {
		calc(text);
	} catch (e) {
		expect(e).toBeInstanceOf(ArithError);
		return [e.message, e.token];
	}
	throw new Error(`${text} did not fail`);
};

describe('arithmetic', () => {
	it('is zero for nothing at all', () => {
		expect(calc('')).toBe(0n);
		expect(calc('   ')).toBe(0n);
	});

	it('follows C\'s precedence, with ** binding right to left', () => {
		expect(calc('1 + 2 * 3')).toBe(7n);
		expect(calc('(1 + 2) * 3')).toBe(9n);
		expect(calc('2 ** 3 ** 2')).toBe(512n);
		expect(calc('10 - 4 - 3')).toBe(3n);
		expect(calc('1 + 2 == 3 && 4 < 5 | 0')).toBe(1n);
		expect(calc('1 << 2 + 1')).toBe(8n);
	});

	it('divides towards zero, and keeps the sign of the dividend for %', () => {
		expect(calc('7 / 2')).toBe(3n);
		expect(calc('-7 / 2')).toBe(-3n);
		expect(calc('-7 % 3')).toBe(-1n);
		expect(calc('7 % -3')).toBe(1n);
	});

	it('compares, giving 1 or 0', () => {
		expect([calc('1 < 2'), calc('2 > 1'), calc('2 <= 2'), calc('3 >= 4'), calc('5 == 5'), calc('5 != 5')]).toEqual([1n, 1n, 1n, 0n, 1n, 0n]);
	});

	it('does bitwise operations, shifting by at most 63', () => {
		expect(calc('12 & 10')).toBe(8n);
		expect(calc('12 | 3')).toBe(15n);
		expect(calc('12 ^ 10')).toBe(6n);
		expect(calc('~0')).toBe(-1n);
		expect(calc('1 << 64')).toBe(1n);
		expect(calc('-16 >> 2')).toBe(-4n);
	});

	it('has unary operators', () => {
		expect(calc('-(3)')).toBe(-3n);
		expect(calc('+4')).toBe(4n);
		expect(calc('!0')).toBe(1n);
		expect(calc('!7')).toBe(0n);
		expect(calc('- -2')).toBe(2n);
	});

	it('wraps around at 64 bits', () => {
		expect(calc('9223372036854775807 + 1')).toBe(-9223372036854775808n);
		expect(calc('2 ** 64')).toBe(0n);
		expect(calc('-9223372036854775807 - 2')).toBe(9223372036854775807n);
		expect(calc('3037000500 * 3037000500')).toBe(-9223372036709301616n);
	});

	it('raises to huge powers at once, wrapping at 64 bits', () => {
		const started = Date.now();

		expect(calc('3 ** 1000000000')).toBe(9215150800219179009n);
		expect(Date.now() - started).toBeLessThan(100);
		expect(calc('(-2) ** 63')).toBe(-9223372036854775808n);
		expect(calc('-3 ** 3')).toBe(-27n);
		expect(calc('0 ** 0')).toBe(1n);
	});

	it('reads hexadecimal, octal and any base from 2 to 64', () => {
		expect(calc('0x1F + 0XfF')).toBe(286n);
		expect(calc('017')).toBe(15n);
		expect(calc('2#101')).toBe(5n);
		expect(calc('16#ff')).toBe(255n);
		expect(calc('36#Z')).toBe(35n);
		expect(calc('64#_')).toBe(63n);
		expect(calc('64#@')).toBe(62n);
		expect(calc('62#Z')).toBe(61n);
	});

	it('rejects numbers that do not fit their base', () => {
		expect(failure('1#0')).toEqual(['invalid arithmetic base', '1#0']);
		expect(failure('65#1')).toEqual(['invalid arithmetic base', '65#1']);
		expect(failure('2#2')).toEqual(['value too great for base', '2#2']);
		expect(failure('08')).toEqual(['value too great for base', '08']);
		expect(failure('0x')).toEqual(['invalid number', '0x']);
	});

	it('refuses to divide by zero or raise to a negative power', () => {
		expect(failure('1 / 0')).toEqual(['division by 0', '/ 0']);
		expect(failure('5 % (2 - 2)')).toEqual(['division by 0', '% (2 - 2)']);
		expect(failure('2 ** -1')).toEqual(['exponent less than 0', '** -1']);
		expect(failure('x /= 0')).toEqual(['division by 0', 'x /= 0']);
	});

	it('reads variables: empty or unset as 0, numbers, or expressions in turn', () => {
		const vars = variables({n: ' 42 ', empty: '', neg: '-3', expr: 'n + 1', chain: 'expr * 2'});

		expect(calc('n + empty + unset', vars)).toBe(42n);
		expect(calc('neg * 2', vars)).toBe(-6n);
		expect(calc('chain', vars)).toBe(86n);
	});

	it('reports variables that refer to themselves, rather than running out of stack', () => {
		try {
			calc('x', variables({x: 'x + 1'}));
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(ArithError);
			expect([e.message, e.token, e.expression]).toEqual(['expression recursion level exceeded', 'x + 1', 'x + 1']);
		}
	});

	it('takes Firefox\'s "too much recursion" for running out of stack too, and passes other errors on', () => {
		const reading = error => () => calc('x', {get: () => {
			throw error;
		}});
		const tooDeep = Object.assign(new Error('too much recursion'), {name: 'InternalError'});

		expect(reading(tooDeep)).toThrow(ArithError);
		expect(reading(tooDeep)).toThrow('expression recursion level exceeded');
		expect(reading(new TypeError('broken'))).toThrow(TypeError);
	});

	it('stops at bash\'s 1024 levels where the stack goes deeper', async () => {
		const worker = new Worker(`
			const {parentPort, workerData} = require('node:worker_threads');
			import(workerData).then(({evaluate}) => {
				let reads = 0;
				try {
					evaluate('x', {get: () => (reads++, 'x + 1')});
				} catch (e) {
					parentPort.postMessage([e.constructor.name, e.message, e.token, reads]);
				}
			});
		`, {eval: true, workerData: pathToFileURL(`${import.meta.dirname}/arith.js`).href, resourceLimits: {stackSizeMb: 256}});

		const [result] = await once(worker, 'message');
		await worker.terminate();
		expect(result).toEqual(['ArithError', 'expression recursion level exceeded', 'x + 1', 1025]);
	});

	it('assigns, with every compound operator', () => {
		const vars = variables({x: '10'});

		expect(calc('y = x * 2', vars)).toBe(20n);
		expect(vars.values.get('y')).toBe('20');
		const steps = ['x += 5', 'x -= 3', 'x *= 4', 'x /= 6', 'x %= 5', 'x <<= 3', 'x >>= 1', 'x &= 6', 'x |= 9', 'x ^= 3', 'x **= 2'];
		expect(steps.map(step => calc(step, vars))).toEqual([15n, 12n, 48n, 8n, 3n, 24n, 12n, 4n, 13n, 14n, 196n]);
		expect(calc('a = b = 7', vars)).toBe(7n);
		expect([vars.values.get('a'), vars.values.get('b')]).toEqual(['7', '7']);
	});

	it('increments and decrements, before or after', () => {
		const vars = variables({i: '5'});

		expect(calc('i++', vars)).toBe(5n);
		expect(calc('++i', vars)).toBe(7n);
		expect(calc('i--', vars)).toBe(7n);
		expect(calc('--i', vars)).toBe(5n);
		expect(vars.values.get('i')).toBe('5');
		expect(calc('fresh++ + fresh', vars)).toBe(1n);
	});

	it('evaluates comma lists to their last value', () => {
		const vars = variables();

		expect(calc('a = 1, b = a + 1, a + b', vars)).toBe(3n);
	});

	it('short-circuits && and ||, leaving the other side unevaluated', () => {
		const vars = variables({x: '0'});

		expect(calc('0 && x++', vars)).toBe(0n);
		expect(calc('1 || x++', vars)).toBe(1n);
		expect(calc('0 && (x = 1 / 0)', vars)).toBe(0n);
		expect(vars.values.get('x')).toBe('0');
		expect(calc('2 && 3', vars)).toBe(1n);
		expect(calc('0 || 0', vars)).toBe(0n);
	});

	it('evaluates only the chosen branch of ?:', () => {
		const vars = variables({a: '0', b: '0'});

		expect(calc('1 ? a = 5 : (b = 6)', vars)).toBe(5n);
		expect(calc('0 ? a++ : b++', vars)).toBe(0n);
		expect([vars.values.get('a'), vars.values.get('b')]).toEqual(['5', '1']);
		expect(calc('0 ? 1 : 0 ? 2 : 3')).toBe(3n);
	});

	it('reports syntax errors with the rest of the expression', () => {
		expect(failure('1 +')).toEqual(['syntax error: operand expected', '+']);
		expect(failure('(1 + 2')).toEqual(["syntax error: `)' expected", '']);
		expect(failure('1 ? 2')).toEqual(["syntax error: `:' expected", '']);
		expect(failure('1 2')).toEqual(['syntax error in expression', '2']);
		expect(failure('3 @ 4')).toEqual(['syntax error: invalid arithmetic operator', '@ 4']);
		expect(failure('++3')).toEqual(['syntax error: operand expected', '++3']);
		expect(failure('* 2')).toEqual(['syntax error: operand expected', '* 2']);
		expect(failure('1 = 2')).toEqual(['syntax error in expression', '= 2']);
	});
});
