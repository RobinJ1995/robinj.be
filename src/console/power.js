import {OS_RELEASE} from './fs';
import {strftime} from './util';

// What the console shows while powering off, booting, or panicking. Plausible,
// mostly; the rest is for those who know what they're looking at.

const OK = '[  OK  ]';
const HARDWARE = 'Robin Jacobs robinj.be Portfolio Board v1.3.37 (DT)';

// `[  123.456789] ` from seconds of uptime.
const stamp = seconds => `[${seconds.toFixed(6).padStart(12)}] `;

const units = {
	session: 'session-2.scope - Session 2 of User robin',
	desktop: 'desktop.service - The Desktop',
	web: 'web.service - Website, Probably Fine',
	coffee: 'coffee-maker.service - Office Coffee Machine',
	duck: 'rubber-duck.service - Rubber Duck Debugging Daemon',
	procrastination: 'procrastination.service - Procrastination Daemon',
	impostor: 'impostor-syndrome.service - Impostor Syndrome Monitor',
	network: 'NetworkManager.service - Network Manager',
	chrony: 'chronyd.service - NTP client/server',
	logind: 'systemd-logind.service - User Login Management',
	journal: 'systemd-journald.service - Journal Service',
};

// Lines appear `delay` ms after the previous one; `replace` rewrites the last line.
const line = (text, delay = 40) => ({text, delay});

export const shutdownSequence = ({uptime, reboot}) => {
	const kernel = (offset, text) => line(`${stamp(uptime + offset)}${text}`, 60);
	// The stop job everyone has waited on, its asterisks bouncing.
	const stopJob = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2].map((at, i) => ({
		text: `[${'   ***  '.slice(5 - at, 11 - at).padEnd(6)}] A stop job is running for Procrastination Daemon (${i + 3}s / 1min 30s)`,
		delay: i ? 220 : 150,
		replace: i > 0,
	}));

	return [
		line(`         Stopping ${units.session}...`, 0),
		line(`${OK} Stopped target graphical.target - Graphical Interface.`),
		line(`${OK} Stopped target multi-user.target - Multi-User System.`),
		line(`${OK} Stopped target timers.target - Timer Units.`),
		line(`${OK} Stopped dnf-makecache.timer - dnf makecache --timer.`),
		line(`${OK} Stopped coffee-refill.timer - Hourly Coffee Refill.`),
		line(`         Stopping ${units.desktop}...`),
		line(`         Stopping ${units.web}...`),
		line(`         Stopping ${units.coffee}...`),
		line(`         Stopping ${units.duck}...`),
		line(`         Stopping ${units.procrastination}...`),
		line(`         Stopping ${units.chrony}...`),
		line(`${OK} Stopped ${units.chrony}.`, 120),
		line(`${OK} Stopped ${units.web}.`),
		line(`${OK} Stopped ${units.desktop}.`),
		line(`${OK} Stopped ${units.duck}.`),
		line(`${OK} Stopped ${units.coffee}.`, 90),
		...stopJob,
		line(`[FAILED] Failed to stop ${units.procrastination}.`, 200),
		line(`${OK} Stopped ${units.impostor}.`),
		line(`${OK} Stopped ${units.session}.`),
		line(`${OK} Removed slice user-1000.slice - User Slice of UID 1000.`),
		line(`${OK} Stopped ${units.network}.`),
		line(`${OK} Stopped target network.target - Network.`),
		line(`${OK} Stopped ${units.logind}.`),
		line(`${OK} Stopped target local-fs.target - Local File Systems.`),
		line('         Unmounting home.mount - /home...'),
		line('         Unmounting tmp.mount - Temporary Directory /tmp...'),
		line(`${OK} Unmounted home.mount - /home.`),
		line(`${OK} Unmounted tmp.mount - Temporary Directory /tmp.`),
		line(`${OK} Reached target umount.target - Unmount All Filesystems.`),
		line(`${OK} Stopped ${units.journal}.`),
		line(`${OK} Reached target shutdown.target - System Shutdown.`),
		line(`${OK} Reached target final.target - Late Shutdown Services.`),
		line(reboot ? `${OK} Finished systemd-reboot.service - System Reboot.` : `${OK} Finished systemd-poweroff.service - System Power Off.`),
		line(reboot ? `${OK} Reached target reboot.target - System Reboot.` : `${OK} Reached target poweroff.target - System Power Off.`),
		kernel(0.31, 'watchdog: watchdog0: watchdog did not stop!'),
		kernel(0.42, 'systemd-shutdown[1]: Syncing filesystems and block devices.'),
		kernel(0.43, 'systemd-shutdown[1]: Sending SIGTERM to remaining processes...'),
		kernel(0.61, 'systemd-shutdown[1]: Sending SIGKILL to remaining processes...'),
		kernel(0.62, 'systemd-shutdown[1]: Unmounting file systems.'),
		kernel(0.66, 'systemd-shutdown[1]: All filesystems unmounted.'),
		kernel(0.66, 'systemd-shutdown[1]: Deactivating swaps.'),
		kernel(0.67, 'systemd-shutdown[1]: All swaps deactivated.'),
		kernel(0.67, 'systemd-shutdown[1]: Detaching loop devices.'),
		kernel(0.68, 'systemd-shutdown[1]: All loop devices detached.'),
		kernel(0.69, `systemd-shutdown[1]: ${reboot ? 'Rebooting.' : 'Powering off.'}`),
		kernel(0.7, reboot ? 'reboot: Restarting system' : 'reboot: Power down'),
	];
};

