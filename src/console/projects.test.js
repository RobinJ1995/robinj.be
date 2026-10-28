import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, setup, stubRepositories, stubStorage} from './test-helpers';
import {listRepositories, repositories, resetRepositories} from './projects';

const API = 'https://api.github.com/users/RobinJ1995/repos?type=owner&per_page=100';
const DOTFILES = 'https://github.com/RobinJ1995/dotfiles';
const STAMP = '\\w{3} [ \\d]\\d \\d\\d:\\d\\d';

const page = (names, next) => ({
	ok: true,
	headers: new Headers(next ? {Link: `<${next}>; rel="next", <${next}>; rel="last"`} : {}),
	json: async () => names.map(name => ({name, html_url: `https://github.com/RobinJ1995/${name}`})),
});

// A fetch that answers only when told to.
const pending = () => {
	const answers = [];
	vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
		answers.push(resolve);
	})));
	return answers;
};

const coloured = async ({shell, tty}, line) => {
	await shell.execute(line);
	return tty.take({codes: true});
};

beforeEach(() => {
	stubStorage();
	stubRepositories(['dotfiles', 'robinj.be']);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('listing the repositories', () => {
	it('asks GitHub once, without credentials or a referrer, only once something looks inside', async () => {
		const {run} = setup();

		expect(await run('ls ~; cd ~; ls -ld Projects; echo ~/*')).toMatch(/^Projects {2}portfolio\ndrwxr-xr-x\. 2 robin robin 4096 .* Projects\n\/home\/robin\/Projects \/home\/robin\/portfolio$/);
		expect(fetch).not.toHaveBeenCalled();
		expect(await run('ls Projects')).toBe('dotfiles  robinj.be');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith(API, expect.objectContaining({
			credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/vnd.github+json'},
		}));
		expect(await setup().run('ls ~/Projects')).toBe('dotfiles  robinj.be');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('follows the pages GitHub links to', async () => {
		vi.stubGlobal('fetch', vi.fn(async url => (url === API ? page(['dotfiles'], 'https://api.github.com/user/1/repos?page=2') : page(['robinj.be']))));

		expect(await setup().run('ls ~/Projects')).toBe('dotfiles  robinj.be');
		expect(fetch.mock.calls.map(([url]) => url)).toEqual([API, 'https://api.github.com/user/1/repos?page=2']);
	});

	it('leaves the folder empty, without a word, when GitHub cannot be reached or says no', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}));
		expect(await setup().run('ls -A ~/Projects; echo $?')).toBe('0');

		stubRepositories(['dotfiles'], {ok: false});
		expect(await setup().run('ls ~/Projects')).toBe('');

		resetRepositories();
		vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, headers: new Headers(), json: async () => ({message: 'API rate limit exceeded'})})));
		expect(await listRepositories()).toEqual([]);
	});

	it('gives up after 6 seconds', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn((url, {signal}) => new Promise((resolve, reject) => {
			signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		})));

		const listing = listRepositories();
		await vi.advanceTimersByTimeAsync(5999);
		expect(repositories()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(await listing).toEqual([]);
	});

	it('skips what does not look like a repository', async () => {
		resetRepositories();
		vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, headers: new Headers(), json: async () => [{name: 'dotfiles', html_url: DOTFILES}, {name: 'no-url'}, {html_url: 'https://github.com/x'}]})));

		expect(await listRepositories()).toEqual([{name: 'dotfiles', url: DOTFILES}]);
	});

	it('makes a command wait for it, and ^C stops the waiting', async () => {
		const answers = pending();
		const {shell, tty} = setup();

		const running = shell.execute('cat ~/Projects/dotfiles');
		await vi.waitFor(() => expect(answers).toHaveLength(1));
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
		expect(tty.take()).toBe('\n');

		answers[0](page(['dotfiles']));
		await shell.execute('readlink ~/Projects/dotfiles');
		expect(tty.take()).toBe(`${DOTFILES}\n`);
	});

	it('is needed by anything that goes into the folder', async () => {
		const {shell, run} = setup();
		const fresh = async line => {
			resetRepositories();
			const output = await run(line);
			expect(fetch, line).toHaveBeenCalled();
			fetch.mockClear();
			return output;
		};

		expect(await fresh('cd ~/Projects; pwd')).toBe('/home/robin/Projects');
		expect(await fresh('ls')).toBe('dotfiles  robinj.be');
		await run('cd');
		expect(await fresh('echo */r*')).toBe('Projects/robinj.be');
		expect(await fresh('echo P*/dotfiles')).toBe('Projects/dotfiles');
		expect(await fresh('[[ -L Projects/dotfiles ]] && echo link')).toBe('link');
		expect(await fresh('echo > Projects/dotfiles')).toBe('bash: Projects/dotfiles: No such file or directory');
		expect(await fresh('ls -R | tail -1')).toBe('whoami.txt');
		expect(await fresh('tree | tail -1')).toBe('2 directories, 6 files');
		expect(await fresh("grep -R x . 2>&1 | grep '^grep'")).toBe('grep: ./Projects/dotfiles: No such file or directory\ngrep: ./Projects/robinj.be: No such file or directory');
		expect(await fresh('rm -r ~ 2>&1 | grep Projects/')).toBe("rm: cannot remove '/home/robin/Projects/dotfiles': Read-only file system\nrm: cannot remove '/home/robin/Projects/robinj.be': Read-only file system");
		resetRepositories();
		expect(await shell.complete('cat Projects/d')).toEqual({completion: 'otfiles ', options: ['dotfiles']});
		expect(fetch).toHaveBeenCalled();
	});
});

