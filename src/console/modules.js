import {OS_RELEASE} from './fs';

// Kernel modules. caffeine and adhd come and go, each doing something to the
// desktop; the rest hold the system up, and taking one out brings it down.

const DIRECTORY = `/lib/modules/${OS_RELEASE.kernel}`;
const PERMISSION = 'Operation not permitted';

const ko = (name, size, used, path, description, extra = {}) => ({name, size, used, path, description, ...extra});
const ROBINS = {author: 'Robin Jacobs <robin@robinj.be>', outOfTree: true};

const CAFFEINE = ko('caffeine', 16384, [0], 'drivers/misc', 'Keeps the desktop awake, one cup at a time', {...ROBINS, depends: 'oxidize'});
const ADHD = ko('adhd', 20480, [0], 'drivers/misc', 'Attention-deficit hyperactivity driver', ROBINS);

// The modules that come and go, and how the desktop takes them.
const TOGGLED = [
	{mod: ADHD, loaded: system => system.distracted, load: (system, on) => system.distract(on)},
	{mod: CAFFEINE, loaded: system => system.caffeinated, load: (system, on) => system.caffeinate(on)},
];
const toggled = mod => TOGGLED.find(toggle => toggle.mod === mod);

// As /proc/modules has them: the most recently loaded first.
const MODULES = [
	ko('rubber_duck', 12288, [0], 'drivers/usb/misc', 'Rubber Duck (Debugging Edition) USB driver', ROBINS),
	ko('oxidize', 45056, [0], 'lib', 'Rewrites it in Rust', ROBINS),
	ko('nf_tables', 393216, [0], 'net/netfilter', 'Framework for packet filtering and classification', {depends: 'nfnetlink'}),
	ko('nfnetlink', 20480, [1, 'nf_tables'], 'net/netfilter', 'Netfilter messages via netlink socket'),
	ko('rfkill', 40960, [2], 'net/rfkill', 'RF switch support'),
	ko('sunrpc', 761856, [1], 'net/sunrpc', 'Sun RPC'),
	ko('vfat', 24576, [1], 'fs/fat', 'VFAT filesystem support', {depends: 'fat'}),
	ko('fat', 102400, [1, 'vfat'], 'fs/fat', 'FAT filesystem support'),
	ko('btrfs', 2072576, [1], 'fs/btrfs', 'B-Tree File System', {depends: 'xor,raid6_pq,zstd_compress'}),
	ko('xor', 20480, [1, 'btrfs'], 'crypto', 'RAID-5 checksumming functions'),
	ko('raid6_pq', 122880, [1, 'btrfs'], 'lib/raid6', 'RAID6 Q-syndrome calculations'),
	ko('zstd_compress', 307200, [1, 'btrfs'], 'lib/zstd', 'Zstd Compressor'),
	ko('nvme', 57344, [2], 'drivers/nvme/host', 'NVMe host PCIe transport driver', {depends: 'nvme-core'}),
	ko('nvme_core', 204800, [3, 'nvme'], 'drivers/nvme/host', 'NVMe host core framework', {depends: 'nvme-auth'}),
	ko('nvme_auth', 24576, [1, 'nvme_core'], 'drivers/nvme/common', 'NVMe authentication'),
	ko('virtio_net', 73728, [0], 'drivers/net', 'Virtio network driver', {depends: 'net_failover'}),
	ko('net_failover', 24576, [1, 'virtio_net'], 'drivers/net', 'Failover driver for Paravirtual drivers', {depends: 'failover'}),
	ko('failover', 16384, [1, 'net_failover'], 'net/core', 'Generic failover infrastructure/interface'),
	ko('drm', 675840, [0], 'drivers/gpu/drm', 'DRM shared core routines'),
	ko('fuse', 184320, [1], 'fs/fuse', 'Filesystem in Userspace'),
];

// caffeine needs oxidize, which then counts it as a user.
const loaded = api => [
	...TOGGLED.filter(toggle => toggle.loaded(api.system)).map(toggle => toggle.mod),
	...MODULES.map(mod => (mod.name === 'oxidize' && api.system.caffeinated ? {...mod, used: [1, 'caffeine']} : mod)),
];
const find = (api, name) => loaded(api).find(other => other.name === name.replace(/-/g, '_'));
const known = name => [...TOGGLED.map(toggle => toggle.mod), ...MODULES].find(other => other.name === name.replace(/-/g, '_'));
const fileOf = mod => `${DIRECTORY}/kernel/${mod.path}/${mod.name}.ko.xz`;
// -x, a bundle with x in it, or --long.
const flag = (api, letter, long) => api.args.some(arg => arg === `--${long}` || (/^-[^-]/.test(arg) && arg.includes(letter)));