export const bootSequence = () => {
	const kernel = (seconds, text, delay = 25) => line(`${stamp(seconds)}${text}`, delay);
	const started = (unit, delay) => line(`${OK} Started ${unit}.`, delay);

	return [
		kernel(0, 'Booting Linux on hartid 0', 400),
		kernel(0, `Linux version ${OS_RELEASE.kernel} (mockbuild@robinj.be) (gcc (GCC) 14.2.1 20250110, GNU ld version 2.43.1) #1 SMP PREEMPT_DYNAMIC Fri Mar 13 13:37:00 UTC 2026`),
		kernel(0, `Machine model: ${HARDWARE.replace(' (DT)', '')}`),
		kernel(0, 'SBI specification v2.0 detected'),
		kernel(0, 'SBI implementation ID=0x1 Version=0x10004'),
		kernel(0, `Kernel command line: BOOT_IMAGE=/vmlinuz-${OS_RELEASE.kernel} root=UUID=c0ffee00-dead-beef-cafe-badc0de13370 ro rhgb quiet coffee=strong`),
		kernel(0, 'riscv: base ISA extensions acdfhimv'),
		kernel(0, 'riscv: ELF capabilities acdfimv'),
		kernel(0, 'Memory: 16106288K/16777216K available (20480K kernel code, 4242K rwdata, 13370K rodata)'),
		kernel(0, 'Unknown kernel command line parameters "coffee=strong", will be passed to user space.'),
		kernel(0, 'riscv-timer: riscv_timer_init_dt: Registering clocksource cpuid [0] hartid [0]'),
		kernel(0.000001, 'sched_clock: 64 bits at 3.14MHz, resolution 318ns, wraps every 2199023255552ns'),
		kernel(0.1337, 'smp: Bringing up secondary CPUs ...'),
		kernel(0.141421, 'smp: Brought up 1 node, 4 CPUs'),
		kernel(0.271828, 'ACPI: Interpreter enabled'),
		kernel(0.42, 'usb 1-1: new high-speed USB device number 2 using xhci_hcd'),
		kernel(0.42, 'usb 1-1: Product: Rubber Duck (Debugging Edition)'),
		kernel(0.666, 'random: crng init done'),
		kernel(1.0, 'EXT4-fs (nvme0n1p3): mounted filesystem c0ffee00-dead-beef-cafe-badc0de13370 ro with ordered data mode. Quota mode: none.', 150),
		kernel(1.21, 'systemd[1]: systemd 256.7-1.rj1 running in system mode (+PAM +AUDIT +SELINUX +COFFEE -TEA)'),
		kernel(1.21, 'systemd[1]: Detected architecture riscv64.'),
		line('', 200),
		line(`Welcome to ${OS_RELEASE.name} ${OS_RELEASE.version} (${OS_RELEASE.edition})!`, 0),
		line('', 300),
		line(`${OK} Created slice system-getty.slice - Slice /system/getty.`),
		started(units.journal),
		line(`${OK} Reached target local-fs.target - Local File Systems.`),
		started('systemd-udevd.service - Rule-based Manager for Device Events and Files'),
		started(units.coffee, 120),
		started(units.duck),
		started(units.impostor),
		line(`${OK} Listening on procrastination.socket - Procrastination Daemon (activates tomorrow).`),
		started(units.network, 150),
		line(`${OK} Reached target network-online.target - Network is Online.`, 200),
		started(units.chrony),
		started(units.logind),
		line(`${OK} Reached target multi-user.target - Multi-User System.`),
		started('gdm.service - GNOME Display Manager', 120),
		started(units.desktop, 200),
		line(`${OK} Reached target graphical.target - Graphical Interface.`, 300),
	];
};

