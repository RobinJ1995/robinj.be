import {FILES, PORTFOLIO} from './files';

// ~/portfolio is a shallow clone of the site's own repository. Its last commit
// comes from GitHub; nothing can be written.

const ORIGIN = 'https://github.com/RobinJ1995/robinj.be';
const COMMIT_API = 'https://api.github.com/repos/RobinJ1995/robinj.be/commits/master';
const BRANCH = 'master';
const GIT_DIR = `${PORTFOLIO}/.git`;
const VERSION = '2.51.1';
const TIMEOUT_MS = 6000;
const CLONED = new Date();

// The newest commit when this was written, for when GitHub can't be reached.
const OFFLINE = {
	sha: '8121b08087c714a5974de19725e3dcd66a195662',
	author: {name: 'Robin Jacobs', email: 'robin@robinj.be', date: '2026-10-28T00:30:28Z'},
	message: 'fix test',
	files: [{filename: 'e2e/hydration.spec.js', additions: 2, deletions: 2}],
};

let known = OFFLINE;
let request = null;

const fromGitHub = json => ({
	sha: json.sha,
	author: json.commit.author,
	message: json.commit.message,
	files: (json.files ?? []).map(file => ({
		filename: file.filename,
		previous: file.previous_filename,
		additions: file.additions,
		deletions: file.deletions,
	})),
});

// The last commit on master, asked of GitHub once per page load.
export const latestCommit = () => {
	request ??= (async () => {
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
		try {
			const response = await fetch(COMMIT_API, {
				signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/vnd.github+json'},
			});
			const json = response.ok ? await response.json() : null;
			if (/^[0-9a-f]{40}$/.test(json?.sha ?? '')) {
				known = fromGitHub(json);
			}
		} catch {
			/* Offline or rate-limited: the one from when this was written. */
		} finally {
			clearTimeout(timer);
		}
		return known;
	})();

	return request;
};

// For tests: forget what GitHub said.
export const resetCommit = () => {
	known = OFFLINE;
	request = null;
};

const tracked = () => Object.keys(FILES).filter(path => path.startsWith(`${PORTFOLIO}/`)).map(path => path.slice(PORTFOLIO.length + 1)).sort();

// --- What's in .git ---

const two = n => String(n).padStart(2, '0');
const zone = date => {
	const minutes = -date.getTimezoneOffset();
	return `${minutes < 0 ? '-' : '+'}${two(Math.floor(Math.abs(minutes) / 60))}${two(Math.abs(minutes) % 60)}`;
};

const HOOKS = {
	'applypatch-msg': 'check the commit log message taken by applypatch from an e-mail message', 'commit-msg': 'check the commit log message',
	'fsmonitor-watchman': 'integrate watchman with git to speed up detecting new and modified files', 'post-update': 'prepare a packed repository for use over dumb transports',
	'pre-applypatch': 'verify what is about to be committed by applypatch', 'pre-commit': 'verify what is about to be committed',
	'pre-merge-commit': 'verify what is about to be committed', 'pre-push': 'verify what is about to be pushed',
	'pre-rebase': 'prevent topic branches from being rebased', 'pre-receive': 'make use of push options',
	'prepare-commit-msg': 'prepare the commit log message', 'push-to-checkout': 'update a checked-out tree on push',
	'sendemail-validate': 'validate patches before sending them by e-mail', update: 'block unannotated tags from entering',
};

const hook = (name, purpose) => `#!/bin/sh\n#\n# An example hook script to ${purpose}.\n#\n# To enable this hook, rename this file to "${name}".\n`;

