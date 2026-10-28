// Small things the commands share.

export const ansi = (code, text) => `\x1b[${code}m${text}\x1b[0m`;

export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// GNU-style options: bundled short flags, `--long[=value]`, operands anywhere,
// `--` ends them. Reports bad options the way coreutils does; null then.
export const options = (api, args, {flags = '', values = '', long = {}, numeric = false} = {}) => {
	const set = new Map();
	const operands = [];
	const fail = message => {
		api.err(`${api.name}: ${message}\nTry '${api.name} --help' for more information.\n`);
		return null;
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--') {
			operands.push(...args.slice(i + 1));
			break;
		} else if (arg.startsWith('--')) {
			const [name, value] = arg.slice(2).split(/=(.*)/s);
			const key = long[name];
			if (key === undefined) {
				return fail(`unrecognized option '${arg}'`);
			} else if (values.includes(key) && value === undefined) {
				if (args[i + 1] === undefined) {
					return fail(`option '${arg}' requires an argument`);
				}
				set.set(key, args[++i]);
			} else {
				set.set(key, value ?? true);
			}
		} else if (arg.startsWith('-') && arg.length > 1 && !(numeric && /^-\d+$/.test(arg))) {
			for (let j = 1; j < arg.length; j++) {
				const c = arg[j];
				if (values.includes(c)) {
					const value = arg.slice(j + 1) || args[++i];
					if (value === undefined) {
						return fail(`option requires an argument -- '${c}'`);
					}
					set.set(c, value);
					break;
				} else if (!flags.includes(c)) {
					return fail(`invalid option -- '${c}'`);
				}
				set.set(c, true);
			}
		} else {
			operands.push(arg);
		}
	}

	return {has: key => set.has(key), get: key => set.get(key), operands};
};

// Whether to colour: --color[=always|auto|never], where auto means a terminal.
export const colour = (opts, api) => {
	const when = opts.get('color');
	return when === 'always' || when === true || ((when === 'auto' || when === 'tty') && api.stdout.isTTY);
};

// A file operand's text, or stdin for `-`. {text} or {error}.
export const readOperand = async (api, operand) => {
	if (operand === '-') {
		return {text: await api.readAll()};
	}

	return api.fs.read(api.resolve(operand));
};

