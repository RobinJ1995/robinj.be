import {describe, it, expect, afterEach} from 'vitest';
import {options, columns, humanSize, strftime, noise} from './util';

const api = () => {
	const errors = [];
	return {name: 'cmd', err: text => errors.push(text), errors};
};

describe('options', () => {
	it('takes bundled flags, values and long options anywhere', () => {
		const opts = options(api(), ['-ab', 'x', '-nvalue', '--long=v', '--flag', 'y'], {flags: 'ab', values: 'n', long: {long: 'l', flag: 'f'}});

		expect(['a', 'b', 'n', 'l', 'f'].map(opts.get)).toEqual([true, true, 'value', 'v', true]);
		expect(opts.operands).toEqual(['x', 'y']);
	});

	it('takes values from the next argument', () => {
		const opts = options(api(), ['-n', '5', '--lines', '7', '-'], {values: 'nl', long: {lines: 'l'}});

		expect([opts.get('n'), opts.get('l'), opts.operands]).toEqual(['5', '7', ['-']]);
	});

	it('stops at --, and leaves negative numbers alone when told to', () => {
		expect(options(api(), ['-a', '--', '-b', '--c'], {flags: 'ab'}).operands).toEqual(['-b', '--c']);
		expect(options(api(), ['-5', '3'], {numeric: true}).operands).toEqual(['-5', '3']);
	});

	it('reports what is wrong as coreutils does', () => {
		const cases = [
			[['--nope'], "cmd: unrecognized option '--nope'\n"],
			[['--lines'], "cmd: option '--lines' requires an argument\n"],
			[['-n'], "cmd: option requires an argument -- 'n'\n"],
			[['-z'], "cmd: invalid option -- 'z'\n"],
		];
		for (const [args, message] of cases) {
			const out = api();
			expect(options(out, args, {values: 'n', long: {lines: 'n'}})).toBeNull();
			expect(out.errors).toEqual([`${message}Try 'cmd --help' for more information.\n`]);
		}
	});
});

describe('humanSize', () => {
	it('rounds up to one decimal under ten, in the largest unit that fits', () => {
		expect([1023, 1024, 1500, 10_240, 5 * 1024 ** 2, 3.2 * 1024 ** 3, 2048 * 1024 ** 4].map(humanSize)).toEqual(['1023', '1.0K', '1.5K', '10K', '5.0M', '3.2G', '2048T']);
	});
});

describe('columns', () => {
	it('fills columns down, then across, as wide as fits', () => {
		expect(columns(['a', 'bb', 'ccc', 'd', 'eeeee'], 12)).toBe('a    d\nbb   eeeee\nccc\n');
		expect(columns(['a', 'b'], 80)).toBe('a  b\n');
		expect(columns(['much too long'], 4)).toBe('much too long\n');
		expect(columns([], 80)).toBe('');
	});

	it('pads by what is shown, not by colour codes', () => {
		expect(columns(['x', 'y'], 80, (name, i) => `<${i}>${name}`)).toBe('<0>x  <1>y\n');
	});
});

describe('strftime in the local time zone', () => {
	const zone = process.env.TZ;
	const noon = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));

	afterEach(() => {
		if (zone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = zone;
		}
	});

	it('names the zone, or falls back to the hours of its offset', () => {
		process.env.TZ = 'America/New_York';
		expect(strftime('%H:%M %z %Z', noon)).toBe('07:00 -0500 EST');
		process.env.TZ = 'Asia/Kolkata';
		expect(strftime('%H:%M %z %Z', noon)).toBe('17:30 +0530 +05');
		expect(strftime('%H:%M %z %Z', noon, true)).toBe('12:00 +0000 UTC');
	});
});

describe('noise', () => {
	it('is stable for a seed, and between 0 and 1', () => {
		const values = [1, 2, 3, 1337].map(noise);

		expect(values).toEqual([1, 2, 3, 1337].map(noise));
		expect(values.every(value => value >= 0 && value < 1)).toBe(true);
		expect(new Set(values).size).toBe(4);
	});
});