const CONFIG = [
	['core.repositoryformatversion', '0'], ['core.filemode', 'true'], ['core.bare', 'false'], ['core.logallrefupdates', 'true'],
	['remote.origin.url', ORIGIN], ['remote.origin.fetch', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`],
	[`branch.${BRANCH}.remote`, 'origin'], [`branch.${BRANCH}.merge`, `refs/heads/${BRANCH}`],
];

const configFile = () => {
	const sections = new Map();
	for (const [key, value] of CONFIG) {
		const parts = key.split('.');
		const name = parts.length === 3 ? `${parts[0]} "${parts[1]}"` : parts[0];
		sections.set(name, [...sections.get(name) ?? [], `\t${parts[parts.length - 1]} = ${value}`]);
	}
	return [...sections].map(([name, lines]) => `[${name}]\n${lines.join('\n')}\n`).join('');
};

// Binary files are their magic numbers and padding; the index names its files, as a real one does.
const index = () => `DIRC\0\0\0\x02\0\0\0${String.fromCharCode(tracked().length)}${tracked().map(name => `${'\0'.repeat(40)}\x81\xa4${'\0'.repeat(20)}${name}\0\0`).join('')}`;

// Paths under ~/portfolio/.git: {text, mode} for files, {} for directories.
export const repositoryFiles = () => {
	const {sha} = known;
	const pack = `${GIT_DIR}/objects/pack/pack-${[...sha].reverse().join('')}`;
	const reflog = `${'0'.repeat(40)} ${sha} Robin Jacobs <robin@robinj.be> ${Math.floor(CLONED / 1000)} ${zone(CLONED)}\tclone: from ${ORIGIN}\n`;
	const text = (value, mode = 0o644) => ({text: () => value, mode});
	const dirs = ['', '/hooks', '/info', '/logs', '/logs/refs', '/logs/refs/heads', '/logs/refs/remotes', '/logs/refs/remotes/origin',
		'/objects', '/objects/info', '/objects/pack', '/refs', '/refs/heads', '/refs/remotes', '/refs/remotes/origin', '/refs/tags'];

	return {
		...Object.fromEntries(dirs.map(path => [GIT_DIR + path, {}])),
		[`${GIT_DIR}/HEAD`]: text(`ref: refs/heads/${BRANCH}\n`),
		[`${GIT_DIR}/config`]: text(configFile()),
		[`${GIT_DIR}/description`]: text("Unnamed repository; edit this file 'description' to name the repository.\n"),
		[`${GIT_DIR}/index`]: {text: index, mode: 0o644},
		[`${GIT_DIR}/packed-refs`]: text(`# pack-refs with: peeled fully-peeled sorted \n${sha} refs/remotes/origin/${BRANCH}\n`),
		[`${GIT_DIR}/shallow`]: text(`${sha}\n`),
		...Object.fromEntries(Object.entries(HOOKS).map(([name, purpose]) => [`${GIT_DIR}/hooks/${name}.sample`, text(hook(name, purpose), 0o755)])),
		[`${GIT_DIR}/info/exclude`]: text("# git ls-files --others --exclude-from=.git/info/exclude\n# Lines that start with '#' are comments.\n# For a project mostly in C, the following would be a good set of\n# exclude patterns (uncomment them if you want to use them):\n# *.[oa]\n# *~\n"),
		[`${GIT_DIR}/logs/HEAD`]: text(reflog),
		[`${GIT_DIR}/logs/refs/heads/${BRANCH}`]: text(reflog),
		[`${GIT_DIR}/logs/refs/remotes/origin/HEAD`]: text(reflog),
		[`${pack}.idx`]: text(`\xfftOc\0\0\0\x02${'\0'.repeat(1020)}`, 0o444),
		[`${pack}.pack`]: text(`PACK\0\0\0\x02\0\0\x01\x37${'\0'.repeat(4084)}`, 0o444),
		[`${pack}.rev`]: text(`RIDX\0\0\0\x01\0\0\0\x01${'\0'.repeat(52)}`, 0o444),
		[`${GIT_DIR}/refs/heads/${BRANCH}`]: text(`${sha}\n`),
		[`${GIT_DIR}/refs/remotes/origin/HEAD`]: text(`ref: refs/remotes/origin/${BRANCH}\n`),
	};
};

// --- git ---

const USAGE = `usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]
           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]
           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--no-lazy-fetch]
           [--no-optional-locks] [--no-advice] [--bare] [--git-dir=<path>]
           [--work-tree=<path>] [--namespace=<name>] [--config-env=<name>=<envvar>]
           <command> [<args>]
`;

