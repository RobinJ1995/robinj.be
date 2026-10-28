import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, setup, stubStorage} from './test-helpers';

const DAY = 86_400_000;

const desktop = (overrides = {}) => fakeSystem({
	processes: () => [{pid: 1337, name: 'desktop', started: new Date()}, {pid: 1402, name: 'web', started: new Date()}],
	...overrides,
});

// The pid shown in the highlighted row of htop's last frame.
const highlighted = output => output.slice(output.lastIndexOf('\x1b[H')).match(/\x1b\[7;36m +(\d+) /)?.[1];

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('ps', () => {
	it('shows every process in SysV style, with how long it has been running', async () => {
		vi.useFakeTimers({now: new Date('2026-10-28T12:00:00'), toFake: ['Date']});
		const {run} = setup({system: desktop({bootedAt: new Date('2026-10-25T08:00:00')})});

		const lines = (await run('ps -ef')).split('\n');
		expect(lines[0]).toBe('UID          PID    PPID  C STIME TTY          TIME CMD');
		expect(lines[1]).toBe('root           1       0  0 Oct25 ?        00:04:33 /usr/lib/systemd/systemd --s');
		expect(lines.every(line => line.length <= 80)).toBe(true);
		expect(await run('ps -ef | grep "[o]omd"')).toBe('systemd+     774       1  0 Oct25 ?        00:00:00 /usr/lib/systemd/systemd-oomd');
		expect(await run('ps -eF | head -1')).toBe(lines[0]);
	});

	it('shows BSD-style listings: all, a terminal\'s, or Robin\'s own', async () => {
		const {run} = setup({system: desktop()});

		expect(await run('ps aux | head -2')).toMatch(/^USER +PID %CPU %MEM +VSZ +RSS TTY +STAT START +TIME COMMAND\nroot +1 +0\.1 +0\.1 172480 17744 \? +Ss +\d\d:\d\d +0:00 \/usr\/lib\/systemd\/systemd --switched-root/);
		expect(await run('ps aux | grep -c .')).toBe('25');
		expect(await run('ps u')).toMatch(/^USER.*\nrobin +2000 +0\.0 +0\.0 +9216 +7168 pts\/0 +Ss +\d\d:\d\d +0:00 bash\nrobin +\d+ +0\.0 +0\.0 +13312 +4096 pts\/0 +R\+ +\d\d:\d\d +0:00 ps u$/);
		expect(await run('ps x')).toMatch(/^ +PID TTY +STAT +TIME COMMAND\n +1290 \? +Ss +0:00 \/usr\/lib\/systemd\/systemd --user\n +1337 \? +Ssl +0:00 \/usr\/bin\/desktop\n +1402 \? +Sl +0:00 \/usr\/bin\/web https:\/\/robinj\.be\/\n +2000 pts\/0 +Ss +0:00 bash\n +\d+ pts\/0 +R\+ +0:00 ps x$/);
		expect(await run('ps a')).toMatch(/^ +PID TTY +STAT +TIME COMMAND\n +2000 pts\/0 +Ss +0:00 bash\n +\d+ pts\/0 +R\+ +0:00 ps a$/);
		expect(await run('ps axww | wc -l')).toBe('25');
	});

	it('shows the video player as the Python program it is', async () => {
		const {run} = setup({system: fakeSystem({processes: () => [{pid: 1500, name: 'video-player', started: new Date()}]})});

		expect(await run('ps -p 1500 -f | tail -1')).toMatch(/^robin +1500 +1290 +\d+ \d\d:\d\d \? +00:00:00 \/usr\/bin\/python3 \/usr\/bin\/video-player$/);
		expect(await run('ps -p 1500')).toBe('    PID TTY          TIME CMD\n   1500 ?        00:00:00 video-player');
	});

	it('picks processes by pid, failing when none are left', async () => {
		const {shell, run} = setup({system: desktop()});

		expect(await run('ps -p 1,1402')).toBe('    PID TTY          TIME CMD\n      1 ?        00:00:00 systemd\n   1402 ?        00:00:00 web');
		expect(await run('ps p 1290')).toBe('    PID TTY          TIME CMD\n   1290 ?        00:00:00 systemd');
		expect(await run('ps -p 99999')).toBe('    PID TTY          TIME CMD');
		expect(shell.state.status).toBe(1);
	});

	it('rejects options it does not know', async () => {
		const {shell, run} = setup();

		expect(await run('ps -z')).toMatch(/^error: unsupported SysV option\n\nUsage:\n ps \[options\]\n/);
		expect(shell.state.status).toBe(1);
		expect(await run('ps q')).toMatch(/^error: unsupported option \(BSD syntax\)\n/);
		expect(shell.state.status).toBe(1);
	});
});

describe('kill', () => {
	it('is also a program, which does what the builtin does', async () => {
		const system = desktop();
		const {run} = setup({system});

		expect(await run('/usr/bin/kill -l 9')).toBe('KILL');
		expect(await run('/usr/bin/kill 1402')).toBe('');
		expect(system.kill).toHaveBeenCalledWith(1402, 'TERM');
	});
});

describe('pkill', () => {
	it('signals processes whose name matches, and can say which', async () => {
		const system = desktop();
		const {shell, run} = setup({system});

		expect(await run('pkill -9 we')).toBe('');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'KILL');
		expect(await run('pkill -e web')).toBe('web killed (pid 1402)');
		expect(await run('pkill --signal=HUP -c "^web$"')).toBe('1');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'HUP');
		expect(await run('pkill -x we')).toBe('');
		expect(shell.state.status).toBe(1);
	});

	it('matches whole command lines with -f', async () => {
		const system = desktop();
		const {run} = setup({system});

		await run('pkill -f robinj\\.be');
		expect(system.kill).toHaveBeenCalledTimes(1);
		expect(system.kill).toHaveBeenCalledWith(1402, 'TERM');
	});

	it('takes only the newest match with -n', async () => {
		const {shell, run} = setup({system: desktop()});

		expect(await run('pkill -n systemd')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(await run('pkill -x systemd')).toBe('pkill: killing pid 1 failed: Operation not permitted');
	});

	it('takes the signal from --signal, and checks it', async () => {
		const system = desktop();
		const {shell, run} = setup({system});

		expect(await run('pkill --signal KILL web')).toBe('');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'KILL');
		expect(await run('pkill --signal=BOGUS web')).toBe('pkill: Unknown signal "BOGUS".');
		expect(shell.state.status).toBe(2);
		expect(system.kill).toHaveBeenCalledTimes(1);
		expect(await run('pkill -s 1 web')).toBe("pkill: invalid option -- 's'\nTry 'pkill --help' for more information.");
	});

	it('never matches itself', async () => {
		const {shell, run} = setup();

		expect(await run('pkill pkill')).toBe('');
		expect(shell.state.status).toBe(1);
	});

	it('complains about bad patterns, options and missing criteria', async () => {
		const {shell, run} = setup();

		expect(await run('pkill')).toBe("pkill: no matching criteria specified\nTry `pkill --help' for more information.");
		expect(shell.state.status).toBe(2);
		expect(await run('pkill "("')).toBe('pkill: invalid pattern');
		expect(shell.state.status).toBe(2);
		expect(await run('pkill -z web')).toBe("pkill: invalid option -- 'z'\nTry 'pkill --help' for more information.");
		expect(shell.state.status).toBe(2);
	});
});

