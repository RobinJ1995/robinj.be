import {OS_RELEASE} from './fs';

// dnf, and the few packages it has to offer.

const REPOSITORY = {id: 'robinj', name: `${OS_RELEASE.name} ${OS_RELEASE.version} - riscv64`};

const PACKAGES = {
	cowsay: {
		version: '3.8.4',
		release: '2.rj1',
		arch: 'noarch',
		download: 42.0,
		installed: 76.0,
		summary: 'Configurable speaking/thinking cow',
		url: 'https://github.com/cowsay-org/cowsay',
		license: 'GPL-3.0-only',
		description: [
			'cowsay is a configurable talking cow, written in Perl. It operates',
			'much as the figlet program does, and it written in the same spirit',
			'of silliness.',
		],
		commands: ['cowsay', 'cowthink'],
	},
	wget: {
		version: '1.25.0',
		release: '1.rj1',
		arch: 'riscv64',
		download: 795.3,
		installed: 3364.0,
		summary: 'A utility for retrieving files using the HTTP or FTP protocols',
		url: 'https://www.gnu.org/software/wget/',
		license: 'GPL-3.0-or-later',
		description: [
			'GNU Wget fetches files from the web without anyone at the keyboard:',
			'it can carry on in the background, retry over flaky connections and',
			'pick up where an interrupted download left off.',
		],
		commands: ['wget'],
	},
};

// Command name -> the package that provides it.
export const PACKAGED = Object.fromEntries(Object.entries(PACKAGES).flatMap(([name, pkg]) => pkg.commands.map(command => [command, name])));

const nevra = (name, pkg) => `${name}-0:${pkg.version}-${pkg.release}.${pkg.arch}`;
const kib = (size, digits = 1) => (size >= 1024 ? `${(size / 1024).toFixed(digits)} MiB` : `${size.toFixed(digits)} KiB`);

const progress = async (api, label, size, steps = 6) => {
	for (let step = 1; step <= steps; step++) {
		const fraction = step / steps;
		const percent = `${Math.round(fraction * 100)}%`.padStart(4);
		api.out(`\r${label.padEnd(40).slice(0, 40)} ${percent} | ${kib(size * 10 * fraction).padStart(10)}/s | ${kib(size * fraction).padStart(10)} |  00m00s`);
		await api.sleep(70);
	}
	api.out('\n');
};

const loadRepositories = async api => {
	api.out('Updating and loading repositories:\n');
	await progress(api, ` ${REPOSITORY.name}`, 12.3, 4);
	api.out('Repositories loaded.\n');
};

const confirm = async (api, assumeYes) => {
	api.out('Is this ok [y/N]: ');
	if (assumeYes) {
		api.out('y\n');
		return true;
	}

	const answer = await api.readLine();
	if (!api.stdin.isTTY) {
		api.out(`${answer?.line ?? ''}\n`);
	}
	if (/^y(es)?$/i.test(answer?.line.trim() ?? '')) {
		return true;
	}

	api.out('Operation aborted by the user.\n');
	return false;
};

const table = (heading, names) => [
	'Package                  Arch    Version                  Repository        Size',
	`${heading}:`,
	...names.map(name => {
		const pkg = PACKAGES[name];
		return ` ${name.padEnd(24)}${pkg.arch.padEnd(8)}${`${pkg.version}-${pkg.release}`.padEnd(25)}${REPOSITORY.id.padEnd(12)}${kib(pkg.installed).padStart(10)}`;
	}),
	'',
	'Transaction Summary:',
	` ${`${heading}:`.padEnd(19)} ${names.length} package${names.length === 1 ? '' : 's'}`,
	'',
].join('\n');

const transaction = async (api, {names, remove, assumeYes}) => {
	const size = names.reduce((sum, name) => sum + PACKAGES[name][remove ? 'installed' : 'download'], 0);
	const installed = names.reduce((sum, name) => sum + PACKAGES[name].installed, 0);
	api.out(`${table(remove ? 'Removing' : 'Installing', names)}\n`);
	api.out(remove
		? `After this operation, ${kib(installed, 0)} will be freed (install 0 B, remove ${kib(installed, 0)}).\n`
		: `Total size of inbound packages is ${kib(size, 0)}. Need to download ${kib(size, 0)}.\nAfter this operation, ${kib(installed, 0)} extra will be used (install ${kib(installed, 0)}, remove 0 B).\n`);
	if (!(await confirm(api, assumeYes))) {
		return 1;
	}

	const total = names.length + 2;
	if (!remove) {
		for (const [i, name] of names.entries()) {
			await progress(api, `[${i + 1}/${names.length}] ${nevra(name, PACKAGES[name])}`, PACKAGES[name].download);
		}
		api.out(`${'-'.repeat(80)}\n`);
		await progress(api, `[${names.length}/${names.length}] Total`, size, 1);
	}
	api.out('Running transaction\n');
	await progress(api, `[1/${total}] Verify package files`, 0.1, 2);
	await progress(api, `[2/${total}] Prepare transaction`, 0.1, 2);
	for (const [i, name] of names.entries()) {
		await progress(api, `[${i + 3}/${total}] ${remove ? 'Removing' : 'Installing'} ${nevra(name, PACKAGES[name])}`, PACKAGES[name].installed, 4);
		if (remove) {
			api.shell.packages.delete(name);
		} else {
			api.shell.packages.add(name);
		}
	}
	api.shell.savePackages();
	api.out('Complete!\n');

	return 0;
};