const HELP = `${USAGE}
These are common Git commands used in various situations:

start a working area (see also: git help tutorial)
   clone      Clone a repository into a new directory
   init       Create an empty Git repository or reinitialize an existing one

work on the current change (see also: git help everyday)
   add        Add file contents to the index
   mv         Move or rename a file, a directory, or a symlink
   restore    Restore working tree files
   rm         Remove files from the working tree and from the index

examine the history and state (see also: git help revisions)
   bisect     Use binary search to find the commit that introduced a bug
   diff       Show changes between commits, commit and working tree, etc
   grep       Print lines matching a pattern
   log        Show commit logs
   show       Show various types of objects
   status     Show the working tree status

grow, mark and tweak your common history
   backfill   Download missing objects in a partial clone
   branch     List, create, or delete branches
   commit     Record changes to the repository
   merge      Join two or more development histories together
   rebase     Reapply commits on top of another base tip
   reset      Reset current HEAD to the specified state
   switch     Switch branches
   tag        Create, list, delete or verify tags

collaborate (see also: git help workflows)
   fetch      Download objects and refs from another repository
   pull       Fetch from and integrate with another repository or a local branch
   push       Update remote refs along with associated objects

'git help -a' and 'git help -g' list available subcommands and some
concept guides. See 'git help <command>' or 'git help <concept>'
to read about a specific subcommand or concept.
See 'git help git' for an overview of the system.
`;

class Fatal extends Error {
	constructor(message, status = 128) {
		super(message);
		this.status = status;
	}
}