describe('killall', () => {
	it('lists signals, and its version', async () => {
		const {run} = setup();

		expect(await run('killall -l')).toBe('HUP INT QUIT ILL TRAP ABRT BUS FPE KILL USR1 SEGV USR2 PIPE ALRM TERM STKFLT\nCHLD CONT STOP TSTP TTIN TTOU URG XCPU XFSZ VTALRM PROF WINCH POLL PWR SYS');
		expect(await run('killall --version')).toBe('killall (PSmisc) 23.7\nCopyright (C) 1993-2024 Werner Almesberger and Craig Small');
	});

	it('needs a name, and knows its options', async () => {
		const {shell, run} = setup();

		expect(await run('killall')).toMatch(/^Usage: killall \[OPTION\]\.\.\. \[--\] NAME\.\.\.\n/);
		expect(shell.state.status).toBe(1);
		expect(await run('killall -z web')).toMatch(/^killall: invalid option -- 'z'\nUsage: killall/);
		expect(shell.state.status).toBe(1);
	});

	it('sends the signal it is given', async () => {
		const system = desktop();
		const {shell, run} = setup({system});

		await run('killall -s KILL web');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'KILL');
		await run('killall --signal HUP -- web');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'HUP');
		expect(await run('killall -s BOGUS web')).toBe('killall: BOGUS: unknown signal; killall -l lists signals.');
		expect(shell.state.status).toBe(1);
		expect(await run('killall -s')).toBe('killall: : unknown signal; killall -l lists signals.');
	});

	it('only kills what it may, and says why not', async () => {
		const system = desktop({kill: vi.fn(() => 'missing')});
		const {shell, run} = setup({system});

		expect(await run('killall systemd')).toBe('systemd(1): Operation not permitted');
		expect(shell.state.status).toBe(0);
		expect(await run('killall -u root systemd')).toBe('systemd(1): Operation not permitted');
		expect(shell.state.status).toBe(1);
		expect(await run('killall web')).toBe('web(1402): No such process');
		expect(await run('killall -q web nothing')).toBe('');
		expect(shell.state.status).toBe(1);
	});

	it('compares long names on their first 15 characters, unless told to be exact', async () => {
		const {run} = setup();

		expect(await run('killall pool_workqueue_and_more')).toBe('pool_workqueue_release(3): Operation not permitted');
		expect(await run('killall -e pool_workqueue_and_more')).toBe('pool_workqueue_and_more: no process found');
	});

	it('matches regular expressions and ignores case when asked', async () => {
		const system = fakeSystem({processes: () => [{pid: 1402, name: 'web', started: new Date()}]});
		const {run} = setup({system});

		await run('killall -r "^w.b$"');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'TERM');
		expect(await run('killall -I WEB --verbose')).toBe('Killed web(1402) with signal 15');
		expect(await run('killall -rI "^WE"')).toBe('');
		expect(system.kill).toHaveBeenCalledTimes(3);
		expect(await run('killall -r "("')).toBe('killall: Bad regular expression: (');
	});

	it('asks first with -i', async () => {
		const system = desktop();
		const {run} = setup({system, input: ['n\n', 'y\n']});

		expect(await run('killall -i web')).toBe('Kill web(1402) ? (y/N) ');
		expect(system.kill).not.toHaveBeenCalled();
		await run('killall --interactive web');
		expect(system.kill).toHaveBeenCalledWith(1402, 'TERM');
	});
});

