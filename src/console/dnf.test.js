import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';

const NEEDS_ROOT = 'This command has to be run with superuser privileges (under the root user on most systems).';

// Runs a command line, letting dnf's progress bars fill up in fake time.
const timed = async ({shell, tty}, line) => {
	const running = shell.execute(line);
	await vi.runAllTimersAsync();
	await running;
	return tty.take().replace(/\n$/, '');
};

// Each progress bar redraws itself; what's left on screen is its last state.
const settled = text => text.split('\n').map(line => line.split('\r').pop());

beforeEach(() => {
	vi.useFakeTimers();
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('dnf', () => {
	it('needs a command it knows', async () => {
		const session = setup();

		expect(await timed(session, 'dnf')).toBe('Missing command. Add "--help" for more information about the arguments.');
		expect(session.shell.state.status).toBe(2);
		expect(await timed(session, 'dnf --verbose bogus')).toBe('Unknown argument "bogus" for command "dnf5". Add "--help" for more information about the arguments.');
		expect(session.shell.state.status).toBe(2);
	});

	it('needs root to change anything', async () => {
		const session = setup();

		expect(await timed(session, 'dnf install cowsay')).toBe(NEEDS_ROOT);
		expect(await timed(session, 'dnf remove cowsay')).toBe(NEEDS_ROOT);
		expect(await timed(session, 'dnf update')).toBe(NEEDS_ROOT);
		expect(session.shell.state.status).toBe(1);
		expect(await timed(session, 'sudo dnf install')).toBe('Missing positional argument "package-spec-binary" for command "install". Add "--help" for more information about the arguments.');
		expect(session.shell.state.status).toBe(2);
	});

	it('loads its one repository, slowly', async () => {
		const session = setup();

		const running = session.shell.execute('sudo dnf upgrade');
		await vi.advanceTimersByTimeAsync(100);
		expect(session.tty.take()).toBe('Updating and loading repositories:\n\r RobinOS 1.0.0 - riscv64                  25% |   30.8 KiB/s |    3.1 KiB |  00m00s\r RobinOS 1.0.0 - riscv64                  50% |   61.5 KiB/s |    6.2 KiB |  00m00s');
		await vi.runAllTimersAsync();
		await running;
		expect(settled(session.tty.take())).toEqual([' RobinOS 1.0.0 - riscv64                 100% |  123.0 KiB/s |   12.3 KiB |  00m00s', 'Repositories loaded.', 'Nothing to do.', '']);
	});

	it('searches names and summaries', async () => {
		const session = setup();

		expect(settled(await timed(session, 'dnf search SPEAKING')).slice(2)).toEqual(['Repositories loaded.', 'Matched fields: name, summary', ' cowsay.noarch: Configurable speaking/thinking cow']);
		expect(settled(await timed(session, 'dnf search zzz')).slice(-1)).toEqual(['No matches found.']);
		expect(session.shell.state.status).toBe(1);
	});

	it('lists and describes packages', async () => {
		const session = setup();

		expect(await timed(session, 'dnf list')).toBe('Available packages\ncowsay.noarch           3.8.4-2.rj1         robinj\nwget.riscv64            1.25.0-1.rj1        robinj');
		expect(await timed(session, 'dnf list available cowsay')).toBe('Available packages\ncowsay.noarch           3.8.4-2.rj1         robinj');
		expect(await timed(session, 'dnf list --installed')).toBe('No matching packages to list');
		expect(await timed(session, 'dnf list nope')).toBe('No matching packages to list');
		expect(session.shell.state.status).toBe(1);
		expect(await timed(session, 'dnf info cowsay')).toBe([
			'Available packages',
			'Name            : cowsay',
			'Epoch           : 0',
			'Version         : 3.8.4',
			'Release         : 2.rj1',
			'Architecture    : noarch',
			'Download size   : 42.0 KiB',
			'Installed size  : 76.0 KiB',
			'Source          : cowsay-3.8.4-2.rj1.src.rpm',
			'Repository      : robinj',
			'Summary         : Configurable speaking/thinking cow',
			'URL             : https://github.com/cowsay-org/cowsay',
			'License         : GPL-3.0-only',
			'Description     : cowsay is a configurable talking cow, written in Perl. It operates',
			'                : much as the figlet program does, and it written in the same spirit',
			'                : of silliness.',
			'Vendor          : RobinOS Project',
		].join('\n'));
		expect(await timed(session, 'dnf info nope')).toBe('No matching packages to list');
		expect(session.shell.state.status).toBe(1);
	});

	it('installs cowsay once asked, and knows it is there', async () => {
		const session = setup();

		const lines = settled(await timed(session, 'sudo dnf install --assumeyes cowsay'));
		expect(lines.slice(2)).toEqual([
			'Repositories loaded.',
			'Package                  Arch    Version                  Repository        Size',
			'Installing:',
			' cowsay                  noarch  3.8.4-2.rj1              robinj        76.0 KiB',
			'',
			'Transaction Summary:',
			' Installing:         1 package',
			'',
			'Total size of inbound packages is 42 KiB. Need to download 42 KiB.',
			'After this operation, 76 KiB extra will be used (install 76 KiB, remove 0 B).',
			'Is this ok [y/N]: y',
			'[1/1] cowsay-0:3.8.4-2.rj1.noarch        100% |  420.0 KiB/s |   42.0 KiB |  00m00s',
			'-'.repeat(80),
			'[1/1] Total                              100% |  420.0 KiB/s |   42.0 KiB |  00m00s',
			'Running transaction',
			'[1/3] Verify package files               100% |    1.0 KiB/s |    0.1 KiB |  00m00s',
			'[2/3] Prepare transaction                100% |    1.0 KiB/s |    0.1 KiB |  00m00s',
			'[3/3] Installing cowsay-0:3.8.4-2.rj1.no 100% |  760.0 KiB/s |   76.0 KiB |  00m00s',
			'Complete!',
		]);
		expect(session.shell.state.status).toBe(0);
		expect(await timed(session, 'dnf list installed')).toBe('Installed packages\ncowsay.noarch           3.8.4-2.rj1         robinj');
		expect(await timed(session, 'dnf info cowsay | head -1')).toBe('Installed packages');
		expect(settled(await timed(session, 'sudo dnf install cowsay')).slice(-3)).toEqual(['Package "cowsay-3.8.4-2.rj1.noarch" is already installed.', '', 'Nothing to do.']);
	});

	it('has wget too, its sizes in MiB', async () => {
		const session = setup();

		expect(await timed(session, 'dnf info wget | grep -E "^(Name|Architecture|Download size|Installed size|License)"')).toBe([
			'Name            : wget', 'Architecture    : riscv64', 'Download size   : 795.3 KiB', 'Installed size  : 3.3 MiB', 'License         : GPL-3.0-or-later',
		].join('\n'));
		const lines = settled(await timed(session, 'sudo dnf install -y wget'));
		expect(lines).toContain(' wget                    riscv64 1.25.0-1.rj1             robinj         3.3 MiB');
		expect(lines).toContain('After this operation, 3 MiB extra will be used (install 3 MiB, remove 0 B).');
		expect(lines).toContain('[3/3] Installing wget-0:1.25.0-1.rj1.ris 100% |   32.9 MiB/s |    3.3 MiB |  00m00s');
		expect(settled(await timed(session, 'sudo dnf remove -y wget'))).toContain('After this operation, 3 MiB will be freed (install 0 B, remove 3 MiB).');
		expect(await timed(session, 'wget')).toBe('bash: wget: command not found');
	});

	it('reads the answer from a pipe, echoing it', async () => {
		const session = setup();

		expect(settled(await timed(session, 'echo yes | sudo dnf install cowsay'))).toContain('Is this ok [y/N]: yes');
		expect(session.shell.packages.has('cowsay')).toBe(true);
	});

	it('does nothing unless the answer is yes', async () => {
		const session = setup({input: ['n\n']});

		expect(settled(await timed(session, 'sudo dnf install cowsay')).slice(-1)).toEqual(['Is this ok [y/N]: Operation aborted by the user.']);
		expect(session.shell.state.status).toBe(1);
		expect(await timed(session, 'sudo dnf install cowsay < /dev/null')).toMatch(/Is this ok \[y\/N\]: \nOperation aborted by the user\.$/);
		expect(session.shell.packages.has('cowsay')).toBe(false);
	});

	it('cannot install what it does not have', async () => {
		const session = setup();

		expect(settled(await timed(session, 'sudo dnf install nope cowsay')).slice(-4)).toEqual(['Failed to resolve the transaction:', 'No match for argument: nope', 'You can try to add to command line:', '  --skip-unavailable to skip unavailable packages']);
		expect(session.shell.state.status).toBe(1);
	});

	it('removes cowsay again, and only when it is there', async () => {
		stubStorage({'terminal:packages': ['cowsay']});
		const session = setup({input: ['y\n']});

		expect(await timed(session, 'sudo dnf remove nope')).toBe('No packages to remove for argument: nope\n\nNothing to do.');
		expect(session.shell.state.status).toBe(0);
		expect(settled(await timed(session, 'sudo dnf erase cowsay'))).toEqual([
			'Package                  Arch    Version                  Repository        Size',
			'Removing:',
			' cowsay                  noarch  3.8.4-2.rj1              robinj        76.0 KiB',
			'',
			'Transaction Summary:',
			' Removing:           1 package',
			'',
			'After this operation, 76 KiB will be freed (install 0 B, remove 76 KiB).',
			'Is this ok [y/N]: Running transaction',
			'[1/3] Verify package files               100% |    1.0 KiB/s |    0.1 KiB |  00m00s',
			'[2/3] Prepare transaction                100% |    1.0 KiB/s |    0.1 KiB |  00m00s',
			'[3/3] Removing cowsay-0:3.8.4-2.rj1.noar 100% |  760.0 KiB/s |   76.0 KiB |  00m00s',
			'Complete!',
		]);
		expect(await timed(session, 'cowsay hi')).toBe('bash: cowsay: command not found');
		expect(JSON.parse(localStorage.getItem('terminal:packages'))).toEqual([]);
	});
});

describe('cowsay and cowthink', () => {
	beforeEach(() => {
		stubStorage({'terminal:packages': ['cowsay']});
	});

	const cow = (eyes = 'oo', tongue = '  ', thoughts = '\\') => [
		`        ${thoughts}   ^__^`,
		`         ${thoughts}  (${eyes})\\_______`,
		'            (__)\\       )\\/\\',
		`             ${tongue} ||----w |`,
		'                ||     ||',
	].join('\n');

	it('lists its cows', async () => {
		const {run} = setup();

		expect(await run('cowsay -l')).toBe('Cow files in /usr/share/cowsay/cows:\ndefault tux');
	});

	it('wraps long text in a balloon', async () => {
		const {run} = setup();

		expect(await run('cowsay -W 10 the quick brown fox jumps')).toBe(` ___________\n/ the quick \\\n| brown fox |\n\\ jumps     /\n -----------\n${cow()}`);
		expect(await run('cowsay -W x "a\tb"')).toBe(` _____\n< a b >\n -----\n${cow()}`);
	});

	it('keeps the lines as they are with -n', async () => {
		const {run} = setup();

		expect(await run('printf "a\\nbb\\n" | cowsay -n')).toBe(` ____\n/ a  \\\n\\ bb /\n ----\n${cow()}`);
	});

	it('reads what to say from stdin, even nothing', async () => {
		const {run} = setup();

		expect(await run('echo moo | cowsay')).toBe(` _____\n< moo >\n -----\n${cow()}`);
		expect(await run('cowsay < /dev/null')).toBe(` __\n<  >\n --\n${cow()}`);
	});

	it('changes the eyes and tongue, by hand or by mood', async () => {
		const {run} = setup();

		expect(await run('cowsay -e ^^ -T U hi')).toBe(` ____\n< hi >\n ----\n${cow('^^', 'U ')}`);
		expect(await run('cowsay -e @ -T')).toBe(` __\n<  >\n --\n${cow('@ ', '  ')}`);
		expect(await run('cowsay -d dead')).toBe(` ______\n< dead >\n ------\n${cow('XX', 'U ')}`);
		expect(await run('cowsay -b moo')).toBe(` _____\n< moo >\n -----\n${cow('==')}`);
	});

	it('draws other cows', async () => {
		const {shell, run} = setup();

		expect(await run('cowsay -f tux hi')).toBe(" ____\n< hi >\n ----\n   \\\n    \\\n        .--.\n       |o_o |\n       |:_/ |\n      //   \\ \\\n     (|     | )\n    /'\\_   _/`\\\n    \\___)=(___/");
		expect(await run('cowsay -f nope hi')).toBe('cowsay: Could not find nope cowfile!');
		expect(shell.state.status).toBe(1);
	});

	it('thinks instead of speaking as cowthink', async () => {
		const {run} = setup();

		expect(await run('cowthink -W 3 hmm, well')).toBe(` ______\n( hmm, )\n( well )\n ------\n${cow('oo', '  ', 'o')}`);
		expect(await run('cowthink -f nope x')).toBe('cowthink: Could not find nope cowfile!');
	});
});