const EXIT_CODES = {KILL: 0x9, TERM: 0xf, INT: 0x2, HUP: 0x1, QUIT: 0x3, ABRT: 0x6, SEGV: 0xb};

export const panicText = ({uptime, pid, signal, comm = 'desktop', cause}) => {
	const reason = cause ?? `Critical system component died! exitcode=0x${(EXIT_CODES[signal] ?? 0xf).toString(16).padStart(8, '0')}`;
	let at = uptime;
	const next = text => {
		at += 0.000001 + Math.random() * 0.000002;
		return `${stamp(at)}${text}`;
	};

	return [
		next(`Kernel panic - not syncing: ${reason}`),
		next(`CPU: 3 PID: ${pid} Comm: ${comm} Tainted: G           OE      ${OS_RELEASE.kernel} #1`),
		next(`Hardware name: ${HARDWARE}`),
		next('Modules linked in: caffeine(OE) oxidize(OE) rubber_duck nf_tables nvme btrfs'),
		next('Call Trace:'),
		next('[<ffffffff80006a4c>] dump_backtrace+0x1c/0x24'),
		next('[<ffffffff80b2d2f2>] show_stack+0x2c/0x38'),
		next('[<ffffffff80b3a12c>] dump_stack_lvl+0x3c/0x54'),
		next('[<ffffffff80b2d5d6>] panic+0x10e/0x30e'),
		next('[<ffffffff80014b46>] do_exit+0x7c2/0x7c6'),
		next('[<ffffffff80014d2e>] do_group_exit+0x2c/0x7c'),
		next('[<ffffffff8002203a>] get_signal+0x7a6/0x7aa'),
		next('[<ffffffc0013371f2>] blame_it_on_dns+0x1f/0x40 [caffeine]'),
		next('[<ffffffc001337a3e>] it_works_on_my_machine+0x13/0x37 [caffeine]'),
		next('[<ffffffff800054d6>] arch_do_signal_or_restart+0x26/0x1f8'),
		next('[<ffffffc0042a0b72>] rewrite_it_in_rust+0x42/0x2a0 [oxidize]'),
		next('[<ffffffc001338374>] stackoverflow_copy_paste+0x1337/0x2000 [caffeine]'),
		next('[<ffffffff80b0f00d>] quick_fix_before_friday_deploy+0xf00/0xfff'),
		next('[<ffffffff800a3d86>] do_notify_resume+0x5a/0x1a8'),
		next('[<ffffffff80b3b8b4>] do_trap_ecall_u+0x8a/0x1d2'),
		next('[<ffffffff80b45c62>] handle_exception+0x16a/0x176'),
		next('epc : 0000003ff1ce0b0e ra : 0000002aaab0c3d4 sp : 0000003fffc4e5a0'),
		next(' gp : 0000002aaab2c800 tp : 0000003fb3b7d780 t0 : 00000000c0ffee00'),
		next(' t1 : 00000000deadbeef t2 : 00000000cafebabe s0 : 0000003fffc4e5d0'),
		next(` s1 : 000000008badf00d a0 : ${(EXIT_CODES[signal] ?? 0xf).toString(16).padStart(16, '0')} a1 : ${pid.toString(16).padStart(16, '0')}`),
		next(' a2 : 00000000feedface a3 : 000000000badc0de a4 : 00000000d15ea5e0'),
		next(' a5 : 0000000000000001 a6 : 000000000000002a a7 : 000000000000005e'),
		next('status: 0000000200004020 badaddr: 0000000000000000 cause: 0000000000000008'),
		next('Kernel Offset: 0x13370000 from 0xffffffff80000000'),
		next(`---[ end Kernel panic - not syncing: ${reason} ]---`),
	];
};

