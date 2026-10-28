import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';
import {resetCommit} from './git';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const COMMIT = {
	sha: SHA,
	commit: {author: {name: 'Robin Jacobs', email: 'robin@robinj.be', date: '2026-10-27T17:12:21Z'}, message: 'Add a terminal\n\nWith a body paragraph.\n'},
	files: [
		{filename: 'src/console/shell.js', additions: 120, deletions: 30},
		{filename: 'src/console/awk.js', additions: 900, deletions: 0},
		{filename: 'src/console/old.js', previous_filename: 'src/view/old.js', additions: 0, deletions: 0},
	],
};
const HEADER = [
	`commit ${SHA} (grafted, HEAD -> master, origin/master, origin/HEAD)`,
	'Author: Robin Jacobs <robin@robinj.be>',
	'Date:   Tue Oct 27 17:12:21 2026 +0000',
	'',
	'    Add a terminal',
	'    ',
	'    With a body paragraph.',
].join('\n');
const STAT = [
	' src/console/shell.js         | 150 ++++++--',
	' src/console/awk.js           | 900 +++++++++++++++++++++++++++++++++++++++++++',
	' src/{view => console}/old.js |   0',
	' 3 files changed, 1020 insertions(+), 30 deletions(-)',
].join('\n');
const AMBIGUOUS = "fatal: ambiguous argument 'HEAD~1': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'";
const LOCK = "fatal: Unable to create '/home/robin/portfolio/.git/index.lock': Read-only file system";

const respond = (json, ok = true) => vi.fn(async () => ({ok, json: async () => json}));

beforeEach(() => {
	stubStorage();
	resetCommit();
	vi.stubGlobal('fetch', respond(COMMIT));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('git and GitHub', () => {
	it('asks GitHub for the latest commit once, without credentials or a referrer', async () => {
		const {run} = setup();

		expect(await run('git rev-parse HEAD; git log --oneline | cat')).toBe(`${SHA}\n0123456 Add a terminal`);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/RobinJ1995/robinj.be/commits/master', expect.objectContaining({
			credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/vnd.github+json'},
		}));
		expect(await setup().run('git rev-parse --short HEAD')).toBe('0123456');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('falls back on the commit it was built with when GitHub has nothing to say', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}));
		expect(await setup().run('git log --oneline | cat')).toBe('8121b08 fix test');

		resetCommit();
		vi.stubGlobal('fetch', respond({message: 'API rate limit exceeded'}, false));
		expect(await setup().run('git show | cat')).toBe([
			'commit 8121b08087c714a5974de19725e3dcd66a195662',
			'Author: Robin Jacobs <robin@robinj.be>',
			'Date:   Wed Oct 28 00:30:28 2026 +0000',
			'',
			'    fix test',
			'',
			' e2e/hydration.spec.js | 4 ++--',
			' 1 file changed, 2 insertions(+), 2 deletions(-)',
		].join('\n'));

		resetCommit();
		vi.stubGlobal('fetch', respond({sha: 'not a sha'}));
		expect(await setup().run('git rev-parse HEAD')).toBe('8121b08087c714a5974de19725e3dcd66a195662');
	});

	it('gives up on GitHub after a while', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn((url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
		const {shell, tty} = setup();

		const running = shell.execute('git rev-parse --short HEAD');
		await vi.advanceTimersByTimeAsync(6000);
		await running;
		expect(tty.take()).toBe('8121b08\n');
	});

	it('stops waiting for GitHub at ^C', async () => {
		vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
		const {shell, tty} = setup();

		const running = shell.execute('git log');
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		shell.interrupt();
		await running;
		expect(tty.take()).toBe('\n');
		expect(shell.state.status).toBe(130);
	});
});

