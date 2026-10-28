import {describe, it, expect, beforeEach} from 'vitest';
import {fakeSystem, setup, stubStorage} from './test-helpers';

const NOT_PERMITTED = "modprobe: ERROR: could not insert 'caffeine': Operation not permitted";
const DIRECTORY = '/lib/modules/1.0.0-rj1.riscv64';

beforeEach(() => {
	stubStorage();
});

describe('lsmod', () => {
	it('lists the modules the kernel has loaded, newest first', async () => {
		const {run} = setup({system: fakeSystem()});

		expect(await run('lsmod | head -4')).toBe('Module                  Size  Used by\nrubber_duck            12288  0\noxidize                45056  0\nnf_tables             393216  0');
		expect(await run('lsmod | grep -E "^(nfnetlink|nvme_core) "')).toBe('nfnetlink              20480  1 nf_tables\nnvme_core             204800  3 nvme');
		expect(await run('lsmod | wc -l')).toBe('21');
	});

	it('includes caffeine while it is loaded, and what it uses', async () => {
		const {run} = setup({system: fakeSystem({caffeinated: true})});

		expect(await run('lsmod | head -3')).toBe('Module                  Size  Used by\ncaffeine               16384  0\nrubber_duck            12288  0');
		expect(await run('lsmod | grep ^oxidize')).toBe('oxidize                45056  1 caffeine');
	});
});

describe('modprobe and rmmod', () => {
	it('need root to load or unload anything, but sudo lets them', async () => {
		const system = fakeSystem();
		const {shell, run} = setup({system});

		expect(await run('modprobe caffeine')).toBe(NOT_PERMITTED);
		expect(shell.state.status).toBe(1);
		expect(system.caffeinate).not.toHaveBeenCalled();
		expect(await run('sudo -n modprobe caffeine; lsmod | grep -c ^caffeine')).toBe('1');
		expect(system.caffeinate).toHaveBeenLastCalledWith(true);
		expect(await run('rmmod caffeine')).toBe("rmmod: ERROR: could not remove 'caffeine': Operation not permitted\nrmmod: ERROR: could not remove module caffeine: Operation not permitted");
		expect(await run('modprobe -r caffeine')).toBe("modprobe: ERROR: could not remove 'caffeine': Operation not permitted");
		expect(await run('sudo /usr/sbin/rmmod caffeine.ko; lsmod | grep -c ^caffeine')).toBe('0');
		expect(system.caffeinate).toHaveBeenLastCalledWith(false);
		expect(await run('sudo /usr/bin/modprobe caffeine && sudo /usr/sbin/modprobe -r caffeine; echo $?')).toBe('0');
		expect(system.caffeinate.mock.calls).toEqual([[true], [false], [true], [false]]);
		expect(await run('sudo -l | tail -1')).toBe('    (root) NOPASSWD: /usr/bin/dnf, /usr/sbin/modprobe, /usr/sbin/rmmod');
	});

	it('say what they did with -v, and nothing for what is loaded already', async () => {
		const system = fakeSystem();
		const {shell, run} = setup({system});

		expect(await run('sudo modprobe -v caffeine strength=9001')).toBe(`insmod ${DIRECTORY}/kernel/drivers/misc/caffeine.ko.xz`);
		expect(await run('modprobe caffeine; modprobe nvme; modprobe -a nvme btrfs; echo $?')).toBe('0');
		expect(await run('sudo modprobe -rv caffeine')).toBe(`rmmod ${DIRECTORY}/kernel/drivers/misc/caffeine.ko.xz`);
		expect(shell.state.status).toBe(0);
	});

	it('know which modules there are, and which are loaded', async () => {
		const {shell, run} = setup({system: fakeSystem()});

		expect(await run('modprobe nope')).toBe(`modprobe: FATAL: Module nope not found in directory ${DIRECTORY}`);
		expect(shell.state.status).toBe(1);
		expect(await run('modprobe -r nope')).toBe('modprobe: FATAL: Module nope not found.');
		expect(await run('sudo modprobe --remove caffeine')).toBe('modprobe: FATAL: Module caffeine is not in kernel.');
		expect(await run('rmmod caffeine nope')).toBe('rmmod: ERROR: Module caffeine is not currently loaded\nrmmod: ERROR: Module nope is not currently loaded');
		expect(shell.state.status).toBe(1);
		expect(await run('modprobe')).toBe('modprobe: ERROR: missing parameters. See -h.');
		expect(await run('rmmod')).toBe('rmmod: ERROR: missing module name.');
	});

	it('work outside the desktop too, which keeps track of caffeine itself', async () => {
		const {run} = setup();

		expect(await run('sudo modprobe caffeine; lsmod | grep -c ^caffeine; sudo rmmod caffeine; lsmod | grep -c ^caffeine')).toBe('1\n0');
		expect(await run('sudo rmmod fuse; echo $?')).toBe('0');
	});

	it('take the system down with any module but caffeine', async () => {
		const system = fakeSystem();
		const {shell, run} = setup({system});

		expect(await run('sudo rmmod nvme')).toBe('');
		expect(system.halt).toHaveBeenCalledTimes(1);
		const [{mode, lines, boot}] = system.halt.mock.calls[0];
		expect(mode).toBe('panic');
		expect(lines[0]).toMatch(/^\[ *\d+\.\d{6}\] Kernel panic - not syncing: Fatal exception$/);
		expect(lines[1]).toMatch(/CPU: 3 PID: \d+ Comm: rmmod Tainted/);
		expect(boot.length).toBeGreaterThan(0);

		await run('sudo modprobe -r rubber-duck');
		expect(system.halt).toHaveBeenCalledTimes(2);
		expect(system.halt.mock.calls[1][0].lines[1]).toMatch(/Comm: modprobe /);
		expect(shell.state.status).toBe(0);
	});
});