// Lines of text, with whether the last one ended in a newline.
export const splitLines = text => {
	const lines = text.split('\n');
	const terminated = lines[lines.length - 1] === '';
	if (terminated) {
		lines.pop();
	}

	return {lines, terminated};
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const two = n => String(n).padStart(2, '0');

const zone = (date, utc) => {
	if (utc) {
		return {name: 'UTC', offset: '+0000'};
	}

	const minutes = -date.getTimezoneOffset();
	const offset = `${minutes < 0 ? '-' : '+'}${two(Math.floor(Math.abs(minutes) / 60))}${two(Math.abs(minutes) % 60)}`;
	let name = '';
	try {
		name = new Intl.DateTimeFormat('en-US', {timeZoneName: 'short'}).formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? '';
	} catch {
		/* No Intl time zones: fall back to the offset. */
	}

	return {name: /^GMT[+-]/.test(name) || !name ? offset.slice(0, 3) : name, offset};
};

// strftime, as `date +FORMAT` does it.
export const strftime = (format, date, utc = false) => {
	const get = {
		year: utc ? date.getUTCFullYear() : date.getFullYear(),
		month: utc ? date.getUTCMonth() : date.getMonth(),
		day: utc ? date.getUTCDate() : date.getDate(),
		weekday: utc ? date.getUTCDay() : date.getDay(),
		hours: utc ? date.getUTCHours() : date.getHours(),
		minutes: utc ? date.getUTCMinutes() : date.getMinutes(),
		seconds: utc ? date.getUTCSeconds() : date.getSeconds(),
	};
	const yearStart = utc ? Date.UTC(get.year, 0, 1) : new Date(get.year, 0, 1).getTime();
	const dayOfYear = Math.floor((date.getTime() - yearStart) / 86_400_000) + 1;
	const hour12 = get.hours % 12 || 12;
	const {name, offset} = zone(date, utc);

	return format.replace(/%([-_0^#]?)([a-zA-Z%+])/g, (match, flag, code) => {
		const values = {
			a: DAYS[get.weekday], A: LONG_DAYS[get.weekday], b: MONTHS[get.month], h: MONTHS[get.month], B: LONG_MONTHS[get.month],
			c: `${DAYS[get.weekday]} ${MONTHS[get.month]} ${String(get.day).padStart(2)} ${two(get.hours)}:${two(get.minutes)}:${two(get.seconds)} ${get.year}`,
			C: two(Math.floor(get.year / 100)), d: two(get.day), D: `${two(get.month + 1)}/${two(get.day)}/${two(get.year % 100)}`,
			e: String(get.day).padStart(2), F: `${get.year}-${two(get.month + 1)}-${two(get.day)}`, H: two(get.hours), I: two(hour12),
			j: String(dayOfYear).padStart(3, '0'), k: String(get.hours).padStart(2), l: String(hour12).padStart(2), m: two(get.month + 1),
			M: two(get.minutes), n: '\n', N: String(date.getMilliseconds() * 1_000_000).padStart(9, '0'), p: get.hours < 12 ? 'AM' : 'PM',
			P: get.hours < 12 ? 'am' : 'pm', r: `${two(hour12)}:${two(get.minutes)}:${two(get.seconds)} ${get.hours < 12 ? 'AM' : 'PM'}`,
			R: `${two(get.hours)}:${two(get.minutes)}`, s: String(Math.floor(date.getTime() / 1000)), S: two(get.seconds), t: '\t',
			T: `${two(get.hours)}:${two(get.minutes)}:${two(get.seconds)}`, u: String(get.weekday || 7), w: String(get.weekday),
			x: `${two(get.month + 1)}/${two(get.day)}/${two(get.year % 100)}`, X: `${two(get.hours)}:${two(get.minutes)}:${two(get.seconds)}`,
			y: two(get.year % 100), Y: String(get.year), z: offset, Z: name, '%': '%', '+': '',
		};
		let value = values[code];
		if (value === undefined) {
			return match;
		} else if (flag === '-') {
			value = value.replace(/^[0 ]+(?=\d)/, '');
		} else if (flag === '_') {
			value = value.replace(/^0+(?=\d)/, zeros => ' '.repeat(zeros.length));
		} else if (flag === '^') {
			value = value.toUpperCase();
		}

		return value;
	});
};

// `ls -l`'s timestamps.
export const shortDate = date => `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2)} ${two(date.getHours())}:${two(date.getMinutes())}`;

export const humanSize = bytes => {
	if (bytes < 1024) {
		return String(bytes);
	}

	const units = ['K', 'M', 'G', 'T'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}

	return `${value < 10 ? (Math.ceil(value * 10) / 10).toFixed(1) : Math.ceil(value)}${units[unit]}`;
};

// Names in columns, down then across, as wide as the terminal allows.
export const columns = (names, width, displayed = name => name) => {
	if (names.length === 0) {
		return '';
	}

	const lengths = names.map(name => [...name].length);
	for (let count = names.length; count >= 1; count--) {
		const rows = Math.ceil(names.length / count);
		const widths = [];
		for (let c = 0; c < count; c++) {
			const column = lengths.slice(c * rows, (c + 1) * rows);
			if (column.length) {
				widths.push(Math.max(...column));
			}
		}
		const total = widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * 2;
		if (total > width && count > 1) {
			continue;
		}

		const lines = [];
		for (let r = 0; r < rows; r++) {
			let line = '';
			for (let c = 0; c < widths.length; c++) {
				const i = c * rows + r;
				if (i >= names.length) {
					break;
				}
				const last = c === widths.length - 1 || (c + 1) * rows + r >= names.length;
				line += displayed(names[i], i) + (last ? '' : ' '.repeat(widths[c] - lengths[i] + 2));
			}
			lines.push(line);
		}
		return `${lines.join('\n')}\n`;
	}

	return '';
};

// A seeded, stable pseudo-random number in [0, 1), so made-up stats don't jump around.
export const noise = seed => {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
};
