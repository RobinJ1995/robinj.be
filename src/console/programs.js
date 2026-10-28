import {parseSignal, signalNumber, SIGNALS} from './io';
import {MEMORY_KIB, SWAP_KIB, usage, cpuTime, uptime} from './processes';
import {options, splitLines} from './util';

const two = n => String(n).padStart(2, '0');
const clock = date => `${two(date.getHours())}:${two(date.getMinutes())}`;
const clip = (line, width) => [...line].slice(0, width).join('');
const stripAnsi = text => text.replace(/\x1b\[[\d;?]*[A-Za-z]/g, '');
// ps shortens long user names to seven characters and a `+`.
const shortUser = user => (user.length > 8 ? `${user.slice(0, 7)}+` : user);

// --- ps ---

const PS_USAGE = kind => `error: unsupported ${kind}\n\nUsage:\n ps [options]\n\n Try 'ps --help <simple|list|output|threads|misc|all>'\n  or 'ps --help <s|l|o|t|m|a>'\n for additional help text.\n\nFor more details see ps(1).\n`;

const ps = async api => {
	// Like the real one, it sees the rest of its pipeline running alongside it.
	await api.sleep(0);
	const want = {all: false, full: false, bsd: false, user: false, withTty: false, mine: false, pids: []};
	for (let i = 0; i < api.args.length; i++) {
		const arg = api.args[i];
		if (arg === '-p' || arg === 'p') {
			want.pids.push(...(api.args[++i] ?? '').split(',').map(Number));
		} else if (arg.startsWith('-')) {
			for (const c of arg.slice(1)) {
				if (c === 'e' || c === 'A') {
					want.all = true;
				} else if (c === 'f' || c === 'F') {
					want.full = true;
				} else {
					api.err(PS_USAGE('SysV option'));
					return 1;
				}
			}
		} else {
			want.bsd = true;
			for (const c of arg) {
				if (c === 'a') {
					want.withTty = true;
				} else if (c === 'x') {
					want.mine = true;
				} else if (c === 'u') {
					want.user = true;
				} else if (c !== 'w') {
					api.err(PS_USAGE('option (BSD syntax)'));
					return 1;
				}
			}
		}
	}

	const now = new Date();
	const processes = api.shell.processes().filter(proc => {
		if (want.pids.length) {
			return want.pids.includes(proc.pid);
		} else if (want.all || (want.withTty && want.mine)) {
			return true;
		} else if (want.withTty || want.mine) {
			return want.withTty ? proc.tty !== '?' : proc.user === 'robin';
		}
		return proc.tty === 'pts/0';
	});
	const start = proc => (now - proc.started < 86_400_000 ? clock(proc.started) : proc.started.toDateString().slice(4, 10).replace(' ', ''));

	let lines;
	if (want.user) {
		lines = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND', ...processes.map(proc => {
			const use = usage(proc, now);
			const time = `${Math.floor(use.time / 60)}:${two(Math.floor(use.time % 60))}`;
			return `${shortUser(proc.user).padEnd(8)} ${String(proc.pid).padStart(7)} ${use.cpu.toFixed(1).padStart(4)} ${use.mem.toFixed(1).padStart(4)} ${String(use.vsz).padStart(6)} ${String(use.rss).padStart(5)} ${proc.tty.padEnd(8)} ${use.stat.padEnd(4)} ${start(proc).padStart(5)} ${time.padStart(6)} ${proc.command}`;
		})];
	} else if (want.bsd) {
		lines = ['    PID TTY      STAT   TIME COMMAND', ...processes.map(proc => {
			const use = usage(proc, now);
			return `${String(proc.pid).padStart(7)} ${proc.tty.padEnd(8)} ${use.stat.padEnd(6)} ${`${Math.floor(use.time / 60)}:${two(Math.floor(use.time % 60))}`.padStart(4)} ${proc.command}`;
		})];
	} else if (want.full) {
		lines = ['UID          PID    PPID  C STIME TTY          TIME CMD', ...processes.map(proc => {
			const use = usage(proc, now);
			return `${shortUser(proc.user).padEnd(8)} ${String(proc.pid).padStart(7)} ${String(proc.ppid).padStart(7)} ${String(Math.round(use.cpu)).padStart(2)} ${start(proc).padEnd(5)} ${proc.tty.padEnd(8)} ${cpuTime(use.time)} ${proc.command}`;
		})];
	} else {
		lines = ['    PID TTY          TIME CMD', ...processes.map(proc => (
			`${String(proc.pid).padStart(7)} ${proc.tty.padEnd(8)} ${cpuTime(usage(proc, now).time)} ${proc.name}`
		))];
	}

	const width = api.stdout.isTTY ? api.tty.columns() : Infinity;
	api.out(lines.map(line => `${clip(line, width)}\n`).join(''));
	return processes.length ? 0 : 1;
};