describe('insmod and modinfo', () => {
	it('insmod wants a module file, and there are none', async () => {
		const {shell, run} = setup();

		expect(await run('insmod caffeine.ko')).toBe('insmod: ERROR: could not load module caffeine.ko: No such file or directory');
		expect(shell.state.status).toBe(1);
		expect(await run('insmod cv.md')).toBe('insmod: ERROR: could not insert module cv.md: Operation not permitted');
		expect(await run('insmod')).toBe('insmod: ERROR: missing filename.');
	});

	it('modinfo describes modules', async () => {
		const {shell, run} = setup();

		expect(await run('modinfo caffeine')).toBe([
			`filename:       ${DIRECTORY}/kernel/drivers/misc/caffeine.ko.xz`,
			'description:    Keeps the desktop awake, one cup at a time',
			'author:         Robin Jacobs <robin@robinj.be>',
			'license:        GPL',
			'depends:        oxidize',
			'name:           caffeine',
			'vermagic:       1.0.0-rj1.riscv64 SMP preempt mod_unload modversions riscv',
		].join('\n'));
		expect(await run('modinfo nvme-core | grep -E "^(filename|depends|intree)"')).toBe(`filename:       ${DIRECTORY}/kernel/drivers/nvme/host/nvme_core.ko.xz\ndepends:        nvme-auth\nintree:         Y`);
		expect(await run('modinfo drm | grep depends')).toBe('depends:        ');
		expect(await run('modinfo nope fuse | head -1')).toBe('modinfo: ERROR: Module nope not found.\nfilename:       /lib/modules/1.0.0-rj1.riscv64/kernel/fs/fuse/fuse.ko.xz');
		expect(shell.state.status).toBe(0);
		expect(await run('modinfo nope')).toBe('modinfo: ERROR: Module nope not found.');
		expect(shell.state.status).toBe(1);
		expect(await run('modinfo')).toBe('modinfo: ERROR: missing module or filename.');
	});
});