const NEEDS_ROOT = 'This command has to be run with superuser privileges (under the root user on most systems).\n';

const dnf = async api => {
	const assumeYes = api.args.some(arg => arg === '-y' || arg === '--assumeyes');
	const [command, ...names] = api.args.filter(arg => !arg.startsWith('-'));
	const installed = name => api.shell.packages.has(name);

	switch (command) {
		case undefined:
			api.err('Missing command. Add "--help" for more information about the arguments.\n');
			return 2;
		case 'install':
		case 'remove':
		case 'erase': {
			const remove = command !== 'install';
			if (api.user !== 'root') {
				api.err(NEEDS_ROOT);
				return 1;
			} else if (names.length === 0) {
				api.err(`Missing positional argument "package-spec-binary" for command "${command}". Add "--help" for more information about the arguments.\n`);
				return 2;
			} else if (!remove) {
				await loadRepositories(api);
			}
			const unknown = names.filter(name => !PACKAGES[name] || (remove && !installed(name)));
			if (unknown.length) {
				api.err(remove
					? `${unknown.map(name => `No packages to remove for argument: ${name}`).join('\n')}\n\nNothing to do.\n`
					: `Failed to resolve the transaction:\n${unknown.map(name => `No match for argument: ${name}`).join('\n')}\nYou can try to add to command line:\n  --skip-unavailable to skip unavailable packages\n`);
				return remove ? 0 : 1;
			}

			const pending = names.filter(name => remove || !installed(name));
			if (pending.length === 0) {
				api.out(`${names.map(name => `Package "${nevra(name, PACKAGES[name]).replace('-0:', '-')}" is already installed.`).join('\n')}\n\nNothing to do.\n`);
				return 0;
			}

			return transaction(api, {names: pending, remove, assumeYes});
		}
		case 'upgrade':
		case 'update':
			if (api.user !== 'root') {
				api.err(NEEDS_ROOT);
				return 1;
			}
			await loadRepositories(api);
			api.out('Nothing to do.\n');
			return 0;
		case 'search': {
			await loadRepositories(api);
			const terms = names.map(name => name.toLowerCase());
			const found = Object.entries(PACKAGES).filter(([name, pkg]) => terms.some(term => name.includes(term) || pkg.summary.toLowerCase().includes(term)));
			if (found.length === 0) {
				api.err('No matches found.\n');
				return 1;
			}
			api.out(`Matched fields: name, summary\n${found.map(([name, pkg]) => ` ${name}.${pkg.arch}: ${pkg.summary}`).join('\n')}\n`);
			return 0;
		}
		case 'list': {
			const onlyInstalled = api.args.includes('--installed') || names[0] === 'installed';
			const wanted = Object.keys(PACKAGES).filter(name => names.filter(n => n !== 'installed' && n !== 'available').every(n => name === n));
			const row = name => `${`${name}.${PACKAGES[name].arch}`.padEnd(24)}${`${PACKAGES[name].version}-${PACKAGES[name].release}`.padEnd(20)}${REPOSITORY.id}`;
			const have = wanted.filter(installed);
			const available = onlyInstalled ? [] : wanted.filter(name => !installed(name));
			if (!have.length && !available.length) {
				api.err('No matching packages to list\n');
				return 1;
			}
			api.out([
				...(have.length ? ['Installed packages', ...have.map(row)] : []),
				...(available.length ? [...(have.length ? [''] : []), 'Available packages', ...available.map(row)] : []),
			].join('\n') + '\n');
			return 0;
		}
		case 'info': {
			const known = names.filter(name => PACKAGES[name]);
			if (known.length === 0) {
				api.err('No matching packages to list\n');
				return 1;
			}
			for (const name of known) {
				const pkg = PACKAGES[name];
				const field = (label, value) => `${label.padEnd(16)}: ${value}`;
				api.out([
					installed(name) ? 'Installed packages' : 'Available packages',
					field('Name', name), field('Epoch', '0'), field('Version', pkg.version), field('Release', pkg.release),
					field('Architecture', pkg.arch), field('Download size', kib(pkg.download)), field('Installed size', kib(pkg.installed)),
					field('Source', `${name}-${pkg.version}-${pkg.release}.src.rpm`), field('Repository', REPOSITORY.id),
					field('Summary', pkg.summary), field('URL', pkg.url), field('License', pkg.license),
					field('Description', pkg.description[0]), ...pkg.description.slice(1).map(text => `${''.padEnd(16)}: ${text}`),
					field('Vendor', 'RobinOS Project'),
				].join('\n') + '\n');
			}
			return 0;
		}
		default:
			api.err(`Unknown argument "${command}" for command "dnf5". Add "--help" for more information about the arguments.\n`);
			return 2;
	}
};