// --- kill, pkill ---

const pkill = api => {
	let signal = 'TERM';
	const args = [...api.args];
	if (/^-[A-Za-z0-9]+$/.test(args[0] ?? '') && parseSignal(args[0]) && !/^-[fxec]+$/.test(args[0])) {
		signal = parseSignal(args.shift());
	}

	// --signal has no short form: pkill's -s is the session.
	const opts = options(api, args, {flags: 'fxecn', values: ['u', 'signal'], long: {signal: 'signal', full: 'f', exact: 'x', echo: 'e', count: 'c', newest: 'n'}});
	if (!opts) {
		return 2;
	} else if (opts.has('signal')) {
		signal = parseSignal(opts.get('signal'));
	}
	if (!signal) {
		api.err(`pkill: Unknown signal "${opts.get('signal')}".\n`);
		return 2;
	}

	const [pattern] = opts.operands;
	if (pattern === undefined) {
		api.err("pkill: no matching criteria specified\nTry `pkill --help' for more information.\n");
		return 2;
	}

	let regex;
	try {
		regex = new RegExp(opts.has('x') ? `^(?:${pattern})$` : pattern);
	} catch {
		api.err('pkill: invalid pattern\n');
		return 2;
	}

	const matches = api.shell.processes().filter(proc => proc.pid !== api.pid && regex.test(opts.has('f') ? proc.command : proc.name.slice(0, 15)));
	let signalled = 0;
	for (const proc of opts.has('n') ? matches.slice(-1) : matches) {
		const result = api.shell.kill(proc.pid, signal);
		if (result === 'ok') {
			signalled++;
			if (opts.has('e')) {
				api.out(`${proc.name} killed (pid ${proc.pid})\n`);
			}
		} else if (result === 'denied') {
			api.err(`pkill: killing pid ${proc.pid} failed: Operation not permitted\n`);
		}
	}
	if (opts.has('c')) {
		api.out(`${signalled}\n`);
	}

	return signalled ? 0 : 1;
};

const KILLALL_USAGE = `Usage: killall [OPTION]... [--] NAME...
       killall -l, --list
       killall -V, --version

  -e,--exact          require exact match for very long names
  -I,--ignore-case    case insensitive process name match
  -i,--interactive    ask for confirmation before killing
  -l,--list           list all known signal names
  -q,--quiet          don't print complaints
  -r,--regexp         interpret NAME as an extended regular expression
  -s,--signal SIGNAL  send this signal instead of SIGTERM
  -u,--user USER      kill only process(es) running as USER
  -v,--verbose        report if the signal was successfully sent
  -V,--version        display version information
  -w,--wait           wait for processes to die
`;

const KILLALL_FLAGS = {e: 'exact', I: 'ignoreCase', i: 'interactive', q: 'quiet', r: 'regex', v: 'verbose', w: 'wait'};
const KILLALL_LONG = {exact: 'e', 'ignore-case': 'I', interactive: 'i', quiet: 'q', regexp: 'r', verbose: 'v', wait: 'w'};

