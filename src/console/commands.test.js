import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, setup, stubStorage} from './test-helpers';

const STAMP = '\\w{3} [ \\d]\\d \\d\\d:\\d\\d';

// Runs a command line that sleeps, letting fake time pass until it's done.
const timed = async ({shell, tty}, line) => {
	const running = shell.execute(line);
	await vi.runAllTimersAsync();
	await running;
	return tty.take().replace(/\n$/, '');
};

const coloured = async ({shell, tty}, line) => {
	await shell.execute(line);
	return tty.take({codes: true});
};

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('ls', () => {
	it('lists in long format, with sizes, owners and a total', async () => {
		const {run} = setup();

		expect(await run('ls -l')).toMatch(new RegExp(`^total 16\\n-rw-r--r--\\. 1 robin robin +181 ${STAMP} contact\\.yml\\n(-rw-r--r--\\. 1 robin robin +\\d+ ${STAMP} \\S+\\n){2}-rw-r--r--\\. 1 robin robin +\\d+ ${STAMP} whoami\\.txt$`));
		expect(await run('ls -la ~')).toMatch(new RegExp([
			'^total 24',
			`drwx------\\. 4 robin robin 4096 ${STAMP} \\.`,
			`drwxr-xr-x\\. 3 root  root  4096 ${STAMP} \\.\\.`,
			`-rw-------\\. 1 robin robin +\\d+ ${STAMP} \\.bash_history`,
			`drwx------\\. 2 robin robin 4096 ${STAMP} \\.kube`,
			`-rw-r--r--\\. 1 robin robin +\\d+ ${STAMP} \\.profile`,
			`drwxr-xr-x\\. 2 robin robin 4096 ${STAMP} portfolio$`,
		].join('\\n')));
		expect(await run('ls -ld /tmp /dev/null')).toMatch(new RegExp(`^crw-rw-rw-\\. 1 root root 1, 3 ${STAMP} /dev/null\\ndrwxrwxrwt\\. 2 root root 4096 ${STAMP} /tmp$`));
		expect(await run('ls -lh /usr/bin/ls /etc/passwd')).toMatch(new RegExp(`^-rw-r--r--\\. 1 root root 128 ${STAMP} /etc/passwd\\n-rwxr-xr-x\\. 1 root root  38 ${STAMP} /usr/bin/ls$`));
		expect(await run('ls -l /bin/ | head -1')).toBe('total 228');
		expect(await run('ls -lh /usr | head -1')).toBe('total 12K');
		expect(await run('ls -l /tmp')).toBe('total 0');
	});

	it('sorts by name, size or in reverse, and lists directories themselves with -d', async () => {
		const {run} = setup();

		expect(await run('ls -r')).toBe('whoami.txt  side-quests.yml  cv.md  contact.yml');
		expect(await run('ls -S -1')).toBe('cv.md\nside-quests.yml\nwhoami.txt\ncontact.yml');
		expect(await run('ls -Sr | head -1')).toBe('contact.yml');
		expect(await run('ls -d /etc /tmp')).toBe('/etc  /tmp');
	});

	it('marks types with -F, and colours them', async () => {
		const session = setup();

		expect(await session.run('ls -F /')).toBe('bin@  boot/  dev/  etc/  home/  root/  tmp/  usr/  var/');
		expect(await session.run('ls --classify /usr/bin | head -2')).toBe('bash*\ncat*');
		expect(await coloured(session, 'ls --color=always /')).toBe('\x1b[01;36mbin\x1b[0m  \x1b[01;34mboot\x1b[0m  \x1b[01;34mdev\x1b[0m  \x1b[01;34metc\x1b[0m  \x1b[01;34mhome\x1b[0m  \x1b[01;34mroot\x1b[0m  \x1b[30;42mtmp\x1b[0m  \x1b[01;34musr\x1b[0m  \x1b[01;34mvar\x1b[0m\n');
		expect(await coloured(session, 'ls --color /dev /usr/bin | head -3')).toBe('/dev:\n\x1b[40;33;01mnull\x1b[0m\n\n');
		expect(await coloured(session, 'ls --color=always /usr/bin | head -1')).toBe('\x1b[01;32mbash\x1b[0m\n');
		expect(await coloured(session, 'ls --color=never /dev')).toBe('null\n');
		expect(await coloured(session, 'ls --color=auto /dev | cat')).toBe('null\n');
	});

	it('lays names out in columns on a terminal, or with -C', async () => {
		const {run} = setup({columns: 30});

		expect(await run('ls /etc')).toBe('hostname    robinj-release\nos-release  shadow\npasswd');
		expect(await run('ls -C /etc | cat')).toBe('hostname    robinj-release\nos-release  shadow\npasswd');
		expect(await run('ls -1 /etc')).toBe('hostname\nos-release\npasswd\nrobinj-release\nshadow');
	});

	it('goes into subdirectories with -R, with a heading for each', async () => {
		const {run} = setup();

		expect(await run('ls -R ~')).toBe('/home/robin:\nportfolio\n\n/home/robin/portfolio:\ncontact.yml  cv.md  side-quests.yml  whoami.txt');
		expect(await run('ls cv.md /etc')).toBe('cv.md\n\n/etc:\nhostname  os-release  passwd  robinj-release  shadow');
		expect(await run('ls /etc /tmp')).toBe('/etc:\nhostname  os-release  passwd  robinj-release  shadow\n\n/tmp:');
	});

	it('says what it could not list', async () => {
		const {shell, run} = setup();

		expect(await run('ls /nope /root')).toBe("ls: cannot access '/nope': No such file or directory\nls: cannot open directory '/root': Permission denied");
		expect(shell.state.status).toBe(2);
		expect(await run('ls --bogus')).toBe("ls: unrecognized option '--bogus'\nTry 'ls --help' for more information.");
		expect(shell.state.status).toBe(2);
	});
});