describe('git, looking around', () => {
	it('shows a clean status', async () => {
		const {run} = setup();

		expect(await run('git status')).toBe("On branch master\nYour branch is up to date with 'origin/master'.\n\nnothing to commit, working tree clean");
		expect(await run('git status -s')).toBe('');
		expect(await run('git status -sb')).toBe('## master...origin/master');
		expect(await run('git status --short --branch')).toBe('## master...origin/master');
		expect(await run('git status --porcelain')).toBe('');
	});

	it('logs the one commit there is, grafted where the history was cut off', async () => {
		const {shell, run} = setup();

		expect(await run('git log')).toBe(HEADER);
		expect(await run('git log | cat')).toBe(HEADER.replace(/ \(grafted.*\)/, ''));
		expect(await run('git log --oneline')).toBe('0123456 (grafted, HEAD -> master, origin/master, origin/HEAD) Add a terminal');
		expect(await run('git log --no-decorate --oneline')).toBe('0123456 Add a terminal');
		expect(await run('git log --decorate -1 | head -1')).toBe(HEADER.split('\n')[0]);
		expect(await run('git log -n1 --max-count=1 -n 1 | wc -l')).toBe('7');
		expect(await run('git log --max-count 0')).toBe('');
		expect(await run('git log -- cv.md | head -1')).toBe(`commit ${SHA}`);
		expect(await run('git log whoami.txt | head -1')).toBe(`commit ${SHA}`);
		expect(await run('git log master origin/HEAD 0123 -- nope')).toBe('');
		expect(await run('git log --stat')).toBe(`${HEADER}\n\n${STAT}`);
		expect(await run('git log --oneline --stat')).toBe(`0123456 (grafted, HEAD -> master, origin/master, origin/HEAD) Add a terminal\n${STAT}`);
		expect(await run('git log HEAD~1')).toBe(AMBIGUOUS);
		expect(shell.state.status).toBe(128);
		expect(await run('git log -n x; git log -n')).toBe("fatal: 'x': not an integer\nfatal: '': not an integer");
		expect(await run('git log -p')).toBe('fatal: unrecognized argument: -p');
	});

	it('colours the log on a terminal', async () => {
		const {shell, tty} = setup();

		await shell.execute('git log --oneline');
		expect(tty.take({codes: true})).toBe('\x1b[33m0123456\x1b[m\x1b[33m (\x1b[m\x1b[1;34mgrafted\x1b[m\x1b[33m, \x1b[m\x1b[1;36mHEAD -> \x1b[m\x1b[1;32mmaster\x1b[m\x1b[33m, \x1b[m\x1b[1;31morigin/master\x1b[m\x1b[33m, \x1b[m\x1b[1;31morigin/HEAD\x1b[m\x1b[33m)\x1b[m Add a terminal\n');
	});

	it('shows the commit with what it changed, as wide as the terminal', async () => {
		const {shell, tty, run} = setup({columns: 40});

		expect(await run('git show | cat')).toBe(`${HEADER.replace(/ \(grafted.*\)/, '')}\n\n${STAT}`);
		await shell.execute('git show --stat HEAD');
		expect(tty.take().split('\n').slice(-5)).toEqual([
			' src/console/shell.js      | 150 +-',
			' src/console/awk.js        | 900 ++++++',
			' .../old.js                |   0',
			' 3 files changed, 1020 insertions(+), 30 deletions(-)',
			'',
		]);
		expect(await run('git show HEAD~1')).toBe(AMBIGUOUS);
	});

	it('sizes the stat for long names and renames like git does', async () => {
		vi.stubGlobal('fetch', respond({...COMMIT, files: [
			{filename: 'a/very/long/path/that/goes/on/and/on/and/on/forever/and/ever/and/ever/and/ever/file.js', additions: 1, deletions: 1},
			{filename: 'x/b.js', previous_filename: 'y/b.js', additions: 2, deletions: 0},
			{filename: 'only-deleted.js', additions: 0, deletions: 3},
			{filename: 'c.js', previous_filename: 'd.js', additions: 0, deletions: 0},
		]}));
		const {run} = setup();

		expect(await run('git show --oneline | tail -5')).toBe([
			` ${'.../goes/on/and/on/and/on/forever/and/ever/and/ever/and/ever/file.js'.padEnd(70)} | 2 +-`,
			` ${'{y => x}/b.js'.padEnd(70)} | 2 ++`,
			` ${'only-deleted.js'.padEnd(70)} | 3 ---`,
			` ${'d.js => c.js'.padEnd(70)} | 0`,
			' 4 files changed, 3 insertions(+), 4 deletions(-)',
		].join('\n'));
	});

	it('counts what changed in all its forms', async () => {
		vi.stubGlobal('fetch', respond({...COMMIT, files: [{filename: 'one.js', additions: 0, deletions: 1}]}));
		expect(await setup().run('git show --oneline | tail -1')).toBe(' 1 file changed, 1 deletion(-)');

		resetCommit();
		vi.stubGlobal('fetch', respond({...COMMIT, files: [{filename: 'one.js', additions: 1, deletions: 0}]}));
		expect(await setup().run('git show --oneline | tail -1')).toBe(' 1 file changed, 1 insertion(+)');

		resetCommit();
		vi.stubGlobal('fetch', respond({...COMMIT, files: []}));
		expect(await setup().run('git show --oneline | tail -1')).toBe(' 0 files changed');

		resetCommit();
		vi.stubGlobal('fetch', respond({...COMMIT, files: undefined}));
		expect(await setup().run('git show --oneline | tail -1')).toBe(' 0 files changed');
	});

	it('lists branches, local and remote', async () => {
		const {run, shell, tty} = setup();

		expect(await run('git branch')).toBe('* master');
		expect(await run('git branch -a')).toBe('* master\n  remotes/origin/HEAD -> origin/master\n  remotes/origin/master');
		expect(await run('git branch -r')).toBe('  origin/HEAD -> origin/master\n  origin/master');
		expect(await run('git branch -v')).toBe('* master 0123456 Add a terminal');
		expect(await run('git branch -avv')).toBe('* master                0123456 [origin/master] Add a terminal\n  remotes/origin/HEAD   -> origin/master\n  remotes/origin/master 0123456 Add a terminal');
		expect(await run('git branch --show-current')).toBe('master');
		await shell.execute('git branch -a');
		expect(tty.take({codes: true})).toBe('* \x1b[32mmaster\x1b[m\n  \x1b[31mremotes/origin/HEAD\x1b[m -> origin/master\n  \x1b[31mremotes/origin/master\x1b[m\n');
	});

	it('knows its remote', async () => {
		const {shell, run} = setup();

		expect(await run('git remote')).toBe('origin');
		expect(await run('git remote -v')).toBe('origin\thttps://github.com/RobinJ1995/robinj.be (fetch)\norigin\thttps://github.com/RobinJ1995/robinj.be (push)');
		expect(await run('git remote get-url origin')).toBe('https://github.com/RobinJ1995/robinj.be');
		expect(await run('git remote get-url upstream; git remote get-url')).toBe("error: No such remote 'upstream'\nerror: No such remote ''");
		expect(shell.state.status).toBe(2);
		expect(await run('git remote show origin')).toBe("fatal: unable to access 'https://github.com/RobinJ1995/robinj.be/': Failed to connect to github.com port 443 after 0 ms: Could not connect to server");
		expect(await run('git remote frob')).toBe('error: unknown subcommand: `frob\'');
		expect(shell.state.status).toBe(129);
	});

	it('answers rev-parse questions', async () => {
		const {shell, run} = setup();

		expect(await run('git rev-parse HEAD master origin/master')).toBe(`${SHA}\n${SHA}\n${SHA}`);
		expect(await run('git rev-parse --short HEAD --short=10 @')).toBe('0123456\n0123456789');
		expect(await run('git rev-parse --abbrev-ref HEAD origin/HEAD')).toBe('master\norigin/master');
		expect(await run('git rev-parse --is-shallow-repository --is-inside-work-tree --is-inside-git-dir --is-bare-repository')).toBe('true\ntrue\nfalse\nfalse');
		expect(await run('git rev-parse --show-toplevel --git-dir --absolute-git-dir --show-prefix --verify -q HEAD')).toBe(`/home/robin/portfolio\n.git\n/home/robin/portfolio/.git\n\n${SHA}`);
		expect(await run('git rev-parse --flag')).toBe('--flag');
		expect(await run('git rev-parse HEAD~1')).toBe(`HEAD~1\n${AMBIGUOUS}`);
		expect(shell.state.status).toBe(128);
		expect(await run('cd .git/refs; git rev-parse --is-inside-work-tree --git-dir')).toBe('false\n.');
	});

	it('reads its configuration', async () => {
		const {shell, run} = setup();

		expect(await run('git config --list')).toBe([
			'core.repositoryformatversion=0', 'core.filemode=true', 'core.bare=false', 'core.logallrefupdates=true',
			'remote.origin.url=https://github.com/RobinJ1995/robinj.be', 'remote.origin.fetch=+refs/heads/master:refs/remotes/origin/master',
			'branch.master.remote=origin', 'branch.master.merge=refs/heads/master',
		].join('\n'));
		expect(await run('git config --get remote.origin.url')).toBe('https://github.com/RobinJ1995/robinj.be');
		expect(await run('git config get Branch.master.Remote')).toBe('origin');
		expect(await run('git config user.name')).toBe('');
		expect(shell.state.status).toBe(1);
		expect(await run('git config nosection')).toBe('error: key does not contain a section: nosection');
		expect(await run('git config user.name Robin')).toBe('error: could not lock config file .git/config: Read-only file system');
		expect(shell.state.status).toBe(255);
		expect(await run('git config --global user.name Robin')).toBe('error: could not lock config file /home/robin/.gitconfig: Read-only file system');
		expect(await run('git config')).toBe('error: no action specified');
		expect(await run('git config --frob')).toBe("error: unknown option `frob'");
		expect(shell.state.status).toBe(129);
		expect(await run('cd ~; git config -l; git config core.bare')).toBe('');
	});

	it('lists its files, finds no differences, and has nothing to describe', async () => {
		const {shell, run} = setup();

		expect(await run('git ls-files')).toBe('contact.yml\ncv.md\nside-quests.yml\nwhoami.txt');
		expect(await run('git diff; git diff --stat HEAD cv.md; echo $?')).toBe('0');
		expect(await run('git diff HEAD~1')).toBe(AMBIGUOUS);
		expect(await run('git describe')).toBe('fatal: No names found, cannot describe anything.');
		expect(shell.state.status).toBe(128);
		expect(await run('git describe --always')).toBe('8121b08');
		expect(await run('git tag; echo $?')).toBe('0');
	});

	it('only works in the repository, and in its work tree for some things', async () => {
		const {shell, run} = setup();

		expect(await run('cd /tmp; git status')).toBe('fatal: not a git repository (or any of the parent directories): .git');
		expect(shell.state.status).toBe(128);
		expect(await run('git -C ~/portfolio status | head -1')).toBe('On branch master');
		expect(await run('git -C /nope status')).toBe("fatal: cannot change to '/nope': No such file or directory");
		expect(await run('git -C')).toBe("error: no directory given for '-C' option");
		expect(await run('git -C /etc/hostname status')).toBe("fatal: cannot change to '/etc/hostname': Not a directory");
		expect(await run('cd ~/portfolio/.git; git status; git ls-files')).toBe('fatal: this operation must be run in a work tree\nfatal: this operation must be run in a work tree');
		expect(await run('cd ~/portfolio; git -c color.ui=never --no-pager -P status -s; echo $?')).toBe('0');
	});
});