const killall = async api => {
	let signal = 'TERM';
	let user = null;
	const set = {};
	const names = [];
	for (let i = 0; i < api.args.length; i++) {
		const arg = api.args[i];
		const long = arg.match(/^--([\w-]+)$/);
		if (arg === '--') {
			names.push(...api.args.slice(i + 1));
			break;
		} else if (arg === '-l' || arg === '--list') {
			const all = SIGNALS.map(name => (name === 'IO' ? 'POLL' : name));
			api.out(`${all.slice(0, 16).join(' ')}\n${all.slice(16).join(' ')}\n`);
			return 0;
		} else if (arg === '-V' || arg === '--version') {
			api.err('killall (PSmisc) 23.7\nCopyright (C) 1993-2024 Werner Almesberger and Craig Small\n');
			return 0;
		} else if (arg === '-s' || arg === '--signal') {
			signal = parseSignal(api.args[++i] ?? '');
			if (!signal) {
				api.err(`killall: ${api.args[i] ?? ''}: unknown signal; killall -l lists signals.\n`);
				return 1;
			}
		} else if (arg === '-u' || arg === '--user') {
			user = api.args[++i];
		} else if (long && KILLALL_LONG[long[1]]) {
			set[KILLALL_FLAGS[KILLALL_LONG[long[1]]]] = true;
		} else if (/^-[A-Z0-9]+$/.test(arg) && parseSignal(arg) && arg !== '-I' && arg !== '-V') {
			signal = parseSignal(arg);
		} else if (arg.startsWith('-')) {
			for (const c of arg.slice(1)) {
				if (!KILLALL_FLAGS[c]) {
					api.err(`killall: invalid option -- '${c}'\n${KILLALL_USAGE}`);
					return 1;
				}
				set[KILLALL_FLAGS[c]] = true;
			}
		} else {
			names.push(arg);
		}
	}

	if (names.length === 0) {
		api.err(KILLALL_USAGE);
		return 1;
	}

	const processes = api.shell.processes().filter(proc => proc.pid !== api.pid && (!user || proc.user === user));
	let status = 0;
	for (const name of names) {
		let matches;
		if (set.regex) {
			let pattern;
			try {
				pattern = new RegExp(name, set.ignoreCase ? 'i' : '');
			} catch {
				api.err(`killall: Bad regular expression: ${name}\n`);
				return 1;
			}
			matches = processes.filter(proc => pattern.test(proc.name));
		} else {
			// Without -e, long names compare on the 15 characters the kernel keeps.
			const wanted = (set.exact ? name : name.slice(0, 15));
			const same = (a, b) => (set.ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b);
			matches = processes.filter(proc => same(set.exact ? proc.name : proc.name.slice(0, 15), wanted));
		}

		if (matches.length === 0) {
			if (!set.quiet) {
				api.err(`${name}: no process found\n`);
			}
			status = 1;
			continue;
		}

		let killed = 0;
		for (const proc of matches) {
			if (set.interactive) {
				api.err(`Kill ${proc.name}(${proc.pid}) ? (y/N) `);
				if (!/^y/i.test((await api.readLine())?.line ?? '')) {
					continue;
				}
			}

			const result = api.shell.kill(proc.pid, signal);
			if (result === 'ok') {
				killed++;
				if (set.verbose) {
					api.err(`Killed ${proc.name}(${proc.pid}) with signal ${signalNumber(signal)}\n`);
				}
			} else if (!set.quiet) {
				api.err(`${proc.name}(${proc.pid}): ${result === 'denied' ? 'Operation not permitted' : 'No such process'}\n`);
			}
		}
		if (killed === 0) {
			status = 1;
		}
	}

	return status;
};

// --- top and htop ---

// The table both show, busiest first.
const snapshot = (api, tick) => {
	const now = new Date();
	return api.shell.processes()
		.map(proc => ({...proc, ...usage(proc, now, tick)}))
		.sort((a, b) => b.cpu - a.cpu || a.pid - b.pid);
};

const summary = (api, processes) => {
	const seconds = (Date.now() - api.system.bootedAt) / 1000;
	const used = processes.reduce((sum, proc) => sum + proc.rss, 0) + 1_850_000;
	const cache = 2_254_000;
	const cpu = Math.min(processes.reduce((sum, proc) => sum + proc.cpu, 0), 400);

	return {seconds, used, cache, free: MEMORY_KIB - used - cache, cpu};
};