describe('tree', () => {
	it('draws directories as a tree, counting what it saw', async () => {
		const {run} = setup();

		expect(await run('tree ~')).toBe('/home/robin\n└── portfolio\n    ├── contact.yml\n    ├── cv.md\n    ├── side-quests.yml\n    └── whoami.txt\n\n1 directory, 4 files');
		expect(await run('tree -a ~')).toBe('/home/robin\n├── .bash_history\n├── .kube\n│   └── config\n├── .profile\n└── portfolio\n    ├── contact.yml\n    ├── cv.md\n    ├── side-quests.yml\n    └── whoami.txt\n\n2 directories, 7 files');
		expect(await run('tree -L 1 /usr')).toBe('/usr\n├── bin\n├── lib\n└── share\n\n3 directories, 0 files');
	});

	it('shows only directories with -d, following links and marking the ones it cannot open', async () => {
		const {run} = setup();

		expect(await run('tree -d /')).toBe([
			'/', '├── bin -> usr/bin', '├── boot', '├── dev', '├── etc', '├── home', '│   └── robin', '│       └── portfolio',
			'├── root  [error opening dir]', '├── tmp', '├── usr', '│   ├── bin', '│   ├── lib', '│   └── share', '└── var', '    └── log',
			'', '15 directories',
		].join('\n'));
	});

	it('colours on a terminal or with -C, unless told not to', async () => {
		const session = setup();

		expect(await coloured(session, 'tree -L 1 ~')).toBe('\x1b[01;34m/home/robin\x1b[0m\n└── \x1b[01;34mportfolio\x1b[0m\n\n1 directory, 0 files\n');
		expect(await coloured(session, 'tree -n -L 1 ~')).toBe('/home/robin\n└── portfolio\n\n1 directory, 0 files\n');
		expect(await coloured(session, 'tree -C -d -L 1 / | head -2')).toBe('\x1b[01;34m/\x1b[0m\n├── \x1b[01;36mbin\x1b[0m -> usr/bin\n');
	});

	it('reports what is not a directory, and bad options', async () => {
		const {shell, run} = setup();

		expect(await run('tree /nope cv.md')).toBe('/nope  [error opening dir]\ncv.md  [error opening dir]\n\n0 directories, 0 files');
		expect(shell.state.status).toBe(2);
		expect(await run('tree -x')).toBe("tree: invalid option -- 'x'\nTry 'tree --help' for more information.");
	});
});

describe('cat', () => {
	it('numbers lines across files with -n', async () => {
		const {run} = setup();

		expect(await run('cat -n contact.yml contact.yml | tail -2')).toBe('    13\t  - linkedin: https://linkedin.com/in/robin-jacobs\n    14\t  - github: https://github.com/RobinJ1995');
		expect(await run('echo one | cat --number - /etc/hostname')).toBe('     1\tone\n     2\trobinj.be');
	});

	it('keeps going after a file it cannot read', async () => {
		const {shell, run} = setup();

		expect(await run('cat nope /etc /etc/hostname /dev/null')).toBe('cat: nope: No such file or directory\ncat: /etc: Is a directory\nrobinj.be');
		expect(shell.state.status).toBe(1);
		expect(await run('cat --bogus')).toBe("cat: unrecognized option '--bogus'\nTry 'cat --help' for more information.");
	});

	it('shows who robin is', async () => {
		const {run} = setup();

		expect(await run('cat whoami.txt | head -4')).toBe('robin@robinj.be:~$ whoami\nRobin Jacobs\nrobin@robinj.be:~$ cat ~/.profile\n# ─────────────────────────────');
		expect(await run('tail -3 whoami.txt')).toMatch(/^-rw-r--r-- {2}robin {2}e-mail {5}robin@robinj\.be\n-rw-r--r-- {2}robin {2}linkedin {3}linkedin\.com\/in\/robin-jacobs\n-rw-r--r-- {2}robin {2}github {5}github\.com\/RobinJ1995$/);
	});
});