// shutdown [-h|-P|-r|-c] [TIME] [WALL...]; poweroff and reboot are now. A
// scheduled shutdown outlives the terminal, but not the machine going down.
let scheduled = null;

export const cancelShutdown = () => {
	const wasScheduled = scheduled !== null;
	clearTimeout(scheduled?.timer);
	scheduled = null;
	return wasScheduled;
};

const halt = (api, reboot) => {
	cancelShutdown();
	const uptime = (Date.now() - api.system.bootedAt) / 1000;
	api.system.halt({mode: reboot ? 'reboot' : 'poweroff', shutdown: shutdownSequence({uptime, reboot}), boot: bootSequence()});
	return 0;
};

const broadcast = (api, message) => {
	const now = strftime('%a %Y-%m-%d %H:%M:%S %Z', new Date());
	api.tty.write(`\nBroadcast message from robin@robinj.be on pts/0 (${now}):\n\n${message}\n\n`);
};

const shutdown = api => {
	const args = api.args.filter(arg => !arg.startsWith('-'));
	const flags = api.args.filter(arg => arg.startsWith('-')).join('');
	const reboot = /r/.test(flags);
	if (/c/.test(flags)) {
		if (cancelShutdown()) {
			broadcast(api, 'System shutdown has been cancelled');
		}
		return 0;
	}

	const time = args[0] ?? '+1';
	const minutes = time === 'now' ? 0 : time.match(/^\+(\d+)$/)?.[1];
	const at = time.match(/^(\d{1,2}):(\d{2})$/);
	let delay;
	if (minutes !== undefined && minutes !== null) {
		delay = Number(minutes) * 60_000;
	} else if (at) {
		const target = new Date();
		target.setHours(Number(at[1]), Number(at[2]), 0, 0);
		if (target <= new Date()) {
			target.setDate(target.getDate() + 1);
		}
		delay = target - new Date();
	} else {
		api.err(`Failed to parse time specification: ${time}\n`);
		return 1;
	}

	if (delay === 0) {
		return halt(api, reboot);
	}

	const when = new Date(Date.now() + delay);
	cancelShutdown();
	scheduled = {timer: setTimeout(() => halt(api, reboot), delay)};
	api.out(`${reboot ? 'Reboot' : 'Shutdown'} scheduled for ${strftime('%a %Y-%m-%d %H:%M:%S %Z', when)}, use 'shutdown -c' to cancel.\n`);
	broadcast(api, `The system will ${reboot ? 'reboot' : 'power off'} at ${strftime('%a %Y-%m-%d %H:%M:%S %Z', when)}!`);

	return 0;
};

export const POWER = {
	poweroff: api => halt(api, false),
	reboot: api => halt(api, true),
	shutdown,
};