describe('git, trying to change things', () => {
	it('cannot write to the index, refs or config on a read-only filesystem', async () => {
		const {shell, run} = setup();

		expect(await run('git commit -m x')).toBe(LOCK);
		expect(shell.state.status).toBe(128);
		expect(await run('git add .')).toBe(LOCK);
		expect(await run('git stash; git reset --hard; git rm cv.md; git checkout -- cv.md; git checkout')).toBe(Array(5).fill(LOCK).join('\n'));
		expect(await run('git branch new')).toBe("fatal: cannot lock ref 'refs/heads/new': Unable to create '/home/robin/portfolio/.git/refs/heads/new.lock': Read-only file system");
		expect(await run('git checkout -b feature; git switch -c other; git switch --create third')).toBe([
			"fatal: cannot lock ref 'refs/heads/feature': Unable to create '/home/robin/portfolio/.git/refs/heads/feature.lock': Read-only file system",
			"fatal: cannot lock ref 'refs/heads/other': Unable to create '/home/robin/portfolio/.git/refs/heads/other.lock': Read-only file system",
			"fatal: cannot lock ref 'refs/heads/third': Unable to create '/home/robin/portfolio/.git/refs/heads/third.lock': Read-only file system",
		].join('\n'));
		expect(await run('git tag v1')).toBe("fatal: cannot lock ref 'refs/tags/v1': Unable to create '/home/robin/portfolio/.git/refs/tags/v1.lock': Read-only file system");
		expect(await run('git remote add upstream x')).toBe('error: could not lock config file .git/config: Read-only file system');
		expect(await run('git init')).toBe("error: could not lock config file /home/robin/portfolio/.git/config: Read-only file system\nfatal: could not set 'core.repositoryformatversion' to '0'");
		expect(await run('cd /tmp; git init; echo $?')).toBe('/tmp/.git: Read-only file system\n1');
	});

	it('explains what there is nothing to do about', async () => {
		const {shell, run} = setup();

		expect(await run('git add')).toBe("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\nhint: Disable this message with \"git config set advice.addEmptyPathspec false\"");
		expect(shell.state.status).toBe(0);
		expect(await run('git checkout master; git switch master')).toBe("Already on 'master'\nYour branch is up to date with 'origin/master'.\nAlready on 'master'\nYour branch is up to date with 'origin/master'.");
		expect(await run('git checkout nope')).toBe("error: pathspec 'nope' did not match any file(s) known to git");
		expect(shell.state.status).toBe(1);
		expect(await run('git checkout -b')).toBe("error: switch `b' requires a value");
		expect(await run('git branch -d master feature')).toBe("error: cannot delete branch 'master' used by worktree at '/home/robin/portfolio'\nerror: branch 'feature' not found");
	});

	it('cannot fetch, pull or clone onto a read-only filesystem', async () => {
		const {shell, run} = setup();

		expect(await run('git fetch; git pull')).toBe("error: cannot open '.git/FETCH_HEAD': Read-only file system\nerror: cannot open '.git/FETCH_HEAD': Read-only file system");
		expect(shell.state.status).toBe(1);
		expect(await run('git clone https://github.com/RobinJ1995/robinj.be.git')).toBe("fatal: could not create work tree dir 'robinj.be': Read-only file system");
		expect(await run('cd ~; git clone https://github.com/RobinJ1995/robinj.be portfolio')).toBe("fatal: destination path 'portfolio' already exists and is not an empty directory.");
		expect(await run('cd /; git clone git@github.com:x/y.git /root/y')).toBe("fatal: could not create work tree dir '/root/y': Permission denied");
		expect(await run('git clone https://x/y.git /dev/null')).toBe("fatal: could not create work tree dir '/dev/null': Read-only file system");
		expect(await run('git clone')).toBe('fatal: You must specify a repository to clone.\n\nusage: git clone [<options>] [--] <repo> [<dir>]');
		expect(shell.state.status).toBe(129);
	});

	it('cannot push without credentials, which GitHub no longer takes as a password anyway', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({input: ['robin\n', 'hunter2\n']});

		const running = shell.execute('git push');
		await vi.advanceTimersByTimeAsync(1000);
		await running;
		expect(tty.take()).toBe([
			"Username for 'https://github.com': Password for 'https://robin@github.com': ",
			"fatal: Authentication failed for 'https://github.com/RobinJ1995/robinj.be/'",
			'',
		].join('\n'));
		expect(shell.state.status).toBe(128);

		const {shell: other, run} = setup();
		expect(await run.call(null, 'git push')).toBe("Username for 'https://github.com': \nfatal: could not read Username for 'https://github.com': No such device or address");
		expect(other.state.status).toBe(128);
	});
});