describe('head and tail', () => {
	it('take lines or bytes from either end', async () => {
		const {run} = setup();

		expect(await run('head -n 2 contact.yml')).toBe('# Hi!\nname: Robin Jacobs');
		expect(await run('head -2 contact.yml')).toBe('# Hi!\nname: Robin Jacobs');
		expect(await run('head --lines=-5 contact.yml')).toBe('# Hi!\nname: Robin Jacobs');
		expect(await run('head -c 5 contact.yml')).toBe('# Hi!');
		expect(await run('head --bytes=-170 contact.yml')).toBe('# Hi!\nname:');
		expect(await run('tail -n 1 contact.yml')).toBe('  - github: https://github.com/RobinJ1995');
		expect(await run('tail -n +7 contact.yml')).toBe('  - github: https://github.com/RobinJ1995');
		expect(await run('tail -c 6 contact.yml')).toBe('J1995');
		expect(await run('seq 20 | tail -c +46')).toBe('19\n20');
	});

	it('label each of several files, unless quiet; or the only one, when verbose', async () => {
		const {run} = setup();

		expect(await run('head -n1 contact.yml /etc/hostname')).toBe('==> contact.yml <==\n# Hi!\n\n==> /etc/hostname <==\nrobinj.be');
		expect(await run('head -q -n1 contact.yml /etc/hostname')).toBe('# Hi!\nrobinj.be');
		expect(await run('echo hi | tail -v')).toBe('==> standard input <==\nhi');
	});

	it('complain about counts and files they cannot use', async () => {
		const {shell, run} = setup();

		expect(await run('head -n x contact.yml')).toBe("head: invalid number of lines: 'x'");
		expect(await run('tail -c x')).toBe("tail: invalid number of bytes: 'x'");
		expect(await run('head /etc nope')).toBe("==> /etc <==\nhead: error reading '/etc': Is a directory\n\n==> nope <==\nhead: cannot open 'nope' for reading: No such file or directory");
		expect(shell.state.status).toBe(1);
		expect(await run('head -f')).toBe("head: invalid option -- 'f'\nTry 'head --help' for more information.");
	});

	it('head stops reading the terminal as soon as it has enough, or at its end', async () => {
		const {run} = setup({input: ['one\n', 'two\n', 'three\n', null, 'only\n', null]});

		expect(await run('head -n 1; cat')).toBe('one\ntwo\nthree');
		expect(await run('head -n 5')).toBe('only');
	});

	it('tail -f waits for more until interrupted', async () => {
		const {shell, tty} = setup();

		const running = shell.execute('tail -f /etc/hostname');
		await vi.waitFor(() => expect(tty.take()).toBe('robinj.be\n'));
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
	});
});

describe('grep', () => {
	it('finds lines, numbered, counted or inverted', async () => {
		const {shell, run} = setup();

		expect(await run('grep -n email contact.yml')).toBe('5:  - email: robin@robinj.be');
		expect(await run('grep -c "" contact.yml')).toBe('7');
		expect(await run('grep -vc http contact.yml')).toBe('5');
		expect(await run('grep -i DUBLIN contact.yml')).toBe('location: Dublin, Ireland');
		expect(await run('grep -e Hi --ignore-case contact.yml')).toBe('# Hi!');
		expect(await run('grep nowhere contact.yml')).toBe('');
		expect(shell.state.status).toBe(1);
	});

	it('speaks basic, extended and fixed-string patterns', async () => {
		const {run} = setup();

		expect(await run('grep -c "linkedin\\|github" contact.yml')).toBe('2');
		expect(await run('grep -Ec "linkedin|github" contact.yml')).toBe('2');
		expect(await run('grep -c "Hi|name" contact.yml')).toBe('0');
		expect(await run('grep "^na\\(me\\)\\{1\\}:" contact.yml')).toBe('name: Robin Jacobs');
		expect(await run('grep -F . -c contact.yml')).toBe('3');
		expect(await run('grep -c "[[:digit:]]" contact.yml')).toBe('1');
		expect(await run('grep -c "[[:nonsense:]]" contact.yml')).toBe('0');
		expect(await run('grep -w Hi contact.yml')).toBe('# Hi!');
		expect(await run('grep -w H contact.yml')).toBe('');
		expect(await run('grep -x channels: contact.yml')).toBe('channels:');
	});

	it('names files when there are several, or when asked', async () => {
		const {run} = setup();

		expect(await run('grep -c Robin contact.yml whoami.txt')).toBe('contact.yml:2\nwhoami.txt:3');
		expect(await run('grep -h Hi contact.yml whoami.txt')).toBe('# Hi!');
		expect(await run('grep -H Hi contact.yml')).toBe('contact.yml:# Hi!');
		expect(await run('grep -l Robin *')).toBe('contact.yml\nside-quests.yml\nwhoami.txt');
		expect(await run('echo x | grep -H x')).toBe('(standard input):x');
	});

	it('searches directories recursively', async () => {
		const {shell, run} = setup();

		expect(await run('grep -r "name: Robin"')).toBe('contact.yml:name: Robin Jacobs');
		expect(await run('grep -rh "name: Robin" .')).toBe('name: Robin Jacobs');
		expect(await run('grep -R --line-number "^location" ~')).toBe('/home/robin/portfolio/contact.yml:3:location: Dublin, Ireland');
		expect(await run('grep -r x /root')).toBe('grep: /root: Permission denied');
		expect(shell.state.status).toBe(2);
	});

	it('reports files it cannot read, unless silenced, and only fails when nothing matched', async () => {
		const {shell, run} = setup();

		expect(await run('grep x /etc nope /etc/shadow')).toBe('grep: /etc: Is a directory\ngrep: nope: No such file or directory\ngrep: /etc/shadow: Permission denied');
		expect(shell.state.status).toBe(2);
		expect(await run('grep -s x /etc nope /etc/shadow')).toBe('');
		expect(shell.state.status).toBe(2);
		expect(await run('grep -q Robin nope contact.yml')).toBe('grep: nope: No such file or directory');
		expect(shell.state.status).toBe(0);
		expect(await run('grep -q nowhere contact.yml')).toBe('');
		expect(shell.state.status).toBe(1);
	});

	it('colours matches, file names and line numbers', async () => {
		const session = setup();
		const match = text => `\x1b[01;31m\x1b[K${text}\x1b[m\x1b[K`;
		const name = text => `\x1b[35m\x1b[K${text}\x1b[m\x1b[K\x1b[36m\x1b[K:\x1b[m\x1b[K`;
		const number = text => `\x1b[32m\x1b[K${text}\x1b[m\x1b[K\x1b[36m\x1b[K:\x1b[m\x1b[K`;

		expect(await coloured(session, 'grep Dublin contact.yml')).toBe(`location: ${match('Dublin')}, Ireland\n`);
		expect(await coloured(session, 'grep --colour=always -Hn "e*" /etc/hostname')).toBe(`${name('/etc/hostname')}${number(1)}robinj.b${match('e')}\n`);
		expect(await coloured(session, 'grep -l --color=always Hi contact.yml')).toBe('\x1b[35m\x1b[Kcontact.yml\x1b[m\x1b[K\n');
		expect(await coloured(session, 'grep -v Dublin contact.yml | head -1')).toBe('# Hi!\n');
	});

	it('needs a pattern that makes sense', async () => {
		const {shell, run} = setup();

		expect(await run('grep')).toBe("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.");
		expect(shell.state.status).toBe(2);
		expect(await run('grep -E "("')).toBe('grep: Invalid regular expression');
		expect(shell.state.status).toBe(2);
		expect(await run('grep -y x')).toBe("grep: invalid option -- 'y'\nTry 'grep --help' for more information.");
		expect(shell.state.status).toBe(2);
	});
});