describe('the links', () => {
	it('are listed as links to nowhere', async () => {
		const session = setup();
		const {run} = session;

		expect(await run('ls -l ~/Projects')).toMatch(new RegExp(`^total 0\\nlrwxrwxrwx\\. 1 robin robin 38 ${STAMP} dotfiles -> ${DOTFILES}\\nlrwxrwxrwx\\. 1 robin robin 39 ${STAMP} robinj\\.be -> https://github\\.com/RobinJ1995/robinj\\.be$`));
		expect(await coloured(session, 'ls -l ~/Projects/dotfiles | cat')).toMatch(new RegExp(` /home/robin/Projects/dotfiles -> ${DOTFILES}\n$`));
		expect(await coloured(session, 'ls --color=always ~/Projects/dotfiles')).toBe('\x1b[40;31;01m/home/robin/Projects/dotfiles\x1b[0m\n');
		expect(await coloured(session, 'ls -l --color ~/Projects/dotfiles /bin')).toMatch(/ \x1b\[01;36m\/bin\x1b\[0m -> \x1b\[01;34musr\/bin\x1b\[0m\n.* \x1b\[40;31;01m\/home\/robin\/Projects\/dotfiles\x1b\[0m -> \x1b\[01;37;41mhttps:\/\/github\.com\/RobinJ1995\/dotfiles\x1b\[0m\n$/);
		expect(await run('ls ~/Projects/dotfiles/')).toBe("ls: cannot access '/home/robin/Projects/dotfiles/': No such file or directory");
		expect(await run('tree ~/Projects')).toBe(`/home/robin/Projects\n├── dotfiles -> ${DOTFILES}\n└── robinj.be -> https://github.com/RobinJ1995/robinj.be\n\n0 directories, 2 files`);
		expect(await coloured(session, 'tree -C ~/Projects | head -2')).toBe(`\x1b[01;34m/home/robin/Projects\x1b[0m\n├── \x1b[40;31;01mdotfiles\x1b[0m -> \x1b[01;37;41m${DOTFILES}\x1b[0m\n`);
	});

	it('lead nowhere that can be read, entered or written', async () => {
		const {run} = setup();

		await run('cd ~/Projects');
		expect(await run('cat dotfiles')).toBe('cat: dotfiles: No such file or directory');
		expect(await run('less dotfiles')).toBe('dotfiles: No such file or directory');
		expect(await run('head dotfiles')).toBe("head: cannot open 'dotfiles' for reading: No such file or directory");
		expect(await run('cd dotfiles')).toBe('bash: cd: dotfiles: No such file or directory');
		expect(await run('[ -e dotfiles ] || echo missing; [ -L dotfiles ] && test -h dotfiles && echo link')).toBe('missing\nlink');
		expect(await run('./dotfiles; echo $?')).toBe('bash: ./dotfiles: No such file or directory\n127');
		expect(await run('touch dotfiles')).toBe("touch: cannot touch 'dotfiles': No such file or directory");
		expect(await run('cat < dotfiles')).toBe('bash: dotfiles: No such file or directory');
		expect(await run('cp dotfiles /tmp')).toBe("cp: cannot stat 'dotfiles': No such file or directory");
		expect(await run('git clone https://github.com/RobinJ1995/dotfiles')).toBe("fatal: destination path 'dotfiles' already exists and is not an empty directory.");
		expect(await run('echo */')).toBe('*/');
	});

	it('say where they lead to readlink and stat', async () => {
		const {run} = setup();

		await run('cd ~/Projects');
		expect(await run('readlink dotfiles')).toBe(DOTFILES);
		expect(await run('readlink -f dotfiles; echo $?')).toBe('1');
		expect(await run('readlink -m dotfiles')).toBe('/home/robin/Projects/https:/github.com/RobinJ1995/dotfiles');
		expect(await run('stat dotfiles')).toMatch(new RegExp([
			`^  File: dotfiles -> ${DOTFILES}`,
			'  Size: 38        \\tBlocks: 0          IO Block: 4096   symbolic link',
			'Device: 259,3\\tInode: \\d+ +Links: 1',
			'Access: \\(0777/lrwxrwxrwx\\)  Uid: \\( 1000/   robin\\)   Gid: \\( 1000/   robin\\)',
			'Context: unconfined_u:object_r:user_home_t:s0',
		].join('\\n')));
		expect(await run('stat -L dotfiles')).toBe("stat: cannot statx 'dotfiles': No such file or directory");
	});

	it('cannot be changed, moved or removed', async () => {
		const {run} = setup();

		await run('cd ~/Projects');
		expect(await run('rm dotfiles')).toBe("rm: cannot remove 'dotfiles': Read-only file system");
		expect(await run('mv dotfiles /tmp')).toBe("mv: cannot move 'dotfiles' to '/tmp/dotfiles': Read-only file system");
		expect(await run('cp -r dotfiles /tmp')).toBe("cp: cannot create symbolic link '/tmp/dotfiles': Read-only file system");
		expect(await run('ln -s dotfiles /tmp')).toBe("ln: failed to create symbolic link '/tmp/dotfiles': Read-only file system");
		expect(await run('ln -s x dotfiles')).toBe("ln: failed to create symbolic link 'dotfiles': File exists");
		expect(await run('chmod 644 dotfiles')).toBe("chmod: cannot operate on dangling symlink 'dotfiles'");
		expect(await run('chown robin dotfiles')).toBe("chown: cannot dereference 'dotfiles': No such file or directory");
		expect(await run('chown -h robin dotfiles')).toBe("chown: changing ownership of 'dotfiles': Read-only file system");
		expect(await run('mkdir -p dotfiles')).toBe("mkdir: cannot create directory 'dotfiles': File exists");
		expect(await run('rmdir dotfiles')).toBe("rmdir: failed to remove 'dotfiles': Not a directory");
	});

	it('are searched with grep -R, and skipped with -r', async () => {
		const {run} = setup();

		await run('cd ~/Projects');
		expect(await run('grep -r x; echo $?')).toBe('1');
		expect(await run('grep -R x')).toBe('grep: dotfiles: No such file or directory\ngrep: robinj.be: No such file or directory');
		expect(await run('grep x dotfiles')).toBe('grep: dotfiles: No such file or directory');
	});
});

describe('opening a repository', () => {
	it('opens it in a new browser tab, saying nothing', async () => {
		const system = fakeSystem();
		const {shell, run} = setup({system});

		expect(await run('xdg-open ~/Projects/dotfiles')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(system.openUrl).toHaveBeenCalledWith(DOTFILES);
		await run('cd ~/Projects; for app in open editor nano vi vim emacs code; do $app robinj.be; done');
		expect(system.openUrl).toHaveBeenCalledTimes(8);
		expect(system.openUrl).toHaveBeenLastCalledWith('https://github.com/RobinJ1995/robinj.be');
	});

	it('fails as xdg-open does when the browser blocks the tab', async () => {
		const system = fakeSystem({openUrl: vi.fn(() => false)});
		const {shell, run} = setup({system});

		expect(await run('xdg-open ~/Projects/dotfiles')).toBe(`xdg-open: no method available for opening '${DOTFILES}'`);
		expect(shell.state.status).toBe(3);
		expect(await run('vim ~/Projects/robinj.be; echo $?')).toBe("xdg-open: no method available for opening 'https://github.com/RobinJ1995/robinj.be'\n3");
	});
});