const ambiguous = arg => new Fatal(`fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
const indexLock = () => new Fatal(`fatal: Unable to create '${GIT_DIR}/index.lock': Read-only file system`);
const refLock = name => new Fatal(`fatal: cannot lock ref 'refs/heads/${name}': Unable to create '${GIT_DIR}/refs/heads/${name}.lock': Read-only file system`);

// Whether `rev` names the one commit there is.
const resolves = (rev, sha) => ['HEAD', '@', BRANCH, `heads/${BRANCH}`, `refs/heads/${BRANCH}`, `origin/${BRANCH}`, 'origin/HEAD', 'origin', `remotes/origin/${BRANCH}`, `refs/remotes/origin/${BRANCH}`].includes(rev)
	|| (/^[0-9a-f]{4,40}$/.test(rev) && sha.startsWith(rev));

const subject = message => message.split(/\n\s*\n/)[0].split('\n').map(line => line.trim()).join(' ');

const painter = api => (code, text) => (api.stdout.isTTY ? `\x1b[${code}m${text}\x1b[m` : text);

const decoration = paint => `${paint(33, ' (')}${paint('1;34', 'grafted')}${paint(33, ', ')}${paint('1;36', 'HEAD -> ')}${paint('1;32', BRANCH)}${paint(33, ', ')}${paint('1;31', `origin/${BRANCH}`)}${paint(33, ', ')}${paint('1;31', 'origin/HEAD')}${paint(33, ')')}`;

const gitDate = iso => {
	const date = new Date(iso);
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(two).join(':');
	return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()} ${time} ${date.getUTCFullYear()} +0000`;
};

// `a/b/c.js` and `a/d/c.js` as `a/{b => d}/c.js`, as git shows a rename.
const renamed = (from, to) => {
	let prefix = 0;
	for (let i = 0; i < Math.min(from.length, to.length) && from[i] === to[i]; i++) {
		if (from[i] === '/') {
			prefix = i + 1;
		}
	}
	let suffix = 0;
	for (let i = 1; i <= Math.min(from.length, to.length) - prefix + (prefix ? 1 : 0) && from[from.length - i] === to[to.length - i]; i++) {
		if (from[from.length - i] === '/') {
			suffix = i;
		}
	}
	const middle = (name, length) => name.slice(prefix, Math.max(prefix, length - suffix));
	const arrow = `${middle(from, from.length)} => ${middle(to, to.length)}`;

	return prefix + suffix ? `${from.slice(0, prefix)}{${arrow}}${from.slice(from.length - suffix)}` : arrow;
};

// --stat, sized to the terminal as git does it.
const diffstat = (files, columns, paint) => {
	const rows = files.map(file => ({name: file.previous ? renamed(file.previous, file.filename) : file.filename, add: file.additions, del: file.deletions}));
	const maxChange = Math.max(0, ...rows.map(row => row.add + row.del));
	const numberWidth = String(maxChange).length;
	const width = Math.max(columns, 22 + numberWidth);
	let nameWidth = Math.max(0, ...rows.map(row => row.name.length));
	let graphWidth = maxChange;
	if (nameWidth + numberWidth + 6 + graphWidth > width) {
		if (graphWidth > Math.floor(width * 3 / 8) - numberWidth - 6) {
			graphWidth = Math.max(Math.floor(width * 3 / 8) - numberWidth - 6, 6);
		}
		if (nameWidth > width - numberWidth - 6 - graphWidth) {
			nameWidth = width - numberWidth - 6 - graphWidth;
		} else {
			graphWidth = width - numberWidth - 6 - nameWidth;
		}
	}

	const scale = n => (n ? 1 + Math.floor(n * (graphWidth - 1) / maxChange) : 0);
	const lines = rows.map(({name, add, del}) => {
		const shown = name.length > nameWidth ? `...${name.slice(name.length - nameWidth + 3).replace(/^[^/]*(?=\/)/, '')}` : name;
		const total = Math.max(scale(add + del), add && del ? 2 : 0);
		const plus = add < del ? scale(add) : total - scale(del);
		const minus = total - plus;
		const graph = (plus ? paint(32, '+'.repeat(plus)) : '') + (minus ? paint(31, '-'.repeat(minus)) : '');
		return ` ${shown.padEnd(nameWidth)} | ${String(add + del).padStart(numberWidth)}${add + del ? ' ' : ''}${graph}`;
	});
	const added = rows.reduce((sum, row) => sum + row.add, 0);
	const deleted = rows.reduce((sum, row) => sum + row.del, 0);
	const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const summary = [` ${count(rows.length, 'file')} changed`];
	if (added || !deleted) {
		summary.push(`${count(added, 'insertion')}(+)`);
	}
	if (deleted || !added) {
		summary.push(`${count(deleted, 'deletion')}(-)`);
	}

	return rows.length ? [...lines, summary.join(', ')] : [' 0 files changed'];
};

const header = (commit, {oneline, decorate, paint}) => {
	const decorations = decorate ? decoration(paint) : '';
	if (oneline) {
		return [`${paint(33, commit.sha.slice(0, 7))}${decorations} ${subject(commit.message)}`];
	}

	return [
		`${paint(33, `commit ${commit.sha}`)}${decorations}`,
		`Author: ${commit.author.name} <${commit.author.email}>`,
		`Date:   ${gitDate(commit.author.date)}`,
		'',
		...commit.message.replace(/\s+$/, '').split('\n').map(line => `    ${line}`),
	];
};

// log and show: the one commit, its stat on request.
const history = async (api, args, show) => {
	const paint = painter(api);
	let oneline = false;
	let decorate = api.stdout.isTTY;
	let stat = show;
	let count = Infinity;
	let paths = null;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const number = arg.match(/^(?:-n|--max-count=?)(\d*)$|^-(\d+)$/);
		if (arg === '--') {
			paths = args.slice(i + 1);
			break;
		} else if (arg === '--oneline') {
			oneline = true;
		} else if (arg === '--decorate') {
			decorate = true;
		} else if (arg === '--no-decorate') {
			decorate = false;
		} else if (arg === '--stat') {
			stat = true;
		} else if (number && !show) {
			count = Number(number[1] || number[2] || args[++i]);
			if (!Number.isInteger(count)) {
				throw new Fatal(`fatal: '${args[i] ?? ''}': not an integer`);
			}
		} else if (arg.startsWith('-')) {
			throw new Fatal(`fatal: unrecognized argument: ${arg}`);
		} else if (tracked().includes(arg)) {
			paths = [arg];
		} else if (!resolves(arg, known.sha)) {
			throw ambiguous(arg);
		}
	}

	const commit = await api.abort.race(latestCommit());
	if (count < 1 || (paths && !paths.some(path => tracked().includes(path)))) {
		return 0;
	}
	const lines = header(commit, {oneline, decorate, paint});
	if (stat) {
		lines.push(...(oneline ? [] : ['']), ...diffstat(commit.files, api.stdout.isTTY ? api.tty.columns() : 80, paint));
	}
	api.out(lines.map(line => `${line}\n`).join(''));

	return 0;
};

const status = (api, args) => {
	const short = args.some(arg => /^-[a-z]*s/.test(arg) || arg === '--short' || arg.startsWith('--porcelain'));
	const branch = args.some(arg => /^-[a-z]*b/.test(arg) || arg === '--branch');
	if (short) {
		api.out(branch ? `## ${BRANCH}...origin/${BRANCH}\n` : '');
	} else {
		api.out(`On branch ${BRANCH}\nYour branch is up to date with 'origin/${BRANCH}'.\n\nnothing to commit, working tree clean\n`);
	}
	return 0;
};

const branch = async (api, args) => {
	const paint = painter(api);
	const flags = args.filter(arg => arg.startsWith('-')).join('');
	const names = args.filter(arg => !arg.startsWith('-'));
	if (args.includes('--show-current')) {
		api.out(`${BRANCH}\n`);
		return 0;
	} else if (/-(?:-delete|[a-z]*[dD])/.test(flags)) {
		for (const name of names) {
			api.err(name === BRANCH ? `error: cannot delete branch '${BRANCH}' used by worktree at '${PORTFOLIO}'\n` : `error: branch '${name}' not found\n`);
		}
		return 1;
	} else if (names.length) {
		throw refLock(names[0]);
	}

	const remote = /-(?:-remotes?|[a-z]*r)/.test(flags);
	const all = /-(?:-all|[a-z]*a)/.test(flags);
	const verbose = (flags.match(/v/g) ?? []).length;
	const commit = verbose ? await api.abort.race(latestCommit()) : known;
	const rows = [
		...(remote ? [] : [{current: true, name: BRANCH, shown: paint(32, BRANCH), tracking: `origin/${BRANCH}`}]),
		...(remote || all ? [
			{name: `${all ? 'remotes/' : ''}origin/HEAD`, link: `origin/${BRANCH}`},
			{name: `${all ? 'remotes/' : ''}origin/${BRANCH}`},
		] : []),
	];
	const width = Math.max(...rows.map(row => row.name.length));
	api.out(rows.map(row => {
		const name = row.shown ?? paint(31, row.name);
		if (!verbose) {
			return `${row.current ? '*' : ' '} ${name}${row.link ? ` -> ${row.link}` : ''}\n`;
		}
		const pad = ' '.repeat(width - row.name.length);
		const tracking = verbose > 1 && row.tracking ? `[${paint(34, row.tracking)}] ` : '';
		const detail = row.link ? `-> ${row.link}` : `${paint(33, commit.sha.slice(0, 7))} ${tracking}${subject(commit.message)}`;
		return `${row.current ? '*' : ' '} ${name}${pad} ${detail}\n`;
	}).join(''));

	return 0;
};

const remote = (api, args) => {
	const [command, ...rest] = args.filter(arg => arg !== '-v' && arg !== '--verbose');
	if (command === undefined) {
		api.out(args.length ? `origin\t${ORIGIN} (fetch)\norigin\t${ORIGIN} (push)\n` : 'origin\n');
		return 0;
	} else if (command === 'get-url') {
		if (rest[0] !== 'origin') {
			throw new Fatal(`error: No such remote '${rest[0] ?? ''}'`, 2);
		}
		api.out(`${ORIGIN}\n`);
		return 0;
	} else if (['add', 'remove', 'rm', 'rename', 'set-url', 'set-head', 'set-branches'].includes(command)) {
		throw new Fatal('error: could not lock config file .git/config: Read-only file system', 1);
	} else if (['show', 'prune', 'update'].includes(command)) {
		throw new Fatal(`fatal: unable to access '${ORIGIN}/': Failed to connect to github.com port 443 after 0 ms: Could not connect to server`);
	}

	throw new Fatal(`error: unknown subcommand: \`${command}'`, 129);
};

const revParse = async (api, args, cwd) => {
	const inGitDir = cwd === GIT_DIR || cwd.startsWith(`${GIT_DIR}/`);
	let short = 0;
	let abbrev = false;
	const out = [];
	for (const arg of args) {
		const shortness = arg.match(/^--short(?:=(\d+))?$/);
		const answers = {
			'--is-shallow-repository': 'true', '--is-inside-work-tree': String(!inGitDir), '--is-inside-git-dir': String(inGitDir),
			'--is-bare-repository': 'false', '--show-toplevel': PORTFOLIO, '--git-dir': inGitDir ? '.' : '.git',
			'--absolute-git-dir': GIT_DIR, '--show-prefix': '', '--symbolic-full-name': null, '--verify': null, '-q': null, '--quiet': null,
		};
		if (shortness) {
			short = Math.min(Math.max(Number(shortness[1] ?? 7), 4), 40);
		} else if (arg === '--abbrev-ref') {
			abbrev = true;
		} else if (Object.hasOwn(answers, arg)) {
			if (answers[arg] !== null) {
				out.push(answers[arg]);
			}
		} else if (arg.startsWith('-')) {
			out.push(arg);
		} else if (resolves(arg, known.sha)) {
			const {sha} = await api.abort.race(latestCommit());
			if (abbrev) {
				out.push(arg.includes('origin') ? `origin/${BRANCH}` : BRANCH);
			} else {
				out.push(short ? sha.slice(0, short) : sha);
			}
		} else {
			api.out([...out, arg].map(line => `${line}\n`).join(''));
			throw ambiguous(arg);
		}
	}
	api.out(out.map(line => `${line}\n`).join(''));

	return 0;
};

const config = (api, args, inRepo) => {
	const settings = inRepo ? CONFIG : [];
	const [first, ...rest] = args;
	const list = ['--list', '-l', 'list'].includes(first);
	const keys = list ? [] : ['--get', 'get'].includes(first) ? rest : args;
	const unknown = args.find(arg => arg.startsWith('-') && !['--list', '-l', '--get', '--local', '--global'].includes(arg));
	if (unknown) {
		throw new Fatal(`error: unknown option \`${unknown.replace(/^-+/, '')}'`, 129);
	} else if (list) {
		api.out(settings.map(([key, value]) => `${key}=${value}\n`).join(''));
		return 0;
	}

	const operands = keys.filter(arg => !arg.startsWith('-'));
	if (operands.length === 0) {
		throw new Fatal('error: no action specified', 129);
	} else if (operands.length > 1) {
		const file = args.includes('--global') ? `${PORTFOLIO.replace(/\/portfolio$/, '')}/.gitconfig` : '.git/config';
		throw new Fatal(`error: could not lock config file ${file}: Read-only file system`, 255);
	} else if (!operands[0].includes('.')) {
		throw new Fatal(`error: key does not contain a section: ${operands[0]}`, 1);
	}

	const found = settings.find(([key]) => key.toLowerCase() === operands[0].toLowerCase());
	if (!found) {
		return 1;
	}
	api.out(`${found[1]}\n`);

	return 0;
};

// What git suggests for a typo: its own weighted Damerau-Levenshtein distance.
const COMMANDS = ['add', 'am', 'archive', 'backfill', 'bisect', 'blame', 'branch', 'bundle', 'checkout', 'cherry-pick', 'citool', 'clean', 'clone', 'commit',
	'config', 'describe', 'diff', 'fetch', 'format-patch', 'fsck', 'gc', 'grep', 'gui', 'help', 'init', 'log', 'ls-files', 'maintenance', 'merge', 'mv',
	'notes', 'pull', 'push', 'range-diff', 'rebase', 'reflog', 'remote', 'repack', 'replace', 'reset', 'restore', 'rev-parse', 'revert', 'rm', 'shortlog',
	'show', 'sparse-checkout', 'stash', 'status', 'submodule', 'switch', 'tag', 'version', 'worktree'];

const distance = (a, b) => {
	let previous = null;
	let row = Array.from({length: b.length + 1}, (_, j) => j);
	for (let i = 0; i < a.length; i++) {
		const next = [(i + 1) * 3];
		for (let j = 0; j < b.length; j++) {
			let cost = row[j] + (a[i] === b[j] ? 0 : 2);
			if (i > 0 && j > 0 && a[i - 1] === b[j] && a[i] === b[j - 1]) {
				cost = Math.min(cost, previous[j - 1]);
			}
			next.push(Math.min(cost, row[j + 1] + 3, next[j] + 1));
		}
		previous = row;
		row = next;
	}
	return row[b.length];
};

const unknownCommand = name => {
	const scored = COMMANDS.map(command => ({command, score: command.startsWith(name) ? 0 : distance(name, command) + 1})).sort((a, b) => a.score - b.score);
	const best = scored.filter(({score}) => score === scored[0].score).map(({command}) => command);
	const similar = scored[0].score < 7 ? `\nThe most similar command${best.length > 1 ? 's are' : ' is'}\n${best.map(command => `\t${command}\n`).join('')}` : '';
	return new Fatal(`git: '${name}' is not a git command. See 'git --help'.\n${similar}`.replace(/\n$/, ''), 1);
};

const push = async api => {
	api.tty.write("Username for 'https://github.com': ");
	const user = await api.abort.race(api.tty.read());
	if (user === null) {
		api.tty.write('\n');
		throw new Fatal("fatal: could not read Username for 'https://github.com': No such device or address");
	}
	await api.readPassword(`Password for 'https://${user.trim()}@github.com': `);
	await api.sleep(1000);
	throw new Fatal(`fatal: Authentication failed for '${ORIGIN}/'`);
};

const clone = (api, args) => {
	const [url, directory] = args.filter(arg => !arg.startsWith('-'));
	if (url === undefined) {
		throw new Fatal('fatal: You must specify a repository to clone.\n\nusage: git clone [<options>] [--] <repo> [<dir>]', 129);
	}
	const name = directory ?? url.replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop();
	const found = api.fs.list(api.resolve(name));
	if (!found.error && found.names.length) {
		throw new Fatal(`fatal: destination path '${name}' already exists and is not an empty directory.`);
	}
	throw new Fatal(`fatal: could not create work tree dir '${name}': ${api.fs.writeError(api.resolve(name)) ?? 'Read-only file system'}`);
};

// Subcommands that need the repository, and change nothing in it or fail trying.
const REPOSITORY = {
	status: (api, args, cwd) => {
		if (cwd.startsWith(GIT_DIR)) {
			throw new Fatal('fatal: this operation must be run in a work tree');
		}
		return status(api, args);
	},
	log: (api, args) => history(api, args, false),
	show: (api, args) => history(api, args, true),
	branch,
	remote,
	'rev-parse': revParse,
	'ls-files': (api, args, cwd) => {
		if (cwd.startsWith(GIT_DIR)) {
			throw new Fatal('fatal: this operation must be run in a work tree');
		}
		api.out(tracked().map(name => `${name}\n`).join(''));
		return 0;
	},
	diff: (api, args) => {
		const rev = args.find(arg => !arg.startsWith('-') && !tracked().includes(arg) && !resolves(arg, known.sha));
		if (rev) {
			throw ambiguous(rev);
		}
		return 0;
	},
	describe: (api, args) => {
		if (args.includes('--always')) {
			api.out(`${known.sha.slice(0, 7)}\n`);
			return 0;
		}
		throw new Fatal('fatal: No names found, cannot describe anything.');
	},
	tag: (api, args) => {
		if (args.some(arg => !arg.startsWith('-'))) {
			throw new Fatal(`fatal: cannot lock ref 'refs/tags/${args.find(arg => !arg.startsWith('-'))}': Unable to create '${GIT_DIR}/refs/tags/${args.find(arg => !arg.startsWith('-'))}.lock': Read-only file system`);
		}
		return 0;
	},
	add: (api, args) => {
		if (args.length === 0) {
			api.err("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\nhint: Disable this message with \"git config set advice.addEmptyPathspec false\"\n");
			return 0;
		}
		throw indexLock();
	},
	checkout: (api, args) => {
		const name = args.find(arg => !arg.startsWith('-'));
		if ((args.includes('-b') || args.includes('-B')) && name === undefined) {
			throw new Fatal("error: switch `b' requires a value", 129);
		} else if (args.includes('-b') || args.includes('-B')) {
			throw refLock(name);
		} else if (name === BRANCH) {
			api.err(`Already on '${BRANCH}'\n`);
			api.out(`Your branch is up to date with 'origin/${BRANCH}'.\n`);
			return 0;
		} else if (name && !tracked().includes(name) && name !== '.') {
			throw new Fatal(`error: pathspec '${name}' did not match any file(s) known to git`, 1);
		}
		throw indexLock();
	},
	fetch: () => {
		throw new Fatal("error: cannot open '.git/FETCH_HEAD': Read-only file system", 1);
	},
	push,
	init: () => {
		throw new Fatal(`error: could not lock config file ${GIT_DIR}/config: Read-only file system\nfatal: could not set 'core.repositoryformatversion' to '0'`);
	},
};
REPOSITORY.pull = REPOSITORY.fetch;
REPOSITORY.switch = (api, args) => REPOSITORY.checkout(api, args.map(arg => (arg === '-c' || arg === '--create' ? '-b' : arg)));
for (const name of ['commit', 'rm', 'mv', 'restore', 'reset', 'merge', 'rebase', 'cherry-pick', 'revert', 'stash', 'apply', 'am', 'clean', 'gc']) {
	REPOSITORY[name] = () => {
		throw indexLock();
	};
}

export const git = async api => {
	const args = [...api.args];
	let cwd = api.cwd;
	while (args[0]?.startsWith('-')) {
		const option = args.shift();
		if (option === '--version' || option === '-v') {
			args.unshift('version');
			break;
		} else if (option === '--help' || option === '-h') {
			args.unshift('help');
			break;
		} else if (option === '-C' && args.length === 0) {
			api.err("error: no directory given for '-C' option\n");
			return 129;
		} else if (option === '-C') {
			const path = args.shift();
			const found = api.fs.lookup(api.resolve(path));
			if (found.error || found.entry.type !== 'dir') {
				api.err(`fatal: cannot change to '${path}': ${found.error ?? 'Not a directory'}\n`);
				return 128;
			}
			cwd = found.path;
		} else if (option === '-c') {
			args.shift();
		} else if (!['-p', '--paginate', '-P', '--no-pager', '--no-optional-locks', '--no-advice'].includes(option)) {
			api.err(`unknown option: ${option}\n${USAGE}`);
			return 129;
		}
	}

	const [command, ...rest] = args;
	const inRepo = cwd === PORTFOLIO || cwd.startsWith(`${PORTFOLIO}/`);
	try {
		if (command === undefined) {
			api.out(HELP);
			return 1;
		} else if (command === 'help') {
			if (rest.length) {
				throw new Fatal("warning: failed to exec 'man': No such file or directory\nfatal: no man viewer handled the request");
			}
			api.out(HELP);
			return 0;
		} else if (command === 'version') {
			api.out(`git version ${VERSION}\n`);
			return 0;
		} else if (command === 'clone') {
			return clone(api, rest);
		} else if (command === 'config') {
			return config(api, rest, inRepo);
		} else if (!Object.hasOwn(REPOSITORY, command)) {
			throw unknownCommand(command);
		} else if (!inRepo) {
			throw new Fatal(command === 'init'
				? `${cwd}/.git: ${api.fs.writeError(`${cwd}/.git`)}`
				: 'fatal: not a git repository (or any of the parent directories): .git', command === 'init' ? 1 : 128);
		}
		return await REPOSITORY[command](api, rest, cwd);
	} catch (e) {
		if (!(e instanceof Fatal)) {
			throw e;
		}
		api.err(`${e.message}\n`);
		return e.status;
	}
};
