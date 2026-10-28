import {noise} from './util';

export const MEMORY_KIB = 16_109_056;
export const SWAP_KIB = 8_388_608;
export const USER_MANAGER = 1290;

// The rest of the system, for ps and top to show.
export const DAEMONS = [
	{pid: 1, ppid: 0, user: 'root', name: 'systemd', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=42 rhgb', stat: 'Ss', rss: 17744, vsz: 172480, cpu: 0.1},
	{pid: 2, ppid: 0, user: 'root', name: 'kthreadd', command: '[kthreadd]', stat: 'S'},
	{pid: 3, ppid: 2, user: 'root', name: 'pool_workqueue_release', command: '[pool_workqueue_release]', stat: 'S'},
	{pid: 15, ppid: 2, user: 'root', name: 'rcu_preempt', command: '[rcu_preempt]', stat: 'I', cpu: 0.1},
	{pid: 16, ppid: 2, user: 'root', name: 'migration/0', command: '[migration/0]', stat: 'S'},
	{pid: 18, ppid: 2, user: 'root', name: 'ksoftirqd/0', command: '[ksoftirqd/0]', stat: 'S'},
	{pid: 91, ppid: 2, user: 'root', name: 'kworker/u16:4-events_unbound', command: '[kworker/u16:4-events_unbound]', stat: 'I'},
	{pid: 612, ppid: 1, user: 'root', name: 'systemd-journal', command: '/usr/lib/systemd/systemd-journald', stat: 'Ss', rss: 28160, vsz: 51788},
	{pid: 640, ppid: 1, user: 'root', name: 'systemd-udevd', command: '/usr/lib/systemd/systemd-udevd', stat: 'Ss', rss: 13312, vsz: 36512},
	{pid: 774, ppid: 1, user: 'systemd-oom', name: 'systemd-oomd', command: '/usr/lib/systemd/systemd-oomd', stat: 'Ss', rss: 7040, vsz: 18160},
	{pid: 775, ppid: 1, user: 'systemd-resolve', name: 'systemd-resolve', command: '/usr/lib/systemd/systemd-resolved', stat: 'Ss', rss: 14848, vsz: 23744},
	{pid: 790, ppid: 1, user: 'root', name: 'auditd', command: '/usr/sbin/auditd', stat: 'S<sl', rss: 4352, vsz: 92180},
	{pid: 812, ppid: 1, user: 'dbus', name: 'dbus-broker-lau', command: '/usr/bin/dbus-broker-launch --scope system --audit', stat: 'Ss', rss: 3840, vsz: 10012},
	{pid: 820, ppid: 1, user: 'polkitd', name: 'polkitd', command: '/usr/lib/polkit-1/polkitd --no-debug', stat: 'Ssl', rss: 11520, vsz: 389724},
	{pid: 833, ppid: 1, user: 'chrony', name: 'chronyd', command: '/usr/sbin/chronyd -F 2', stat: 'S', rss: 3328, vsz: 84756},
	{pid: 851, ppid: 1, user: 'root', name: 'systemd-logind', command: '/usr/lib/systemd/systemd-logind', stat: 'Ss', rss: 9984, vsz: 26232},
	{pid: 869, ppid: 1, user: 'root', name: 'NetworkManager', command: '/usr/sbin/NetworkManager --no-daemon', stat: 'Ssl', rss: 21248, vsz: 344536, cpu: 0.1},
	{pid: 912, ppid: 1, user: 'root', name: 'gdm', command: '/usr/sbin/gdm', stat: 'Ssl', rss: 9472, vsz: 388040},
	{pid: USER_MANAGER, ppid: 1, user: 'robin', name: 'systemd', command: '/usr/lib/systemd/systemd --user', stat: 'Ss', rss: 15872, vsz: 37460},
];

// The desktop's own processes; the website has a browser's appetite for memory.
export const APPS = {
	desktop: {command: '/usr/bin/desktop', stat: 'Ssl', rss: 421_888, vsz: 5_368_712, cpu: 3.2},
	web: {command: '/usr/bin/web https://robinj.be/', stat: 'Sl', rss: 1_572_864, vsz: 12_582_916, cpu: 2.7},
	editor: {command: '/usr/bin/editor', stat: 'Sl', rss: 293_888, vsz: 3_145_732, cpu: 0.8},
	terminal: {command: '/usr/bin/terminal', stat: 'Sl', rss: 75_776, vsz: 1_048_580, cpu: 0.5},
	bash: {stat: 'Ss', rss: 7_168, vsz: 9_216, cpu: 0},
	top: {stat: 'R+', rss: 5_632, vsz: 15_104, cpu: 0.7},
	htop: {stat: 'S+', rss: 6_144, vsz: 16_896, cpu: 0.7},
	ps: {stat: 'R+', rss: 4_096, vsz: 13_312, cpu: 0},
};

// Usage figures for a process: stable for ps, wobbling a little per `tick` for top.
export const usage = (proc, now, tick = 0) => {
	const profile = APPS[proc.name] ?? {};
	const base = proc.cpu ?? profile.cpu ?? 0;
	const kernel = proc.command?.startsWith('[');
	const rss = proc.rss ?? profile.rss ?? (kernel ? 0 : 2_048);
	const elapsed = Math.max((now - proc.started) / 1000, 0);
	const cpu = tick ? base * (0.9 + 0.2 * noise(proc.pid * 31 + tick)) : base;

	return {
		cpu,
		rss,
		vsz: proc.vsz ?? profile.vsz ?? (kernel ? 0 : 8_192),
		shr: Math.round(rss * 0.3),
		mem: (rss / MEMORY_KIB) * 100,
		time: (elapsed * base) / 100,
		stat: proc.stat ?? profile.stat ?? (proc.tty === '?' ? 'S' : 'S+'),
	};
};

export const cpuTime = seconds => {
	const whole = Math.floor(seconds);
	return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

export const uptime = seconds => {
	const minutes = Math.floor(seconds / 60);
	const days = Math.floor(minutes / 1440);
	const clock = minutes % 1440 < 60 ? `${minutes % 1440} min` : `${Math.floor((minutes % 1440) / 60)}:${String(minutes % 60).padStart(2, '0')}`;

	return days ? `${days} day${days === 1 ? '' : 's'}, ${clock.padStart(5)}` : clock;
};