const KEYS = {
	up: ['\x1b[A', '\x1bOA'], down: ['\x1b[B', '\x1bOB'], pageUp: ['\x1b[5~'], pageDown: ['\x1b[6~'],
	home: ['\x1b[H', '\x1b[1~', '\x1bOH'], end: ['\x1b[F', '\x1b[4~', '\x1bOF'], f9: ['\x1b[20~'], f10: ['\x1b[21~'],
};
const is = (data, key) => KEYS[key].includes(data);

// Highlighted bars are reverse video in a colour, rather than black on that colour:
// the text then takes the terminal's own background, legible in light and dark.

// Full-screen programs: the alternate screen, keys straight from the terminal,
// a redraw every `interval`, until `quit` is called.
const fullScreen = async (api, {interval, render, onKey}) => {
	let quit;
	const done = new Promise(resolve => {
		quit = resolve;
	});
	const draw = () => api.out(`\x1b[H${render()}\x1b[J`);
	const release = api.tty.raw(data => {
		onKey(data, quit);
		draw();
	});
	const timer = interval ? setInterval(draw, interval) : null;

	api.out('\x1b[?1049h\x1b[?25l');
	draw();
	try {
		await api.abort.race(done);
	} finally {
		clearInterval(timer);
		release();
		api.out('\x1b[?25h\x1b[?1049l');
	}

	return 0;
};

const topFrame = (api, processes, status, width, height) => {
	const {seconds, used, cache, free, cpu} = summary(api, processes);
	const mib = kib => (kib / 1024).toFixed(1).padStart(8);
	const load = [cpu / 30, cpu / 45, cpu / 80].map(n => n.toFixed(2)).join(', ');
	const running = processes.filter(proc => proc.stat.startsWith('R')).length;
	const user = cpu / 4 * 0.7;
	const system = cpu / 4 * 0.3;
	const header = [
		`top - ${new Date().toTimeString().slice(0, 8)} up ${uptime(seconds)},  1 user,  load average: ${load}`,
		`Tasks: ${String(processes.length).padStart(3)} total, ${String(running).padStart(3)} running, ${String(processes.length - running).padStart(3)} sleeping,   0 stopped,   0 zombie`,
		`%Cpu(s): ${user.toFixed(1).padStart(4)} us, ${system.toFixed(1).padStart(4)} sy,  0.0 ni, ${(100 - user - system).toFixed(1).padStart(4)} id,  0.0 wa,  0.1 hi,  0.0 si,  0.0 st`,
		`MiB Mem : ${mib(MEMORY_KIB)} total, ${mib(free)} free, ${mib(used)} used, ${mib(cache)} buff/cache`,
		`MiB Swap: ${mib(SWAP_KIB)} total, ${mib(SWAP_KIB)} free, ${mib(0)} used. ${mib(free + cache)} avail Mem`,
		status ?? '',
		`\x1b[7m${clip('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND'.padEnd(width), width)}\x1b[0m`,
	];
	const rows = processes.slice(0, Math.max(height - header.length, 0)).map(proc => {
		const time = `${Math.floor(proc.time / 60)}:${(proc.time % 60).toFixed(2).padStart(5, '0')}`;
		const line = `${String(proc.pid).padStart(7)} ${proc.user.slice(0, 8).padEnd(8)}  20   0 ${String(proc.vsz).padStart(7)} ${String(proc.rss).padStart(7)} ${String(proc.shr).padStart(6)} ${proc.stat[0]} ${proc.cpu.toFixed(1).padStart(5)} ${proc.mem.toFixed(1).padStart(5)} ${time.padStart(9)} ${proc.name}`;
		return proc.stat.startsWith('R') ? `\x1b[1m${clip(line, width)}\x1b[0m` : clip(line, width);
	});

	return [...header.map(line => (line.includes('\x1b') ? line : clip(line, width))), ...rows].join('\x1b[K\r\n');
};