describe('wc', () => {
	it('counts lines, words and bytes, with a total for several files', async () => {
		const {run} = setup();

		expect(await run('wc contact.yml')).toBe('  7  18 181 contact.yml');
		expect(await run('wc -l -w contact.yml')).toBe('  7  18 contact.yml');
		expect(await run('wc --lines contact.yml')).toBe('7 contact.yml');
		expect(await run('wc contact.yml /etc/hostname')).toBe('  7  18 181 contact.yml\n  1   1  10 /etc/hostname\n  8  19 191 total');
		expect(await run('echo hi | wc')).toBe('      1       1       3');
		expect(await run('wc -l < contact.yml')).toBe('7');
	});

	it('tells characters from bytes', async () => {
		const {run} = setup();

		expect(await run('printf → | wc -c')).toBe('3');
		expect(await run('printf → | wc --chars')).toBe('1');
	});

	it('reports files it cannot read', async () => {
		const {shell, run} = setup();

		expect(await run('wc nope /etc/hostname')).toBe('wc: nope: No such file or directory\n 1  1 10 /etc/hostname');
		expect(shell.state.status).toBe(1);
		expect(await run('wc --bogus')).toBe("wc: unrecognized option '--bogus'\nTry 'wc --help' for more information.");
	});
});

describe('cp and mv', () => {
	it('check everything right up to the write', async () => {
		const {shell, run} = setup();

		expect(await run('cp')).toBe("cp: missing file operand\nTry 'cp --help' for more information.");
		expect(await run('cp a')).toBe("cp: missing destination file operand after 'a'\nTry 'cp --help' for more information.");
		expect(await run('cp cv.md contact.yml nope')).toBe("cp: target 'nope' is not a directory");
		expect(await run('cp nope /tmp')).toBe("cp: cannot stat 'nope': No such file or directory");
		expect(await run('cp ~/portfolio /tmp')).toBe("cp: -r not specified; omitting directory '/home/robin/portfolio'");
		expect(await run('cp -r ~/portfolio /tmp')).toBe("cp: cannot create directory '/tmp/portfolio': Read-only file system");
		expect(await run('cp cv.md ./cv.md')).toBe("cp: 'cv.md' and './cv.md' are the same file");
		expect(await run('cp cv.md /root/')).toBe("cp: cannot create regular file '/root/cv.md': Permission denied");
		expect(await run('cp cv.md contact.yml /tmp')).toBe("cp: cannot create regular file '/tmp/cv.md': Read-only file system\ncp: cannot create regular file '/tmp/contact.yml': Read-only file system");
		expect(shell.state.status).toBe(1);
	});

	it('mv moves directories too, as far as it gets', async () => {
		const {shell, run} = setup();

		expect(await run('mv ~/portfolio /tmp')).toBe("mv: cannot move '/home/robin/portfolio' to '/tmp/portfolio': Read-only file system");
		expect(await run('mv cv.md /root')).toBe("mv: cannot move 'cv.md' to '/root/cv.md': Permission denied");
		expect(await run('mv -z')).toBe("mv: invalid option -- 'z'\nTry 'mv --help' for more information.");
		expect(shell.state.status).toBe(1);
	});
});

