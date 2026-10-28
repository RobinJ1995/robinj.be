import {FILES, HOME, PORTFOLIO} from './files';

export {HOME, PORTFOLIO};

export const OS_RELEASE = {
	name: 'RobinOS',
	version: '1.0.0',
	edition: 'Web Edition',
	codename: 'Hidden Bits',
	kernel: '1.0.0-rj1.riscv64',
};

const osRelease = `NAME="${OS_RELEASE.name}"
VERSION="${OS_RELEASE.version} (${OS_RELEASE.edition})"
RELEASE_TYPE=stable
ID=robinj
ID_LIKE=fedora
VERSION_ID=${OS_RELEASE.version}
VERSION_CODENAME="${OS_RELEASE.codename}"
PRETTY_NAME="${OS_RELEASE.name} ${OS_RELEASE.version} (${OS_RELEASE.edition})"
HOME_URL="https://robinj.be/"
VARIANT="${OS_RELEASE.edition}"
VARIANT_ID=web
`;

const passwd = `root:x:0:0:Super User:/root:/bin/bash
bin:x:1:1:bin:/bin:/usr/sbin/nologin
robin:x:1000:1000:Robin Jacobs:/home/robin:/bin/bash
`;

// The cluster at home, for kubectl. Its certificates hold nothing worth finding.
export const KUBE = {cluster: 'robins-apartment', server: 'https://192.168.1.42:6443', user: 'robin'};
const pem = (label, text) => btoa(`-----BEGIN ${label}-----\n${text}\n-----END ${label}-----\n`);
const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${pem('CERTIFICATE', 'Nice try :)')}
    server: ${KUBE.server}
  name: ${KUBE.cluster}
contexts:
- context:
    cluster: ${KUBE.cluster}
    user: ${KUBE.user}
  name: ${KUBE.cluster}
current-context: ${KUBE.cluster}
kind: Config
preferences: {}
users:
- name: ${KUBE.user}
  user:
    client-certificate-data: ${pem('CERTIFICATE', 'Still nice try.')}
    client-key-data: ${pem('EC PRIVATE KEY', 'The filesystem is read-only, and so is this account.')}