const top = api => {
	const opts = options(api, api.args, {flags: 'b', values: 'nd'});
	if (!opts) {
		return 1;
	}

	const iterations = opts.has('n') ? Number(opts.get('n')) : Infinity;
	const delay = Number(opts.get('d') ?? 3) * 1000;
	if (opts.has('b') || !api.stdout.isTTY) {
		if (!opts.has('b')) {
			api.err('top: failed tty get\n');
			return 1;
		}
		return (async () => {
			for (let i = 1; i <= iterations; i++) {
				api.out(`${stripAnsi(topFrame(api, snapshot(api, i), '', 80, Infinity)).replace(/\x1b\[K\r\n/g, '\n').replace(/\r\n/g, '\n')}\n\n`);
				if (i < iterations) {
					await api.sleep(delay);
				}
			}
			return 0;
		})();
	}

	let tick = 1;
	let prompt = null;
	let message = null;
	let processes = snapshot(api, tick);

	return fullScreen(api, {
		interval: delay,
		render: () => {
			if (!prompt) {
				processes = snapshot(api, tick++);
			}
			const status = prompt ? `${prompt.label}${prompt.value}` : message;
			message = null;
			return topFrame(api, processes, status && `\x1b[1m${status}\x1b[0m`, api.tty.columns(), api.tty.rows());
		},
		onKey: (data, quit) => {
			if (!prompt) {
				if (data === 'q' || data === '\x03') {
					quit();
				} else if (data === 'k') {
					const pid = String(processes[0]?.pid ?? '');
					prompt = {label: `PID to signal/kill [default pid = ${pid}] `, value: '', submit: value => {
						const target = Number(value || pid);
						prompt = {label: `Send pid ${target} signal [15/sigterm] `, value: '', submit: spec => {
							const signal = parseSignal(spec || '15');
							const result = signal ? api.shell.kill(target, signal) : 'invalid';
							message = {ok: null, denied: `Failed signal pid '${target}' with ${SIGNALS.indexOf(signal) + 1}: Operation not permitted`, missing: `Failed signal pid '${target}' with ${SIGNALS.indexOf(signal) + 1}: No such process`, invalid: ' Invalid signal'}[result];
							prompt = null;
						}};
					}};
				}
			} else if (data === '\r') {
				prompt.submit(prompt.value.trim());
			} else if (data === '\x1b' || data === '\x03') {
				prompt = null;
			} else if (data === '\x7f') {
				prompt.value = prompt.value.slice(0, -1);
			} else if (/^[\w-]+$/.test(data)) {
				prompt.value += data;
			}
		},
	});
};

const bar = (width, fraction, colour) => {
	const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * width);
	return `\x1b[${colour}m${'|'.repeat(filled)}\x1b[0m${' '.repeat(width - filled)}`;
};

const meter = (label, fraction, text, width, colour) => {
	const inner = Math.max(width - label.length - 2, 4);
	const room = Math.max(inner - text.length, 0);
	const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * room);
	return `\x1b[36m${label}\x1b[0m\x1b[1m[\x1b[0m${bar(filled, 1, colour)}${' '.repeat(room - filled)}\x1b[90m${text}\x1b[0m\x1b[1m]\x1b[0m`;
};

const gib = kib => `${(kib / 1_048_576).toFixed(kib >= 10_485_760 ? 1 : 2)}G`;
const htopSize = kib => (kib >= 1_048_576 ? `${(kib / 1_048_576).toFixed(1)}G` : kib >= 10240 ? `${Math.round(kib / 1024)}M` : String(kib));