describe('git, helping', () => {
	it('says what it is and how to use it', async () => {
		const {shell, run} = setup();

		expect(await run('git --version; git version; git -v')).toBe('git version 2.51.1\ngit version 2.51.1\ngit version 2.51.1');
		expect(await run('git | head -1')).toBe('usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]');
		expect(await run('git; echo $?')).toMatch(/See 'git help git' for an overview of the system\.\n1$/);
		expect(await run('git help | tail -1; git --help | head -1; git -h | head -1')).toBe("See 'git help git' for an overview of the system.\nusage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]\nusage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]");
		expect(await run('git help log')).toBe("warning: failed to exec 'man': No such file or directory\nfatal: no man viewer handled the request");
		expect(await run('git --bogus 2>&1 | head -1')).toBe('unknown option: --bogus');
		expect(await run('git --bogus 2>/dev/null; echo $?')).toBe('129');
		expect(shell.state.status).toBe(0);
	});

	it('suggests what was probably meant', async () => {
		const {shell, run} = setup();

		expect(await run('git stauts')).toBe("git: 'stauts' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tstatus");
		expect(shell.state.status).toBe(1);
		expect(await run('git psuh')).toBe("git: 'psuh' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tpush");
		expect(await run('git sta')).toBe("git: 'sta' is not a git command. See 'git --help'.\n\nThe most similar commands are\n\tstash\n\tstatus");
		expect(await run('git frobnicate')).toBe("git: 'frobnicate' is not a git command. See 'git --help'.");
	});
});

