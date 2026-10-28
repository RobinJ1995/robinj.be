import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, setup, stubStorage} from './test-helpers';
import {bootSequence, cancelShutdown, panicText, shutdownSequence} from './power';

const desktop = () => fakeSystem({processes: () => [{pid: 1337, name: 'desktop', started: new Date()}]});

beforeEach(() => {
	stubStorage();
	vi.useFakeTimers({now: new Date(2026, 9, 27, 22, 0, 0)});
});

afterEach(() => {
	cancelShutdown();
	vi.useRealTimers();
});

describe('poweroff and reboot', () => {
	it('go down at once, with the shutdown and boot sequences', async () => {
		const system = fakeSystem({bootedAt: new Date(Date.now() - 90_000)});
		const {run} = setup({system});

		await run('poweroff');
		const [{mode, shutdown, boot}] = system.halt.mock.calls[0];
		expect(mode).toBe('poweroff');
		expect(shutdown.at(-1).text).toBe('[   90.700000] reboot: Power down');
		expect(boot.at(-1).text).toBe('[  OK  ] Reached target graphical.target - Graphical Interface.');

		await run('reboot');
		expect(system.halt).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'reboot'}));
		expect(system.halt.mock.calls[1][0].shutdown.at(-1).text).toBe('[   90.700000] reboot: Restarting system');
	});
});

describe('shutdown', () => {
	it('goes down now when told', async () => {
		const system = fakeSystem();
		const {run} = setup({system});

		expect(await run('shutdown -r now')).toBe('');
		expect(system.halt).toHaveBeenCalledWith(expect.objectContaining({mode: 'reboot'}));
	});

	it('waits until tomorrow for a time that has passed today', async () => {
		const system = fakeSystem();
		const {run} = setup({system});

		expect(await run('shutdown -h 21:30 "see you"')).toMatch(/^Shutdown scheduled for Wed 2026-10-28 21:30:00 /);
		await vi.advanceTimersByTimeAsync(23.5 * 3_600_000 - 1);
		expect(system.halt).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(system.halt).toHaveBeenCalledWith(expect.objectContaining({mode: 'poweroff'}));
	});

	it('defaults to a minute from now', async () => {
		const system = fakeSystem();
		const {run} = setup({system});

		expect(await run('shutdown')).toMatch(/^Shutdown scheduled for Tue 2026-10-27 22:01:00 /);
	});

	it('rejects times it cannot read', async () => {
		const {shell, run} = setup();

		expect(await run('shutdown soon')).toBe('Failed to parse time specification: soon');
		expect(shell.state.status).toBe(1);
	});

	it('only announces a cancellation when something was scheduled', async () => {
		const {run} = setup();

		expect(await run('shutdown -c')).toBe('');
	});
});

describe('killing the desktop', () => {
	it('panics the kernel, with the signal in the exit code', async () => {
		const system = desktop();
		const {run} = setup({system});

		await run('kill -USR1 1337');
		const {mode, lines} = system.halt.mock.calls[0][0];
		expect(mode).toBe('panic');
		expect(lines[0]).toMatch(/^\[ +\d+\.\d{6}\] Kernel panic - not syncing: Critical system component died! exitcode=0x0000000f$/);
		expect(lines[1]).toMatch(/CPU: 3 PID: 1337 Comm: desktop /);
		expect(lines[24]).toMatch(/ a0 : 000000000000000f a1 : 0000000000000539$/);
		expect(lines.at(-1)).toMatch(/---\[ end Kernel panic - not syncing: Critical system component died! exitcode=0x0000000f \]---$/);
	});

	it('cancels a scheduled shutdown', async () => {
		const system = desktop();
		const {run} = setup({system});

		await run('shutdown +5');
		await run('kill -SEGV 1337');
		await vi.advanceTimersByTimeAsync(600_000);
		expect(system.halt).toHaveBeenCalledTimes(1);
		expect(system.halt.mock.calls[0][0].lines[0]).toMatch(/exitcode=0x0000000b$/);
	});

	it('names what brought it down, and why, when told', () => {
		const lines = panicText({uptime: 12, pid: 4242, comm: 'rmmod', cause: 'Fatal exception'});

		expect(lines[0]).toMatch(/^\[ +12\.\d{6}\] Kernel panic - not syncing: Fatal exception$/);
		expect(lines[1]).toMatch(/CPU: 3 PID: 4242 Comm: rmmod /);
		expect(lines.at(-1)).toMatch(/---\[ end Kernel panic - not syncing: Fatal exception \]---$/);
	});

	it('is fine with harmless signals', async () => {
		const system = desktop();
		const {run} = setup({system});

		await run('kill -STOP 1337; kill -0 1337');
		expect(system.halt).not.toHaveBeenCalled();
	});
});

describe('the console sequences', () => {
	it('bounce the stop job\'s asterisks while it waits', () => {
		const stopJob = shutdownSequence({uptime: 1, reboot: false}).filter(line => line.text.includes('A stop job is running'));

		expect(stopJob.map(line => line.text.slice(0, 8))).toEqual(['[*     ]', '[**    ]', '[***   ]', '[ ***  ]', '[  *** ]', '[   ***]', '[  *** ]', '[ ***  ]', '[***   ]', '[**    ]', '[*     ]', '[**    ]', '[***   ]']);
		expect(stopJob.map(line => line.replace)).toEqual([false, ...Array(12).fill(true)]);
	});

	it('boot from the kernel to the desktop', () => {
		const lines = bootSequence().map(line => line.text);

		expect(lines[0]).toBe('[    0.000000] Booting Linux on hartid 0');
		expect(lines).toContain('Welcome to RobinOS 1.0.0 (Web Edition)!');
	});
});