// --- cowsay ---

const COWS = {
	default: (eyes, tongue, thoughts) => [
		`        ${thoughts}   ^__^`,
		`         ${thoughts}  (${eyes})\\_______`,
		'            (__)\\       )\\/\\',
		`             ${tongue} ||----w |`,
		'                ||     ||',
	],
	tux: (eyes, tongue, thoughts) => [
		`   ${thoughts}`,
		`    ${thoughts}`,
		'        .--.',
		'       |o_o |',
		'       |:_/ |',
		'      //   \\ \\',
		'     (|     | )',
		"    /'\\_   _/`\\",
		'    \\___)=(___/',
	],
};

const MODES = {b: ['==', '  '], d: ['XX', 'U '], g: ['$$', '  '], p: ['@@', '  '], s: ['**', 'U '], t: ['--', '  '], w: ['OO', '  '], y: ['..', '  ']};

const wrap = (text, width) => text.split('\n').flatMap(paragraph => {
	const lines = [];
	let line = '';
	for (const word of paragraph.replace(/\t/g, '        ').split(/\s+/).filter(Boolean)) {
		if (line && line.length + 1 + word.length > width) {
			lines.push(line);
			line = '';
		}
		line = line ? `${line} ${word}` : word;
	}
	lines.push(line);
	return lines;
});

const balloon = (lines, think) => {
	const width = Math.max(...lines.map(line => line.length));
	const edges = (i, count) => {
		if (think) {
			return ['(', ')'];
		} else if (count === 1) {
			return ['<', '>'];
		}
		return i === 0 ? ['/', '\\'] : i === count - 1 ? ['\\', '/'] : ['|', '|'];
	};

	return [
		` ${'_'.repeat(width + 2)}`,
		...lines.map((line, i) => {
			const [left, right] = edges(i, lines.length);
			return `${left} ${line.padEnd(width)} ${right}`;
		}),
		` ${'-'.repeat(width + 2)}`,
	];
};

const cowsay = think => async api => {
	const args = [...api.args];
	let eyes = 'oo';
	let tongue = '  ';
	let width = 40;
	let cow = 'default';
	let wrapText = true;
	const words = [];
	while (args.length) {
		const arg = args.shift();
		if (arg === '-l') {
			api.out(`Cow files in /usr/share/cowsay/cows:\n${Object.keys(COWS).join(' ')}\n`);
			return 0;
		} else if (arg === '-e' || arg === '-T' || arg === '-W' || arg === '-f') {
			const value = args.shift() ?? '';
			if (arg === '-e') {
				eyes = `${value}  `.slice(0, 2);
			} else if (arg === '-T') {
				tongue = `${value}  `.slice(0, 2);
			} else if (arg === '-W') {
				width = Number(value) || 40;
			} else if (!COWS[value]) {
				api.err(`${api.name}: Could not find ${value} cowfile!\n`);
				return 1;
			} else {
				cow = value;
			}
		} else if (arg === '-n') {
			wrapText = false;
		} else if (/^-[bdgpstwy]$/.test(arg)) {
			[eyes, tongue] = MODES[arg[1]];
		} else {
			words.push(arg, ...args.splice(0));
		}
	}

	const text = words.length ? words.join(' ') : (await api.readAll()).replace(/\n$/, '');
	const lines = wrapText ? wrap(text, width) : text.split('\n');
	api.out(`${[...balloon(lines, think), ...COWS[cow](eyes, tongue, think ? 'o' : '\\')].join('\n')}\n`);

	return 0;
};

export const PACKAGE_COMMANDS = {
	dnf,
	cowsay: cowsay(false),
	cowthink: cowsay(true),
};