const htop = api => {
	if (!api.stdout.isTTY) {
		api.err('htop: stdout is not a TTY\n');
		return 1;
	}

	let tick = 1;
	let selected = null;
	let signals = null;
	let processes = snapshot(api, tick);
	const menu = ['Cancel', ...SIGNALS.map(name => `SIG${name}`)];

	return fullScreen(api, {
		interval: 1500,
		render: () => {
			const width = api.tty.columns();
			const height = api.tty.rows();
			if (signals === null) {
				processes = snapshot(api, tick++);
			}
			selected ??= processes[0]?.pid;
			const index = Math.max(processes.findIndex(proc => proc.pid === selected), 0);
			selected = processes[index]?.pid;

			const {seconds, used, cpu} = summary(api, processes);
			const half = Math.floor(width / 2) - 1;
			const cores = [0, 1, 2, 3].map(core => Math.min(cpu / 400 * (0.6 + 0.8 * Math.abs(Math.sin(tick + core))), 1));
			const left = [
				...cores.map((share, core) => meter(`${String(core).padStart(4)}`, share, `${(share * 100).toFixed(1)}%`, half, 32)),
				meter('  Mem', used / MEMORY_KIB, `${gib(used)}/${gib(MEMORY_KIB)}`, half, 32),
				meter('  Swp', 0, `0K/${gib(SWAP_KIB)}`, half, 31),
			];
			const time = Math.floor(seconds);
			const right = [
				`\x1b[36mTasks: \x1b[0;1m${processes.length}\x1b[0;36m, \x1b[32m${processes.length * 3}\x1b[36m thr; \x1b[32m1\x1b[36m running\x1b[0m`,
				`\x1b[36mLoad average: \x1b[0;1m${(cpu / 30).toFixed(2)} \x1b[0;36m${(cpu / 45).toFixed(2)} ${(cpu / 80).toFixed(2)}\x1b[0m`,
				`\x1b[36mUptime: \x1b[0;1m${two(Math.floor(time / 3600))}:${two(Math.floor(time / 60) % 60)}:${two(time % 60)}\x1b[0m`,
			];
			const header = left.map((line, i) => `${line}  ${right[i] ?? ''}`);

			const columns = '    PID USER       PRI  NI  VIRT   RES   SHR S  CPU% MEM%   TIME+  Command';
			const table = height - header.length - 3;
			const offset = Math.min(Math.max(index - table + 1, 0), Math.max(processes.length - table, 0));
			const menuWidth = signals === null ? 0 : 16;
			const menuOffset = signals === null ? 0 : Math.max(signals - table + 1, 0);
			const rows = processes.slice(offset, offset + table).map((proc, i) => {
				const time = `${Math.floor(proc.time / 60)}:${(proc.time % 60).toFixed(2).padStart(5, '0')}`;
				const line = clip(`${String(proc.pid).padStart(7)} ${proc.user.slice(0, 9).padEnd(9)}  20   0 ${htopSize(proc.vsz).padStart(5)} ${htopSize(proc.rss).padStart(5)} ${htopSize(proc.shr).padStart(5)} ${proc.stat[0]} ${proc.cpu.toFixed(1).padStart(5)} ${proc.mem.toFixed(1).padStart(4)} ${time.padStart(8)}  ${proc.command}`, width - menuWidth);
				const row = proc.pid === selected ? `\x1b[7;36m${line.padEnd(width - menuWidth)}\x1b[0m` : line;
				if (signals === null) {
					return row;
				}
				const n = menuOffset + i;
				const label = menu[n] ? `${n === signals ? '\x1b[7;36m' : ''}${`${String(n).padStart(2)} ${menu[n]}`.padEnd(menuWidth)}\x1b[0m` : ' '.repeat(menuWidth);
				return label + row;
			});
			while (rows.length < table) {
				rows.push('');
			}

			const keys = signals !== null ? [['Enter', 'Send'], ['Esc', 'Cancel']] : [['F1', 'Help'], ['F2', 'Setup'], ['F3', 'Search'], ['F4', 'Filter'], ['F5', 'Tree'], ['F6', 'SortBy'], ['F7', 'Nice -'], ['F8', 'Nice +'], ['F9', 'Kill'], ['F10', 'Quit']];
			const footer = keys.map(([key, label]) => `\x1b[0m${key}\x1b[7;36m${label.padEnd(6)}`).join('');

			return [
				...header,
				'',
				`\x1b[7;32m${clip((signals === null ? columns : `${'Send signal:'.padEnd(menuWidth)}${columns}`).padEnd(width), width)}\x1b[0m`,
				...rows,
				`${footer}${' '.repeat(Math.max(width - stripAnsi(footer).length, 0))}\x1b[0m`,
			].join('\x1b[K\r\n');
		},
		onKey: (data, quit) => {
			const index = processes.findIndex(proc => proc.pid === selected);
			const move = to => {
				selected = processes[Math.min(Math.max(to, 0), processes.length - 1)]?.pid;
			};
			if (signals !== null) {
				if (is(data, 'up')) {
					signals = Math.max(signals - 1, 0);
				} else if (is(data, 'down')) {
					signals = Math.min(signals + 1, menu.length - 1);
				} else if (data === '\r') {
					if (signals > 0) {
						api.shell.kill(selected, SIGNALS[signals - 1]);
					}
					signals = null;
				} else if (data === '\x1b' || data === '\x03') {
					signals = null;
				}
			} else if (data === 'q' || data === '\x03' || is(data, 'f10')) {
				quit();
			} else if (is(data, 'f9') || data === 'k') {
				signals = SIGNALS.indexOf('TERM') + 1;
			} else if (is(data, 'up')) {
				move(index - 1);
			} else if (is(data, 'down')) {
				move(index + 1);
			} else if (is(data, 'pageUp')) {
				move(index - (api.tty.rows() - 10));
			} else if (is(data, 'pageDown')) {
				move(index + (api.tty.rows() - 10));
			} else if (is(data, 'home')) {
				move(0);
			} else if (is(data, 'end')) {
				move(processes.length - 1);
			}
		},
	});
};