describe('top', () => {
	it('prints frames in batch mode, as many as asked, a delay apart', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({system: desktop({bootedAt: new Date(Date.now() - 3 * DAY - 13 * 60_000)})});

		const running = shell.execute('top -b -n 2 -d 2');
		await vi.advanceTimersByTimeAsync(1999);
		expect(tty.take().match(/^top - /gm)).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		await running;

		const frame = tty.take().split('\n');
		expect(frame[0]).toMatch(/^top - \d\d:\d\d:\d\d up 3 days, 13 min, {2}1 user, {2}load average: \d+\.\d\d, \d+\.\d\d, \d+\.\d\d$/);
		expect(frame[1]).toBe('Tasks:  23 total,   1 running,  22 sleeping,   0 stopped,   0 zombie');
		expect(frame[3]).toMatch(/^MiB Mem : {2}15731\.5 total, +[\d.]+ free, +[\d.]+ used, +2201\.2 buff\/cache$/);
		expect(frame[4]).toMatch(/^MiB Swap: {3}8192\.0 total, {3}8192\.0 free, {6}0\.0 used\. +[\d.]+ avail Mem$/);
		expect(frame[6].trimEnd()).toBe('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
		// Busiest first: the desktop, then the website.
		expect(frame[7]).toMatch(/^ +1337 robin +20 +0 5368712 +421888 +126566 S +\d\.\d +2\.6 +\d+:\d\d\.\d\d desktop$/);
		expect(frame[8]).toMatch(/ web$/);
	});

	it('shows uptimes under an hour in minutes, and over a day with the clock', async () => {
		const {run} = setup({system: fakeSystem({bootedAt: new Date(Date.now() - 42 * 60_000)})});
		expect(await run('top -bn1 | head -1')).toMatch(/ up 42 min, /);

		const {run: later} = setup({system: fakeSystem({bootedAt: new Date(Date.now() - DAY - 3 * 3_600_000 - 5 * 60_000)})});
		expect(await later('top -bn1 | head -1')).toMatch(/ up 1 day, {2}3:05, /);
	});

	it('needs a terminal unless in batch mode', async () => {
		const {run} = setup();

		expect(await run('top > /dev/null; echo $?')).toBe('top: failed tty get\n1');
		expect(await run('top -x')).toBe("top: invalid option -- 'x'\nTry 'top --help' for more information.");
	});

	it('takes over the screen until q, refreshing every few seconds', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({system: desktop()});

		const running = shell.execute('top -d 1');
		await tty.press();
		expect(tty.take({codes: true})).toMatch(/^\x1b\[\?1049h\x1b\[\?25l\x1b\[H/);
		await vi.advanceTimersByTimeAsync(2000);
		expect(tty.take({codes: true}).match(/\x1b\[H/g)).toHaveLength(2);

		await tty.press('q');
		await running;
		expect(tty.take({codes: true})).toMatch(/\x1b\[\?25h\x1b\[\?1049l$/);
		expect(tty.isRaw()).toBe(false);
		expect(shell.state.status).toBe(0);
	});

	it('draws the frame to fit the terminal, running processes in bold', async () => {
		const {shell, tty} = setup({system: desktop(), columns: 60, rows: 10});

		const running = shell.execute('top');
		await tty.press();
		const screen = tty.screen();
		const output = tty.take({codes: true});
		await tty.press('\x03');
		await running;

		expect(screen).toHaveLength(10);
		expect(screen.every(line => line.length <= 60)).toBe(true);
		expect(output).toMatch(/\x1b\[1m {3}2001 robin [^\x1b]{46}\x1b\[0m/);
	});

	it('signals a process: k, a pid, then a signal', async () => {
		const system = fakeSystem({processes: () => [{pid: 1402, name: 'web', started: new Date()}]});
		const {shell, tty} = setup({system});

		const running = shell.execute('top');
		await tty.press('k');
		expect(tty.screen()[5]).toBe('PID to signal/kill [default pid = 1402] ');
		await tty.press('1', '4', '0', '3', '\x7f', '2', '\r');
		expect(tty.screen()[5]).toBe('Send pid 1402 signal [15/sigterm] ');
		await tty.press('9', '\r');
		expect(system.kill).toHaveBeenCalledWith(1402, 'KILL');
		expect(tty.screen()[5]).toBe('');

		await tty.press('k', '\r', 'HUP', '\r');
		expect(system.kill).toHaveBeenLastCalledWith(1402, 'HUP');

		await tty.press('q');
		await running;
		expect(shell.state.status).toBe(0);
	});

	it('says why a signal could not be sent', async () => {
		const {shell, tty} = setup({system: desktop()});

		const running = shell.execute('top');
		await tty.press('k', '1', '\r', '\r');
		expect(tty.screen()[5]).toBe("Failed signal pid '1' with 15: Operation not permitted");
		await tty.press('k', '99999', '\r', 'TERM', '\r');
		expect(tty.screen()[5]).toBe("Failed signal pid '99999' with 15: No such process");
		await tty.press('k', '1', '\r', 'BOGUS', '\r');
		expect(tty.screen()[5]).toBe(' Invalid signal');
		await tty.press('x');
		expect(tty.screen()[5]).toBe('');

		await tty.press('q');
		await running;
	});

	it('cancels the prompt with Escape or ^C, and ignores keys it does not use', async () => {
		const system = desktop();
		const {shell, tty} = setup({system});

		const running = shell.execute('top');
		await tty.press('k', '!', '\x1b');
		expect(tty.screen()[5]).toBe('');
		await tty.press('k', '1', '\x03');
		expect(tty.screen()[5]).toBe('');
		expect(tty.isRaw()).toBe(true);
		await tty.press('\x03');
		await running;
		expect(system.kill).not.toHaveBeenCalled();
	});

	it('keeps the list still while asking which process to signal', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({system: desktop()});

		const running = shell.execute('top');
		await tty.press('k');
		const asking = tty.screen().slice(7);
		await vi.advanceTimersByTimeAsync(3000);
		expect(tty.screen().slice(7)).toEqual(asking);
		await tty.press('\x1b');
		await vi.advanceTimersByTimeAsync(3000);
		expect(tty.screen().slice(7)).not.toEqual(asking);

		await tty.press('q');
		await running;
	});

	it('gives the terminal back when interrupted', async () => {
		const {shell, tty} = setup();

		const running = shell.execute('top');
		await tty.press();
		shell.interrupt();
		await running;

		expect(tty.isRaw()).toBe(false);
		expect(tty.take({codes: true})).toMatch(/\x1b\[\?25h\x1b\[\?1049l\n$/);
		expect(shell.state.status).toBe(130);
	});
});

describe('htop', () => {
	it('needs a terminal', async () => {
		const {run} = setup();

		expect(await run('htop | cat')).toBe('htop: stdout is not a TTY');
	});

	it('shows meters, the busiest processes and its keys', async () => {
		const {shell, tty} = setup({system: desktop({bootedAt: new Date(Date.now() - 3_723_000)})});

		const running = shell.execute('htop');
		await tty.press();
		const screen = tty.screen();
		await tty.press('q');
		await running;

		expect(screen).toHaveLength(24);
		expect(screen[0]).toMatch(/^ {3}0\[\|*\s+\d+\.\d%\] {2}Tasks: 23, 69 thr; 1 running$/);
		expect(screen[1]).toMatch(/^ {3}1\[.*\] {2}Load average: \d+\.\d\d \d+\.\d\d \d+\.\d\d$/);
		expect(screen[2]).toMatch(/^ {3}2\[.*\] {2}Uptime: 01:02:0[34]$/);
		expect(screen[4]).toMatch(/^ {2}Mem\[\|+ +\d\.\d\dG\/15\.4G\] {2}$/);
		expect(screen[5]).toBe(`  Swp[${' '.repeat(24)}0K/8.00G]  `);
		expect(screen[7]).toBe('    PID USER       PRI  NI  VIRT   RES   SHR S  CPU% MEM%   TIME+  Command'.padEnd(80));
		expect(screen[8]).toMatch(/^ +1337 robin +20 +0 +5\.1G +412M +124M S +\d\.\d +2\.6 +0:00\.\d\d {2}\/usr\/bin\/desk$/);
		expect(screen[9]).toMatch(/^ +1402 robin +20 +0 +12\.0G +1\.5G +461M S /);
		expect(screen[23]).toBe('F1Help  F2Setup F3SearchF4FilterF5Tree  F6SortByF7Nice -F8Nice +F9Kill  F10Quit  ');
	});

	it('moves the selection with the arrow, page, home and end keys', async () => {
		const {shell, tty} = setup({system: desktop(), rows: 15});

		const running = shell.execute('htop');
		await tty.press();
		expect(highlighted(tty.take({codes: true}))).toBe('1337');
		await tty.press('\x1b[B');
		expect(highlighted(tty.take({codes: true}))).toBe('1402');
		await tty.press('\x1bOA');
		expect(highlighted(tty.take({codes: true}))).toBe('1337');
		await tty.press('\x1b[F');
		expect(tty.screen()[13]).toMatch(/^ +2000 robin .* bash +$/);
		expect(highlighted(tty.take({codes: true}))).toBe('2000');
		await tty.press('\x1b[5~');
		expect(highlighted(tty.take({codes: true}))).not.toBe('2000');
		await tty.press('\x1b[H');
		expect(highlighted(tty.take({codes: true}))).toBe('1337');
		await tty.press('\x1b[6~', '\x1b[1~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~', '\x1b[6~');
		expect(highlighted(tty.take({codes: true}))).toBe('2000');

		await tty.press('\x1b[21~');
		await running;
		expect(shell.state.status).toBe(0);
	});

	it('sends the selected process a signal from its menu', async () => {
		const system = desktop();
		const {shell, tty} = setup({system});

		const running = shell.execute('htop');
		await tty.press('\x1b[B', '\x1b[20~');
		const menu = tty.screen();
		expect(menu[7]).toMatch(/^Send signal: {4} +PID USER/);
		expect(menu.slice(8, 23).map(line => line.slice(0, 16).trim())).toEqual(['1 SIGHUP', '2 SIGINT', '3 SIGQUIT', '4 SIGILL', '5 SIGTRAP', '6 SIGABRT', '7 SIGBUS', '8 SIGFPE', '9 SIGKILL', '10 SIGUSR1', '11 SIGSEGV', '12 SIGUSR2', '13 SIGPIPE', '14 SIGALRM', '15 SIGTERM']);
		expect(menu[23]).toMatch(/^EnterSend {2}EscCancel/);
		expect(tty.take({codes: true})).toMatch(/\x1b\[7;36m15 SIGTERM {6}\x1b\[0m/);

		await tty.press('\x1b[A', '\r');
		expect(system.kill).toHaveBeenCalledWith(1402, 'ALRM');
		expect(tty.screen()[7]).toMatch(/^ {4}PID USER/);

		await tty.press('k', '\x1b[B', '\x1b[B', '\x1b[B', '\x03');
		await tty.press('k', '\x1b[A', '\x1b[A', '\x1b');
		expect(system.kill).toHaveBeenCalledTimes(1);

		await tty.press('q');
		await running;
	});

	it('scrolls the signal menu, and Cancel sends nothing', async () => {
		const system = desktop();
		const {shell, tty} = setup({system});

		const running = shell.execute('htop');
		await tty.press('k', ...Array(20).fill('\x1b[B'));
		expect(tty.screen()[22].slice(0, 16).trim()).toBe('31 SIGSYS');
		await tty.press(...Array(40).fill('\x1b[A'));
		expect(tty.screen()[8].slice(0, 16).trim()).toBe('0 Cancel');
		await tty.press('\r');
		expect(system.kill).not.toHaveBeenCalled();

		await tty.press('\x03');
		await running;
	});

	it('fits its column headings to a narrow terminal', async () => {
		const {shell, tty} = setup({columns: 40});

		const running = shell.execute('htop');
		await tty.press();
		expect(tty.screen()[7]).toBe('    PID USER       PRI  NI  VIRT   RES  ');
		await tty.press('k');
		expect(tty.screen()[7]).toBe('Send signal:        PID USER       PRI  ');
		await tty.press('\x1b', 'q');
		await running;
	});

	it('refreshes every second and a half', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute('htop');
		await tty.press();
		tty.take();
		await vi.advanceTimersByTimeAsync(3000);
		expect(tty.take({codes: true}).match(/\x1b\[H/g)).toHaveLength(2);

		await tty.press('q');
		await running;
	});
});

describe('less', () => {
	const os = ['NAME="RobinOS"', 'VERSION="1.0.0 (Web Edition)"', 'RELEASE_TYPE=stable', 'ID=robinj', 'ID_LIKE=fedora', 'VERSION_ID=1.0.0', 'VERSION_CODENAME="Hidden Bits"', 'PRETTY_NAME="RobinOS 1.0.0 (Web Edition)"', 'HOME_URL="https://robinj.be/"', 'VARIANT="Web Edition"', 'VARIANT_ID=web'];
	const page = (top, prompt) => [...os.slice(top, top + 5), prompt];

	it('says what is wrong with what it was given', async () => {
		const {shell, run} = setup();

		expect(await run('less')).toBe('Missing filename ("less --help" for help)');
		expect(shell.state.status).toBe(1);
		expect(await run('less nope')).toBe('nope: No such file or directory');
		expect(await run('less /etc')).toBe('/etc: is a directory');
		expect(await run('less -y /etc/hostname')).toBe("less: invalid option -- 'y'\nTry 'less --help' for more information.");
		expect(shell.state.status).toBe(1);
	});

	it('just copies when it is not writing to a terminal', async () => {
		const {run} = setup();

		expect(await run('less contact.yml | head -1')).toBe('# Hi!');
		expect(await run('echo piped | less | cat')).toBe('piped');
	});

	it('prints what fits on one screen straight away with -F', async () => {
		const {shell, tty, run} = setup();

		expect(await run('less -F /etc/passwd')).toBe('root:x:0:0:Super User:/root:/bin/bash\nbin:x:1:1:bin:/bin:/usr/sbin/nologin\nrobin:x:1000:1000:Robin Jacobs:/home/robin:/bin/bash');
		expect(await run('less -FN /etc/hostname')).toBe('      1 robinj.be');
		expect(await run('printf "no newline" | less -F')).toBe('no newline');
		expect(tty.isRaw()).toBe(false);
		expect(shell.state.status).toBe(0);
	});

	it('pages through a file, a screen or a line at a time', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press();
		expect(tty.screen()).toEqual(page(0, '/etc/os-release'));
		await tty.press(' ');
		expect(tty.screen()).toEqual(page(5, ':'));
		await tty.press('f');
		expect(tty.screen()).toEqual(page(6, '(END)'));
		await tty.press('b', 'j');
		expect(tty.screen()).toEqual(page(2, ':'));
		await tty.press('k', 'e', '\r', '\x0e', 'y', '\x10');
		expect(tty.screen()).toEqual(page(2, ':'));
		await tty.press('d');
		expect(tty.screen()).toEqual(page(4, ':'));
		await tty.press('u', '\x02', '\x06');
		expect(tty.screen()).toEqual(page(5, ':'));
		await tty.press('\x04', '\x15', '\x16');
		expect(tty.screen()).toEqual(page(6, '(END)'));
		await tty.press('g');
		expect(tty.screen()).toEqual(page(0, ':'));
		await tty.press('G', '<');
		expect(tty.screen()).toEqual(page(0, ':'));
		await tty.press('>');
		expect(tty.screen()).toEqual(page(6, '(END)'));

		await tty.press('q');
		await running;
		expect(tty.isRaw()).toBe(false);
		expect(shell.state.status).toBe(0);
	});

	it('moves with the arrow, page, home and end keys', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('\x1b[B', '\x1bOB');
		expect(tty.screen()[0]).toBe(os[2]);
		await tty.press('\x1b[A');
		expect(tty.screen()[0]).toBe(os[1]);
		await tty.press('\x1b[6~');
		expect(tty.screen()[0]).toBe(os[6]);
		await tty.press('\x1b[5~');
		expect(tty.screen()[0]).toBe(os[1]);
		await tty.press('\x1b[4~');
		expect(tty.screen()).toEqual(page(6, '(END)'));
		await tty.press('\x1bOH');
		expect(tty.screen()[0]).toBe(os[0]);

		await tty.press('q');
		await running;
	});

	it('scrolls down with the down arrow, and ignores keys it does not know', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('\x1b[B', '\x1bOB', '\x1b[Z', 'z');
		expect(tty.screen()).toEqual(page(2, ':'));

		await tty.press('Q');
		await running;
	});

	it('searches forwards and backwards, ignoring case', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('/', 'i', 'd');
		expect(tty.screen()[5]).toBe('/id');
		await tty.press('\r');
		expect(tty.screen()).toEqual(page(3, ':'));
		await tty.press('n');
		expect(tty.screen()[0]).toBe('ID_LIKE=fedora');
		await tty.press('n', 'N');
		expect(tty.screen()[0]).toBe('ID_LIKE=fedora');
		await tty.press('G', '?', 'v', 'e', 'r', '\r');
		expect(tty.screen()[0]).toBe('VERSION_ID=1.0.0');
		await tty.press('?', '\r');
		expect(tty.screen()[0]).toBe('VERSION="1.0.0 (Web Edition)"');

		await tty.press('q');
		await running;
	});

	it('highlights what it found, whatever its case', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('/', 'id', '\r');
		expect(tty.take({codes: true})).toMatch(/\x1b\[7mID\x1b\[27m=robinj\x1b\[K\r\n\x1b\[7mID\x1b\[27m_LIKE=fedora/);

		await tty.press('q');
		await running;
	});

	it('highlights what it found', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('/', 'robinj', '\r');
		expect(tty.screen()).toEqual(page(3, ':'));
		expect(tty.take({codes: true})).toMatch(/ID=\x1b\[7mrobinj\x1b\[27m\x1b\[K\r\n/);

		await tty.press('q');
		await running;
	});

	it('says when a pattern is not found, or not a pattern at all', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('/', 'nowhere', '\r');
		expect(tty.screen()).toEqual(page(0, 'Pattern not found  (press RETURN)'));
		await tty.press('n');
		expect(tty.screen()).toEqual(page(0, ':'));
		await tty.press('/', '(', '\r');
		expect(tty.screen()[5]).toBe('Pattern not found  (press RETURN)');
		await tty.press('N');
		expect(tty.screen()).toEqual(page(0, ':'));

		await tty.press('q');
		await running;
	});

	it('edits and cancels a search', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('less /etc/os-release');
		await tty.press('/', 'a', 'b', '\x7f');
		expect(tty.screen()[5]).toBe('/a');
		await tty.press('\x1b[C', '\x7f', '\x7f');
		expect(tty.screen()[5]).toBe(':');
		await tty.press('/', 'web', '\x1b');
		expect(tty.screen()).toEqual(page(0, ':'));
		await tty.press('?', 'web', '\x03', 'q');
		await running;
		expect(shell.state.status).toBe(0);
	});

	it('wraps long lines to the terminal, or chops them with -S', async () => {
		const wrapped = setup({columns: 16, rows: 4});
		const wrapping = wrapped.shell.execute('less /etc/passwd');
		await wrapped.tty.press();
		expect(wrapped.tty.screen()).toEqual(['root:x:0:0:Super', ' User:/root:/bin', '/bash', '/etc/passwd']);
		await wrapped.tty.press('q');
		await wrapping;

		const chopped = setup({columns: 16, rows: 4});
		const chopping = chopped.shell.execute('less -S /etc/passwd');
		await chopped.tty.press();
		expect(chopped.tty.screen()).toEqual(['root:x:0:0:Super', 'bin:x:1:1:bin:/b', 'robin:x:1000:100', '(END)']);
		await chopped.tty.press('q');
		await chopping;
	});

	it('numbers lines with -N, and pages what is piped in', async () => {
		const {shell, tty} = setup({rows: 4});

		const running = shell.execute('printf "a\\tb\\n" | less -N');
		await tty.press();
		expect(tty.screen()).toEqual(['      1 a        b', '~', '~', '(END)']);
		await tty.press('q');
		await running;
	});
});

describe('more', () => {
	it('says what is wrong with what it was given', async () => {
		const {shell, run} = setup();

		expect(await run('more')).toBe("more: bad usage\nTry 'more --help' for more information.");
		expect(shell.state.status).toBe(1);
		expect(await run('more nope')).toBe('more: cannot open nope: No such file or directory');
		expect(await run('more /etc')).toBe('more: /etc: is a directory');
	});

	it('names the file it could not open, whatever options come first', async () => {
		const {run} = setup();

		expect(await run('more -d nope')).toBe('more: cannot open nope: No such file or directory');
		expect(await run('more -s /etc')).toBe('more: /etc: is a directory');
	});

	it('just prints what is short, or not going to a terminal', async () => {
		const {tty, run} = setup();

		expect(await run('more /etc/hostname')).toBe('robinj.be\r');
		expect(await run('more -d /etc/hostname | cat')).toBe('robinj.be');
		expect(tty.isRaw()).toBe(false);
	});

	it('shows a screen, then more as asked, until the end', async () => {
		const {shell, tty} = setup({rows: 6});

		const running = shell.execute('more /etc/os-release');
		await tty.press();
		expect(tty.take()).toBe('NAME="RobinOS"\r\nVERSION="1.0.0 (Web Edition)"\r\nRELEASE_TYPE=stable\r\nID=robinj\r\nID_LIKE=fedora\r\n--More--(45%)');
		await tty.press('\r');
		expect(tty.take()).toBe('\rVERSION_ID=1.0.0\r\n--More--(54%)');
		await tty.press('d', 'x');
		expect(tty.take()).toBe('\rVERSION_CODENAME="Hidden Bits"\r\nPRETTY_NAME="RobinOS 1.0.0 (Web Edition)"\r\nHOME_URL="https://robinj.be/"\r\n--More--(81%)\r--More--(81%)');
		await tty.press(' ');
		await running;
		expect(tty.take()).toBe('\rVARIANT="Web Edition"\r\nVARIANT_ID=web\r\n');
		expect(tty.isRaw()).toBe(false);
		expect(shell.state.status).toBe(0);
	});

	it('stops at q, and leaves out the percentage for piped text', async () => {
		const {shell, tty} = setup({rows: 3});

		const running = shell.execute('cat /etc/os-release | more');
		await tty.press('j');
		expect(tty.take()).toBe('NAME="RobinOS"\r\nVERSION="1.0.0 (Web Edition)"\r\n--More--\rRELEASE_TYPE=stable\r\n--More--');
		await tty.press('\x1b[B', 'f', 'Q');
		await running;
		expect(tty.isRaw()).toBe(false);
	});
});