`;

const shadow = `root:!locked::0:99999:7:::
robin:$y$j9T$nice$try:20388:0:99999:7:::
`;

// What `cat` shows for a binary: a RISC-V ELF header and some noise.
const binary = name => `\x7fELF\x02\x01\x01\0\0\0\0\0\0\0\0\0\x03\0\xf3\0\x01\0\0\0 ${name} @\0\0\0\0\0\0\0\n`;

// Everything was last changed when the system "booted": when the page loaded.
export const MTIME = new Date();

const dir = (owner = 'root', mode = 0o755) => ({type: 'dir', owner, mode});
const file = (text, owner = 'root', mode = 0o644) => ({type: 'file', owner, mode, text: typeof text === 'function' ? text : () => text});

const SYSTEM = {
	'/': dir(),
	'/bin': {type: 'link', owner: 'root', mode: 0o777, target: 'usr/bin'},
	'/boot': dir(),
	'/dev': dir(),
	'/dev/null': {type: 'char', owner: 'root', mode: 0o666},
	'/etc': dir(),
	'/etc/hostname': file('robinj.be\n'),
	'/etc/os-release': file(osRelease),
	'/etc/robinj-release': file(`${OS_RELEASE.name} release ${OS_RELEASE.version} (${OS_RELEASE.codename})\n`),
	'/etc/passwd': file(passwd),
	'/etc/shadow': file(shadow, 'root', 0o000),
	'/home': dir(),
	[HOME]: dir('robin', 0o700),
	[`${HOME}/.kube`]: dir('robin', 0o700),
	[`${HOME}/.kube/config`]: file(kubeconfig, 'robin', 0o600),
	[PORTFOLIO]: dir('robin'),
	'/root': dir('root', 0o550),
	'/tmp': dir('root', 0o1777),
	'/usr': dir(),
	'/usr/bin': dir(),
	'/usr/lib': dir(),
	'/usr/share': dir(),
	'/var': dir(),
	'/var/log': dir(),
};

export const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
export const nameOf = path => path.slice(path.lastIndexOf('/') + 1) || '/';

// A path made absolute and tidy, without looking at the filesystem.
export const normalize = (cwd, path) => {
	const expanded = path === '~' || path.startsWith('~/') ? HOME + path.slice(1) : path;
	const parts = [];
	for (const part of (expanded.startsWith('/') ? expanded : `${cwd}/${expanded}`).split('/')) {
		if (part === '..') {
			parts.pop();
		} else if (part && part !== '.') {
			parts.push(part);
		}
	}

	return `/${parts.join('/')}`;
};

export const displayPath = path => (path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path);

const permitted = (entry, user, bit) => user === 'root' || Boolean(entry.mode & (entry.owner === user ? bit << 6 : bit));

// A read-only filesystem: the editor's files in ~/portfolio, plus enough of a
// Linux system around them to look around in.
export const createFs = ({history, binaries}) => {
	const entries = () => {
		const all = {...SYSTEM};
		for (const [path, {text}] of Object.entries(FILES)) {
			all[path] = file(text, 'robin');
		}
		all[`${HOME}/.bash_history`] = file(() => history().map(line => `${line}\n`).join(''), 'robin', 0o600);
		for (const name of binaries()) {
			all[`/usr/bin/${name}`] = file(binary(name), 'root', 0o755);
		}

		return all;
	};

	// Follows symlinks through the path; checks each directory can be entered.
	const lookup = (path, {user = 'robin', follow = true} = {}) => {
		const all = entries();
		let current = '';
		const parts = path.split('/').filter(Boolean);
		for (const [i, part] of parts.entries()) {
			const parent = all[current || '/'];
			if (parent.type !== 'dir') {
				return {error: 'Not a directory'};
			} else if (!permitted(parent, user, 0o1)) {
				return {error: 'Permission denied'};
			}

			current = `${current}/${part}`;
			const entry = all[current];
			if (!entry) {
				return {error: 'No such file or directory'};
			} else if (entry.type === 'link' && (follow || i < parts.length - 1)) {
				current = normalize(parentOf(current), entry.target);
			}
		}

		const real = current || '/';
		return {path: real, entry: all[real]};
	};

	const list = (path, user = 'robin') => {
		const found = lookup(path, {user});
		if (found.error) {
			return found;
		} else if (found.entry.type !== 'dir') {
			return {error: 'Not a directory'};
		} else if (!permitted(found.entry, user, 0o4)) {
			return {error: 'Permission denied'};
		}

		const names = Object.keys(entries())
			.filter(entry => entry !== '/' && parentOf(entry) === found.path)
			.map(nameOf)
			.sort();
		return {names, path: found.path};
	};

	const read = (path, user = 'robin') => {
		const found = lookup(path, {user});
		if (found.error) {
			return found;
		} else if (found.entry.type === 'dir') {
			return {error: 'Is a directory'};
		} else if (!permitted(found.entry, user, 0o4)) {
			return {error: 'Permission denied'};
		}

		return {text: found.entry.type === 'char' ? '' : found.entry.text()};
	};

	// Writing: only /dev/null takes it; anything else says why not.
	const writeError = (path, user = 'robin') => {
		const found = lookup(path, {user});
		if (found.entry?.type === 'char') {
			return null;
		} else if (found.entry?.type === 'dir') {
			return 'Is a directory';
		} else if (found.error && found.error !== 'No such file or directory') {
			return found.error;
		}

		const parent = lookup(parentOf(path), {user});
		return parent.error ?? 'Read-only file system';
	};

	// null when `user` may read (4), write (2) or enter/execute (1) the path.
	const access = (path, bit, user = 'robin') => {
		const found = lookup(path, {user});
		if (found.error) {
			return found.error;
		} else if (bit === 0o2 && found.entry.type !== 'char') {
			return 'Read-only file system';
		}

		return permitted(found.entry, user, bit) ? null : 'Permission denied';
	};

	return {lookup, list, read, writeError, access, entries};
};

export const modeString = entry => {
	const type = {dir: 'd', link: 'l', char: 'c'}[entry.type] ?? '-';
	const bits = [6, 3, 0].map(shift => {
		const value = (entry.mode >> shift) & 7;
		return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
	}).join('');

	return type + (entry.mode & 0o1000 ? `${bits.slice(0, 8)}t` : bits);
};

export const sizeOf = entry => {
	if (entry.type === 'dir') {
		return 4096;
	} else if (entry.type === 'link') {
		return entry.target.length;
	}

	return entry.type === 'char' ? 0 : new TextEncoder().encode(entry.text()).length;
};