describe('rm', () => {
	it('needs operands, unless forced', async () => {
		const {shell, run} = setup();

		expect(await run('rm')).toBe("rm: missing operand\nTry 'rm --help' for more information.");
		expect(shell.state.status).toBe(1);
		expect(await run('rm -f')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(await run('rm -f nope')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(await run('rm --bogus')).toBe("rm: unrecognized option '--bogus'\nTry 'rm --help' for more information.");
	});

	it('refuses . and .., and directories without -r or -d', async () => {
		const {run} = setup();

		expect(await run('rm . ../portfolio/..')).toBe("rm: refusing to remove '.' or '..' directory: skipping '.'\nrm: refusing to remove '.' or '..' directory: skipping '../portfolio/..'");
		expect(await run('rm ~/portfolio')).toBe("rm: cannot remove '/home/robin/portfolio': Is a directory");
		expect(await run('rm -d /tmp')).toBe("rm: cannot remove '/tmp': Read-only file system");
	});

	it('works through a directory with -r, failing at every file', async () => {
		const {shell, run} = setup();

		expect(await run('cd ~; rm -r portfolio')).toBe([
			"rm: cannot remove 'portfolio/contact.yml': Read-only file system",
			"rm: cannot remove 'portfolio/cv.md': Read-only file system",
			"rm: cannot remove 'portfolio/side-quests.yml': Read-only file system",
			"rm: cannot remove 'portfolio/whoami.txt': Read-only file system",
			"rm: cannot remove 'portfolio': Read-only file system",
		].join('\n'));
		expect(await run('rm -r /root')).toBe("rm: cannot remove '/root': Permission denied");
		expect(await run('rm /dev/null /root/x')).toBe("rm: cannot remove '/dev/null': Permission denied\nrm: cannot remove '/root/x': Permission denied");
		expect(shell.state.status).toBe(1);
	});
});

describe('mkdir, touch and rmdir', () => {
	it('mkdir accepts what exists with -p, and fails at the rest', async () => {
		const {shell, run} = setup();

		expect(await run('mkdir')).toBe("mkdir: missing operand\nTry 'mkdir --help' for more information.");
		expect(await run('mkdir /etc')).toBe("mkdir: cannot create directory '/etc': File exists");
		expect(await run('mkdir -p /etc')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(await run('mkdir -p /root/x new')).toBe("mkdir: cannot create directory '/root/x': Permission denied\nmkdir: cannot create directory 'new': Read-only file system");
		expect(shell.state.status).toBe(1);
	});

	it('touch only gets to touch devices', async () => {
		const {shell, run} = setup();

		expect(await run('touch /dev/null')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(await run('touch /nope/x cv.md')).toBe("touch: cannot touch '/nope/x': No such file or directory\ntouch: cannot touch 'cv.md': Read-only file system");
		expect(await run('touch -z')).toBe("touch: invalid option -- 'z'\nTry 'touch --help' for more information.");
	});

	it('rmdir says why each directory stays', async () => {
		const {shell, run} = setup();

		expect(await run('rmdir')).toBe("rmdir: missing operand\nTry 'rmdir --help' for more information.");
		expect(await run('rmdir --ignore-fail-on-non-empty cv.md nope /tmp')).toBe("rmdir: failed to remove 'cv.md': Not a directory\nrmdir: failed to remove 'nope': No such file or directory\nrmdir: failed to remove '/tmp': Read-only file system");
		expect(shell.state.status).toBe(1);
	});
});

describe('chmod and chown', () => {
	it('chmod checks the mode before refusing', async () => {
		const {shell, run} = setup();

		expect(await run('chmod')).toBe("chmod: missing operand\nTry 'chmod --help' for more information.");
		expect(await run('chmod 777')).toBe("chmod: missing operand after '777'\nTry 'chmod --help' for more information.");
		expect(await run('chmod xyz cv.md')).toBe("chmod: invalid mode: 'xyz'\nTry 'chmod --help' for more information.");
		expect(await run('chmod u+x,go-w cv.md nope')).toBe("chmod: changing permissions of 'cv.md': Read-only file system\nchmod: cannot access 'nope': No such file or directory");
		expect(await run('chmod -x cv.md')).toBe("chmod: changing permissions of 'cv.md': Read-only file system");
		expect(await run('chmod -v 666 /dev/null')).toBe("chmod: changing permissions of '/dev/null': Operation not permitted");
		expect(await run('chmod --bogus')).toBe("chmod: unrecognized option '--bogus'\nTry 'chmod --help' for more information.");
		expect(shell.state.status).toBe(1);
	});

	it('chown knows the users and groups there are', async () => {
		const {run} = setup();

		expect(await run('chown nobody cv.md')).toBe("chown: invalid user: 'nobody'\nTry 'chown --help' for more information.");
		expect(await run('chown robin:nobody cv.md')).toBe("chown: invalid group: 'robin:nobody'\nTry 'chown --help' for more information.");
		expect(await run('chown -R root.root cv.md')).toBe("chown: changing ownership of 'cv.md': Read-only file system");
		expect(await run('chown :bin cv.md')).toBe("chown: changing ownership of 'cv.md': Read-only file system");
		expect(await run('chown robin')).toBe("chown: missing operand after 'robin'\nTry 'chown --help' for more information.");
	});
});

describe('sleep', () => {
	it('adds up its intervals, in any unit', async () => {
		vi.useFakeTimers();
		const {shell} = setup();
		let done = false;

		shell.execute('sleep 1m 1.5').then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(61_499);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toBe(true);
		expect(shell.state.status).toBe(0);
	});

	it('sleeps forever on inf, until interrupted', async () => {
		vi.useFakeTimers();
		const {shell} = setup();

		const running = shell.execute('sleep infinity');
		await vi.advanceTimersByTimeAsync(30 * 86_400_000);
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
	});

	it('needs a valid interval', async () => {
		const {run} = setup();

		expect(await run('sleep')).toBe("sleep: missing operand\nTry 'sleep --help' for more information.");
		expect(await run('sleep 1x')).toBe("sleep: invalid time interval '1x'\nTry 'sleep --help' for more information.");
	});
});

describe('date', () => {
	it('formats any moment, in every way strftime knows', async () => {
		const {run} = setup();

		expect(await run('date -u -d @0')).toBe('Thu Jan  1 00:00:00 UTC 1970');
		expect(await run('date -u -d @1704160800 "+%a %A %b %h %B|%C %y %Y|%d %e %j %m|%D %F %x"')).toBe('Tue Tuesday Jan Jan January|20 24 2024|02  2 002 01|01/02/24 2024-01-02 01/02/24');
		expect(await run('date -u -d @1704160800 "+%H %I %k %l %M %S %p %P|%R %T %X %r|%s %N %z %Z"')).toBe('02 02  2  2 00 00 AM am|02:00 02:00:00 02:00:00 02:00:00 AM|1704160800 000000000 +0000 UTC');
		expect(await run('date -u -d @1704160800 "+%c|%u %w|%-d %_m %^a %-e|%%|%Q%+|%t|%n"')).toBe('Tue Jan  2 02:00:00 2024|2 2|2  1 TUE 2|%|%Q|\t|\n');
		expect(await run('date -u -d @1704646800 "+%u %w %I %l %p"')).toBe('7 0 05  5 PM');
		expect(await run('date -u -d @1704585600 +%I')).toBe('12');
	});

	it('knows a few standard formats', async () => {
		const {run} = setup();

		expect(await run('date -R -u -d @0')).toBe('Thu, 01 Jan 1970 00:00:00 +0000');
		expect(await run('date -I -d @0 -u')).toBe('1970-01-01');
		expect(await run('date --iso-8601=date -d @0 -u')).toBe('1970-01-01');
		expect(await run('date --iso-8601=seconds --universal -d @0')).toBe('1970-01-01T00:00:00+0000');
	});

	it('reads dates, relative ones included', async () => {
		vi.useFakeTimers({now: new Date('2026-10-28T12:00:00Z'), toFake: ['Date']});
		const {run} = setup();

		expect(await run('date -u +%F')).toBe('2026-10-28');
		expect(await run('date -u -d yesterday +%F')).toBe('2026-10-27');
		expect(await run('date -u --date=Tomorrow +%F')).toBe('2026-10-29');
		expect(await run('date -u -d " today " +%F')).toBe('2026-10-28');
		expect(await run('date -u -d 2026-01-02T03:04:05Z')).toBe('Fri Jan  2 03:04:05 UTC 2026');
		expect(await run('date')).toMatch(/^(Wed|Thu) Oct 2[89] \d\d:\d\d:\d\d \S+ 2026$/);
	});

	it('refuses to set the clock, and anything it cannot read', async () => {
		const {shell, run} = setup();

		expect(await run('date -s @0 -u')).toBe('date: cannot set date: Operation not permitted\nThu Jan  1 00:00:00 UTC 1970');
		expect(shell.state.status).toBe(1);
		expect(await run('date -d garbage')).toBe("date: invalid date 'garbage'");
		expect(await run('date extra')).toBe("date: invalid date 'extra'");
		expect(await run('date --bogus')).toBe("date: unrecognized option '--bogus'\nTry 'date --help' for more information.");
	});
});

describe('uname and lsb_release', () => {
	it('uname prints the fields asked for, in order', async () => {
		const {shell, run} = setup();

		expect(await run('uname')).toBe('Linux');
		expect(await run('uname -r')).toBe('1.0.0-rj1.riscv64');
		expect(await run('uname -mn')).toBe('robinj.be riscv64');
		expect(await run('uname -p -i -o')).toBe('unknown unknown GNU/Linux');
		expect(await run('uname --kernel-version')).toBe('#1 SMP PREEMPT_DYNAMIC Fri Mar 13 13:37:00 UTC 2026');
		expect(await run('uname -z')).toBe("uname: invalid option -- 'z'\nTry 'uname --help' for more information.");
		expect(shell.state.status).toBe(1);
	});

	it('lsb_release prints fields, or just their values with -s', async () => {
		const {run} = setup();

		expect(await run('lsb_release')).toBe('LSB Version:\tn/a');
		expect(await run('lsb_release -ir')).toBe('Distributor ID:\tRobinOS\nRelease:\t1.0.0');
		expect(await run('lsb_release -sc')).toBe('HiddenBits');
		expect(await run('lsb_release --short --description')).toBe('RobinOS 1.0.0 (Web Edition)');
		expect(await run('lsb_release -x')).toBe("lsb_release: invalid option -- 'x'\nTry 'lsb_release --help' for more information.");
	});
});

describe('env', () => {
	it('prints the environment, with extra variables or none at all', async () => {
		const {run} = setup();

		expect(await run('env | grep ^USER=')).toBe('USER=robin');
		expect(await run('env | tail -1')).toBe('_=/usr/bin/env');
		expect(await run('env FOO=bar | grep FOO')).toBe('FOO=bar');
		expect(await run('env -i FOO=bar')).toBe('FOO=bar');
		expect(await run('env --ignore-environment')).toBe('');
		expect(await run('export SHOWN=yes; env | grep SHOWN')).toBe('SHOWN=yes');
	});

	it('runs a command it can find', async () => {
		const {shell, run} = setup();

		expect(await run('env echo hi')).toBe('hi');
		expect(await run('env - ls /tmp')).toBe('');
		expect(await run('env nope')).toBe("env: 'nope': No such file or directory");
		expect(shell.state.status).toBe(127);
	});
});

describe('seq', () => {
	it('counts up or down, by any step', async () => {
		const {run} = setup();

		expect(await run('seq 3')).toBe('1\n2\n3');
		expect(await run('seq 2 4')).toBe('2\n3\n4');
		expect(await run('seq 1 2 7')).toBe('1\n3\n5\n7');
		expect(await run('seq 5 -2 1')).toBe('5\n3\n1');
		expect(await run('seq 0.5 0.5 2')).toBe('0.5\n1.0\n1.5\n2.0');
		expect(await run('seq 5 1')).toBe('');
	});

	it('pads to equal width and joins with a separator', async () => {
		const {run} = setup();

		expect(await run('seq -w 8 10')).toBe('08\n09\n10');
		expect(await run('seq -w -3 1')).toBe('-3\n-2\n-1\n00\n01');
		expect(await run('seq -s , 3')).toBe('1,2,3');
		expect(await run('seq --separator=: 1 1')).toBe('1');
	});

	it('streams long sequences in chunks', async () => {
		const {run} = setup();

		expect(await run('seq -s " " 2500 | wc -w')).toBe('2500');
		expect(await run('seq 2500 | tail -n 1')).toBe('2500');
	});

	it('needs one to three numbers, and a step', async () => {
		const {run} = setup();

		expect(await run('seq')).toBe("seq: missing operand\nTry 'seq --help' for more information.");
		expect(await run('seq 1 2 3 4')).toBe("seq: extra operand '4'\nTry 'seq --help' for more information.");
		expect(await run('seq x')).toBe("seq: invalid floating point argument: 'x'\nTry 'seq --help' for more information.");
		expect(await run('seq 1 0 3')).toBe("seq: invalid Zero increment value: '0'\nTry 'seq --help' for more information.");
		expect(await run('seq -z')).toBe("seq: invalid option -- 'z'\nTry 'seq --help' for more information.");
	});
});

describe('which', () => {
	it('finds programs on the PATH, and executable paths', async () => {
		const {shell, run} = setup();

		expect(await run('which ls cat')).toBe('/usr/bin/ls\n/usr/bin/cat');
		expect(await run('which -a /usr/bin/ls')).toBe('/usr/bin/ls');
		expect(shell.state.status).toBe(0);
	});

	it('fails for builtins, directories and files that are not executable', async () => {
		const {shell, run} = setup();
		const path = '(/home/robin/.local/bin:/home/robin/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin)';

		expect(await run('which cd ./cv.md /usr/bin')).toBe([`which: no cd in ${path}`, `which: no ./cv.md in ${path}`, `which: no /usr/bin in ${path}`].join('\n'));
		expect(shell.state.status).toBe(1);
		expect(await run('which')).toBe('');
		expect(shell.state.status).toBe(1);
	});
});

describe('opening files', () => {
	it('opens the editor\'s files in the editor, and only those', async () => {
		const onOpenFile = vi.fn();
		const system = fakeSystem();
		const {shell, run} = setup({onOpenFile, system});

		expect(await run('open cv.md ~/portfolio/contact.yml')).toBe('');
		expect(onOpenFile.mock.calls).toEqual([['cv'], ['contact']]);
		expect(await run('code nope /etc/passwd')).toBe('code: nope: No such file or directory\ncode: /etc/passwd: cannot be opened in the editor');
		expect(shell.state.status).toBe(1);
		expect(await run('vim')).toBe('vim: missing file operand');
		expect(await run('editor')).toBe('');
		expect(system.launch).toHaveBeenCalledWith('editor');
	});

	it('launches the desktop\'s other apps, but not a second desktop', async () => {
		const system = fakeSystem();
		const {shell, run} = setup({system});

		await run('web; terminal');
		expect(system.launch.mock.calls).toEqual([['web'], ['terminal']]);
		expect(await run('desktop')).toBe('desktop: Failed to setup: A Wayland compositor is already running');
		expect(shell.state.status).toBe(1);
	});
});

describe('sudo', () => {
	it('answers questions about itself without a password', async () => {
		const {shell, run} = setup();

		expect(await run('sudo -V')).toBe('Sudo version 1.9.15p5');
		expect(await run('sudo -l')).toBe('User robin may run the following commands on robinj.be:\n    (ALL) ALL\n    (root) NOPASSWD: /usr/bin/dnf');
		expect(await run('sudo --help')).toMatch(/^usage: sudo -h \| -K \| -k \| -V\n/);
		expect(await run('sudo -k')).toBe('');
		expect(shell.state.status).toBe(0);
	});

	it('needs a command it can find', async () => {
		const {shell, run} = setup();

		expect(await run('sudo')).toMatch(/^usage: sudo -h \| -K \| -k \| -V\n(usage: sudo .*\n){3}usage: sudo -e .* file \.\.\.$/);
		expect(shell.state.status).toBe(1);
		expect(await run('sudo nope')).toBe('sudo: nope: command not found');
		expect(shell.state.status).toBe(1);
	});

	it('asks for the password on the terminal, without echo', async () => {
		const {shell, tty, run} = setup();

		expect(await run('sudo whoami')).toBe('[sudo] password for robin: \nsudo: no password was provided');
		expect(tty.reads).toEqual([{echo: false}]);
		expect(shell.state.status).toBe(1);
	});

	it('reads passwords from stdin with -S, with its own prompt', async () => {
		vi.useFakeTimers();
		const session = setup();

		expect(await timed(session, 'echo hunter2 | sudo -S whoami')).toBe('[sudo] password for robin: Sorry, try again.\n[sudo] password for robin: sudo: 1 incorrect password attempt');
		expect(await timed(session, 'printf "a\\nb\\n" | sudo -S -p "%u@%H: " -u root -- whoami')).toBe('robin@robinj.be: Sorry, try again.\nrobin@robinj.be: Sorry, try again.\nrobin@robinj.be: sudo: 2 incorrect password attempts');
	});

	it('asks for the password for a shell, or to validate', async () => {
		vi.useFakeTimers();
		const session = setup({input: ['x\n', 'y\n', 'z\n']});

		expect(await timed(session, 'sudo -v')).toBe('[sudo] password for robin: \nSorry, try again.\n[sudo] password for robin: \nSorry, try again.\n[sudo] password for robin: \nsudo: 3 incorrect password attempts');
		expect(await timed(session, 'sudo -i')).toBe('[sudo] password for robin: \nsudo: no password was provided');
	});

	it('gives up at once when it may not ask', async () => {
		const {shell, run} = setup();

		expect(await run('sudo -n whoami')).toBe('sudo: a password is required');
		expect(await run('sudo --non-interactive --validate')).toBe('sudo: a password is required');
		expect(shell.state.status).toBe(1);
	});

	it('runs dnf as root without asking', async () => {
		const {shell, run} = setup();

		expect(await run('sudo dnf')).toBe('Missing command. Add "--help" for more information about the arguments.');
		expect(shell.state.status).toBe(2);
		expect(await run('sudo -n /usr/bin/dnf list --installed')).toBe('No matching packages to list');
	});
});

describe('su', () => {
	it('knows which users exist', async () => {
		const {shell, run} = setup();

		expect(await run('su nobody')).toBe('su: user nobody does not exist or the user entry does not contain all the required fields');
		expect(shell.state.status).toBe(1);
	});

	it('fails for robin too, after the password', async () => {
		vi.useFakeTimers();
		const session = setup({input: ['secret\n']});

		expect(await timed(session, 'su -c ls -l robin')).toBe('Password: \nsu: Authentication failure');
	});
});

describe('bash', () => {
	it('runs a command string, with positional parameters', async () => {
		const {shell, run} = setup();

		expect(await run('bash -c "echo \\$1 \\$2" x a b')).toBe('a b');
		expect(await run('sh -c "exit 3"; echo $?')).toBe('3');
		expect(await run('bash -c')).toBe('bash: -c: option requires an argument');
		expect(shell.state.status).toBe(2);
	});

	it('runs a script file', async () => {
		const {shell, run} = setup();

		expect(await run('bash /etc/os-release; echo "[$NAME]"')).toBe('[]');
		expect(await run('bash nope')).toBe('bash: nope: No such file or directory');
		expect(shell.state.status).toBe(127);
	});

	it('reads commands from the terminal until it ends', async () => {
		const {shell, run} = setup({input: ['echo inner\n', 'fi\n', null]});
		const prompt = 'robin@robinj.be:~/portfolio$ ';

		expect(await run('bash')).toBe(`${prompt}inner\n${prompt}bash: syntax error near unexpected token \`fi'\n${prompt}exit`);
		expect(shell.state.status).toBe(2);
	});

	it('stops at exit', async () => {
		const {shell, run} = setup({input: ['exit 4\n', 'echo never\n']});

		expect(await run('bash')).toBe('robin@robinj.be:~/portfolio$ ');
		expect(shell.state.status).toBe(4);
	});
});

describe('small programs', () => {
	it('whoami, hostname and clear', async () => {
		const session = setup();

		expect(await session.run('whoami x')).toBe("whoami: extra operand 'x'\nTry 'whoami --help' for more information.");
		expect(await session.run('hostname -s')).toBe('robinj');
		expect(await session.run('hostname foo')).toBe('hostname: you must be root to change the host name');
		expect(await coloured(session, 'clear')).toBe('\x1b[H\x1b[2J\x1b[3J');
	});

	it('pwd, echo, true and false exist as programs too', async () => {
		const {run} = setup();

		expect(await run('/usr/bin/pwd')).toBe('/home/robin/portfolio');
		expect(await run('/usr/bin/echo -n hi; /usr/bin/echo there')).toBe('hithere');
		expect(await run('/usr/bin/true && /usr/bin/false; echo $?')).toBe('1');
	});
});