describe('.git', () => {
	it('looks like a shallow clone of the site', async () => {
		const {run} = setup();

		await run('git log');
		expect(await run('ls -A .git | cat')).toBe('HEAD\nconfig\ndescription\nhooks\nindex\ninfo\nlogs\nobjects\npacked-refs\nrefs\nshallow');
		expect(await run('cat .git/HEAD .git/shallow .git/refs/heads/master .git/refs/remotes/origin/HEAD')).toBe(`ref: refs/heads/master\n${SHA}\n${SHA}\nref: refs/remotes/origin/master`);
		expect(await run('cat .git/packed-refs')).toBe(`# pack-refs with: peeled fully-peeled sorted \n${SHA} refs/remotes/origin/master`);
		expect(await run('cat .git/config')).toBe([
			'[core]', '\trepositoryformatversion = 0', '\tfilemode = true', '\tbare = false', '\tlogallrefupdates = true',
			'[remote "origin"]', '\turl = https://github.com/RobinJ1995/robinj.be', '\tfetch = +refs/heads/master:refs/remotes/origin/master',
			'[branch "master"]', '\tremote = origin', '\tmerge = refs/heads/master',
		].join('\n'));
		expect(await run('cat .git/logs/HEAD')).toMatch(new RegExp(`^0{40} ${SHA} Robin Jacobs <robin@robinj\\.be> \\d+ [-+]\\d{4}\\tclone: from https://github\\.com/RobinJ1995/robinj\\.be$`));
		const pack = `pack-${[...SHA].reverse().join('')}`;
		expect(await run('ls .git/objects/pack | cat')).toBe(`${pack}.idx\n${pack}.pack\n${pack}.rev`);
		expect(await run('ls -l .git/objects/pack | cut -c1-10')).toBe('total 12\n-r--r--r--\n-r--r--r--\n-r--r--r--');
		expect(await run('ls .git/hooks | head -2; head -4 .git/hooks/pre-commit.sample')).toBe('applypatch-msg.sample\ncommit-msg.sample\n#!/bin/sh\n#\n# An example hook script to verify what is about to be committed.\n#');
		expect(await run('head -c 4 .git/index; grep -c cv.md .git/index')).toBe('DIRC1');
		expect(await run('ls -ld ~/portfolio/.git | cut -c1-10')).toBe('drwxr-xr-x');
	});
});