// --- less and more ---

// The text to page through: a file, or what's piped in. {text, name} or an error code.
const pagerInput = async (api, operand) => {
	if (operand === undefined) {
		if (api.stdin.isTTY) {
			return null;
		}
		return {text: await api.readAll(), name: null};
	}

	const result = api.fs.read(api.resolve(operand));
	return result.error ? {error: result.error} : {text: result.text, name: operand};
};

// Lines as the screen shows them: wrapped at the terminal's width.
const screenLines = (text, width, chop) => splitLines(stripAnsi(text)).lines.flatMap(line => {
	const chars = [...line.replace(/\t/g, '        ')];
	if (chop || chars.length <= width) {
		return [chars.slice(0, width).join('')];
	}
	const parts = [];
	for (let i = 0; i < chars.length; i += width) {
		parts.push(chars.slice(i, i + width).join(''));
	}
	return parts;
});

const less = async api => {
	const opts = options(api, api.args, {flags: 'NSRFXrisMmeEqQ', long: {'LINE-NUMBERS': 'N', 'chop-long-lines': 'S', 'RAW-CONTROL-CHARS': 'R', 'quit-if-one-screen': 'F'}});
	if (!opts) {
		return 1;
	}

	const input = await pagerInput(api, opts.operands[0]);
	if (!input) {
		api.err('Missing filename ("less --help" for help)\n');
		return 1;
	} else if (input.error) {
		api.err(`${opts.operands[0]}: ${input.error === 'Is a directory' ? 'is a directory' : input.error}\n`);
		return 1;
	} else if (!api.stdout.isTTY) {
		api.out(input.text);
		return 0;
	}

	const {lines: source} = splitLines(input.text);
	const numbered = opts.has('N') ? source.map((line, i) => `${String(i + 1).padStart(7)} ${line}`).join('\n') : input.text;
	if (opts.has('F') && screenLines(numbered, api.tty.columns(), opts.has('S')).length < api.tty.rows()) {
		api.out(numbered.endsWith('\n') ? numbered : `${numbered}\n`);
		return 0;
	}

	let top = 0;
	let search = null;
	let pattern = null;
	let status = null;
	let first = true;
	const page = () => api.tty.rows() - 1;
	const lines = () => screenLines(numbered, api.tty.columns(), opts.has('S'));
	const last = () => Math.max(lines().length - page(), 0);
	const find = (from, step) => {
		const all = lines();
		for (let i = from; i >= 0 && i < all.length; i += step) {
			if (pattern.test(all[i])) {
				return i;
			}
		}
		return -1;
	};

	return fullScreen(api, {
		render: () => {
			const all = lines();
			top = Math.min(Math.max(top, 0), last());
			const shown = all.slice(top, top + page()).map(line => (pattern ? line.replace(new RegExp(pattern.source, 'gi'), match => `\x1b[7m${match}\x1b[27m`) : line));
			while (shown.length < page()) {
				shown.push('~');
			}

			let prompt = ':';
			if (search !== null) {
				prompt = `${search.direction}${search.value}`;
			} else if (status) {
				prompt = `\x1b[7m${status}\x1b[0m`;
			} else if (top >= last()) {
				prompt = '\x1b[7m(END)\x1b[0m';
			} else if (first && input.name) {
				prompt = `\x1b[7m${input.name}\x1b[0m`;
			}
			status = null;
			return [...shown, prompt].join('\x1b[K\r\n');
		},
		onKey: (data, quit) => {
			first = false;
			if (search !== null) {
				if (data === '\r') {
					try {
						pattern = search.value ? new RegExp(search.value, 'i') : pattern;
					} catch {
						pattern = null;
					}
					const direction = search.direction === '/' ? 1 : -1;
					search = null;
					const at = pattern ? find(top + direction, direction) : -1;
					if (at < 0) {
						status = 'Pattern not found  (press RETURN)';
					} else {
						top = at;
					}
				} else if (data === '\x1b' || data === '\x03') {
					search = null;
				} else if (data === '\x7f') {
					search = search.value ? {...search, value: search.value.slice(0, -1)} : null;
				} else if (!data.startsWith('\x1b')) {
					search.value += data;
				}
				return;
			}

			const half = Math.floor(page() / 2);
			const actions = {
				q: quit, Q: quit, ' ': () => (top += page()), f: () => (top += page()), '\x06': () => (top += page()), '\x16': () => (top += page()),
				b: () => (top -= page()), '\x02': () => (top -= page()), j: () => top++, e: () => top++, '\r': () => top++, '\x0e': () => top++,
				k: () => top--, y: () => top--, '\x10': () => top--, d: () => (top += half), '\x04': () => (top += half), u: () => (top -= half),
				'\x15': () => (top -= half), g: () => (top = 0), '<': () => (top = 0), G: () => (top = last()), '>': () => (top = last()),
				'/': () => (search = {direction: '/', value: ''}), '?': () => (search = {direction: '?', value: ''}),
				n: () => {
					const at = pattern ? find(top + 1, 1) : -1;
					top = at < 0 ? top : at;
				},
				N: () => {
					const at = pattern ? find(top - 1, -1) : -1;
					top = at < 0 ? top : at;
				},
			};
			const action = actions[data]
				|| (is(data, 'down') && actions.j) || (is(data, 'up') && actions.k) || (is(data, 'pageDown') && actions.f)
				|| (is(data, 'pageUp') && actions.b) || (is(data, 'home') && actions.g) || (is(data, 'end') && actions.G);
			if (action) {
				action();
			}
		},
	});
};