const lsmod = api => {
	api.out(`Module                  Size  Used by\n${loaded(api).map(mod => {
		const [count, ...holders] = mod.used;
		return `${mod.name.padEnd(19)} ${String(mod.size).padStart(8)}  ${count}${holders.length ? ` ${holders.join(',')}` : ''}\n`;
	}).join('')}`);
	return 0;
};

// Takes a module out: caffeine or adhd quietly, anything else with the kernel.
const unload = (api, mod) => {
	if (toggled(mod)) {
		toggled(mod).load(api.system, false);
	} else {
		api.shell.panic({pid: api.pid, comm: api.name, cause: 'Fatal exception'});
	}
};

const rmmod = api => {
	const names = api.args.filter(arg => !arg.startsWith('-'));
	if (names.length === 0) {
		api.err('rmmod: ERROR: missing module name.\n');
		return 1;
	}

	let status = 0;
	for (const name of names) {
		const mod = find(api, name.replace(/\.ko(\.xz)?$/, '').split('/').pop());
		if (!mod) {
			api.err(`rmmod: ERROR: Module ${name} is not currently loaded\n`);
			status = 1;
		} else if (api.user !== 'root') {
			api.err(`rmmod: ERROR: could not remove '${mod.name}': ${PERMISSION}\nrmmod: ERROR: could not remove module ${name}: ${PERMISSION}\n`);
			status = 1;
		} else {
			unload(api, mod);
		}
	}

	return status;
};

const modprobe = api => {
	const remove = flag(api, 'r', 'remove');
	const verbose = flag(api, 'v', 'verbose');
	const operands = api.args.filter(arg => !arg.startsWith('-'));
	// Without -a (or -r), what follows the module are its parameters.
	const names = remove || flag(api, 'a', 'all') ? operands : operands.slice(0, 1);
	if (names.length === 0) {
		api.err('modprobe: ERROR: missing parameters. See -h.\n');
		return 1;
	}

	for (const name of names) {
		const mod = known(name);
		if (!mod) {
			api.err(remove ? `modprobe: FATAL: Module ${name} not found.\n` : `modprobe: FATAL: Module ${name} not found in directory ${DIRECTORY}\n`);
			return 1;
		}

		const present = find(api, name);
		if (remove && !present) {
			api.err(`modprobe: FATAL: Module ${mod.name} is not in kernel.\n`);
			return 1;
		} else if (!remove && present) {
			continue;
		} else if (api.user !== 'root') {
			api.err(`modprobe: ERROR: could not ${remove ? 'remove' : 'insert'} '${mod.name}': ${PERMISSION}\n`);
			return 1;
		} else if (verbose) {
			api.out(`${remove ? 'rmmod' : 'insmod'} ${fileOf(mod)}\n`);
		}

		if (remove) {
			unload(api, mod);
		} else {
			toggled(mod).load(api.system, true);
		}
	}

	return 0;
};

// Takes module files, of which there are none; and sudo won't run it without a password.
const insmod = api => {
	const [file] = api.args.filter(arg => !arg.startsWith('-'));
	if (file === undefined) {
		api.err('insmod: ERROR: missing filename.\n');
		return 1;
	}

	const found = api.fs.lookup(api.resolve(file));
	api.err(found.error
		? `insmod: ERROR: could not load module ${file}: ${found.error}\n`
		: `insmod: ERROR: could not insert module ${file}: ${PERMISSION}\n`);
	return 1;
};

const modinfo = api => {
	const names = api.args.filter(arg => !arg.startsWith('-'));
	if (names.length === 0) {
		api.err('modinfo: ERROR: missing module or filename.\n');
		return 1;
	}

	let status = 0;
	for (const name of names) {
		const mod = known(name);
		if (!mod) {
			api.err(`modinfo: ERROR: Module ${name} not found.\n`);
			status = 1;
			continue;
		}
		const fields = [
			['filename', fileOf(mod)], ['description', mod.description], ...(mod.author ? [['author', mod.author]] : []),
			['license', 'GPL'], ['depends', mod.depends ?? ''], ['intree', mod.outOfTree ? null : 'Y'],
			['name', mod.name], ['vermagic', `${OS_RELEASE.kernel} SMP preempt mod_unload modversions riscv`],
		];
		api.out(fields.filter(([, value]) => value !== null).map(([label, value]) => `${`${label}:`.padEnd(16)}${value}\n`).join(''));
	}

	return status;
};

export const MODULE_COMMANDS = {lsmod, modprobe, rmmod, insmod, modinfo};