const more = async api => {
	const operand = api.args.find(arg => !arg.startsWith('-'));
	const input = await pagerInput(api, operand);
	if (!input) {
		api.err("more: bad usage\nTry 'more --help' for more information.\n");
		return 1;
	} else if (input.error) {
		api.err(`more: ${input.error === 'Is a directory' ? `${operand}: is a directory` : `cannot open ${operand}: ${input.error}`}\n`);
		return 1;
	} else if (!api.stdout.isTTY) {
		api.out(input.text);
		return 0;
	}

	const lines = screenLines(input.text, api.tty.columns(), false);
	let shown = 0;
	const show = count => {
		const next = lines.slice(shown, shown + count);
		api.out(next.map(line => `${line}\r\n`).join(''));
		shown += next.length;
	};
	show(api.tty.rows() - 1);
	if (shown >= lines.length) {
		return 0;
	}

	let quit;
	const done = new Promise(resolve => {
		quit = resolve;
	});
	const prompt = () => api.out(`\x1b[7m--More--${input.name ? `(${Math.floor((shown / lines.length) * 100)}%)` : ''}\x1b[0m`);
	const release = api.tty.raw(data => {
		api.out('\r\x1b[K');
		if (data === 'q' || data === 'Q' || data === '\x03') {
			quit();
			return;
		} else if (data === ' ' || data === 'f' || is(data, 'pageDown')) {
			show(api.tty.rows() - 1);
		} else if (data === '\r' || data === 'j' || is(data, 'down')) {
			show(1);
		} else if (data === 'd') {
			show(Math.floor(api.tty.rows() / 2));
		}

		if (shown >= lines.length) {
			quit();
		} else {
			prompt();
		}
	});

	prompt();
	try {
		await api.abort.race(done);
	} finally {
		release();
	}
	return 0;
};

export const PROGRAMS = {
	ps,
	top,
	htop,
	pkill,
	killall,
	less,
	more,
	kill: api => api.run(['kill', ...api.args]),
};
