import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, plain, setup, stubStorage} from './test-helpers';

afterEach(() => {
	vi.useRealTimers();
});

beforeEach(() => {
	stubStorage();
});

describe('shell', () => {
	it('starts in ~/portfolio and lists the editor\'s files', async () => {
		const {shell, run} = setup();

		expect(plain(shell.prompt())).toBe('robin@robinj.be:~/portfolio$ ');
		expect(await run('ls')).toBe('contact.yml  cv.md  side-quests.yml  whoami.txt');
		expect(await run('ls | cat')).toBe('contact.yml\ncv.md\nside-quests.yml\nwhoami.txt');
		expect(await run('pwd')).toBe('/home/robin/portfolio');
	});

	it('moves around and shows hidden files with -a', async () => {
		const onCwd = vi.fn();
		const {run} = setup({onCwd});

		await run('cd ..');
		expect(onCwd).toHaveBeenLastCalledWith('~');
		expect(await run('ls -A')).toBe('.bash_history  .kube  .profile  portfolio');
		expect(await run('cd nowhere')).toBe('bash: cd: nowhere: No such file or directory');
		expect(await run('cd .profile')).toBe('bash: cd: .profile: Not a directory');
		expect(await run('cd /root')).toBe('bash: cd: /root: Permission denied');
		expect(await run('cd - && pwd')).toBe('/home/robin/portfolio\n/home/robin/portfolio');
	});

	it('prints files, including the profile it exports from', async () => {
		const {run} = setup();

		expect(await run('cat contact.yml')).toContain('  - linkedin: https://linkedin.com/in/robin-jacobs');
		// Like any text file, it ends with a newline: the prompt starts on a line of its own.
		expect((await run('cat ~/.profile; echo next')).split('\n').slice(-2)).toEqual(['export LOCATION="Dublin, Ireland"', 'next']);
		expect(await run('head -n 1 cv.md')).toBe('# CV');
		expect(await run('echo $ROLE in "$LOCATION"')).toBe('Senior Software Engineer in Dublin, Ireland');
		expect(await run("echo '$ROLE'")).toBe('$ROLE');
	});

	it('pipes, redirects and chains', async () => {
		const {run} = setup();

		expect(await run('cat cv.md | grep -i "beeline" | head -1')).toBe('### Senior Software Engineer @ Beeline [Sep 2024 → Sep 2026]');
		expect(await run('ls | wc -l')).toBe('4');
		expect(await run('wc -l < cv.md')).toMatch(/^\d+$/);
		expect(await run('false && echo no || echo yes; echo $?')).toBe('yes\n0');
		expect(await run('echo hidden > /dev/null; echo shown')).toBe('shown');
		expect(await run('grep -c x <<< "x\ny\nx"')).toBe('2');
		expect(await run('cat <<EOF\nhi $USER\nEOF')).toBe('hi robin');
		expect(await run("cat <<'EOF'\nhi $USER\nEOF")).toBe('hi $USER');
		expect(await run('ls nowhere 2>&1 | wc -l')).toBe('1');
	});

	it('refuses to write anything', async () => {
		const {run} = setup();

		expect(await run('echo hi > note.txt')).toBe('bash: note.txt: Read-only file system');
		expect(await run('echo hi >> /etc/passwd')).toBe('bash: /etc/passwd: Read-only file system');
		expect(await run('rm cv.md')).toBe("rm: cannot remove 'cv.md': Read-only file system");
		expect(await run('rm nope')).toBe("rm: cannot remove 'nope': No such file or directory");
		expect(await run('rm -rf /')).toBe("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe");
		expect(await run('cp cv.md /tmp')).toBe("cp: cannot create regular file '/tmp/cv.md': Read-only file system");
		expect(await run('mv cv.md cv2.md')).toBe("mv: cannot move 'cv.md' to 'cv2.md': Read-only file system");
		expect(await run('chmod 777 cv.md')).toBe("chmod: changing permissions of 'cv.md': Read-only file system");
		expect(await run('chown root cv.md')).toBe("chown: changing ownership of 'cv.md': Read-only file system");
		expect(await run('touch new')).toBe("touch: cannot touch 'new': Read-only file system");
		expect(await run('mkdir new')).toBe("mkdir: cannot create directory 'new': Read-only file system");
	});

	it('expands globs, braces, arithmetic and parameters', async () => {
		const {run} = setup();

		expect(await run('echo *.md *.yml')).toBe('cv.md contact.yml side-quests.yml');
		expect(await run('echo c*')).toBe('contact.yml cv.md');
		expect(await run('echo nothing*')).toBe('nothing*');
		expect(await run('echo "*.md"')).toBe('*.md');
		expect(await run('echo /etc/*release')).toBe('/etc/os-release /etc/robinj-release');
		expect(await run('echo {a,b}{1..3}')).toBe('a1 a2 a3 b1 b2 b3');
		expect(await run('echo $((6 * 7)) $((2 ** 10)) $((7 / 2))')).toBe('42 1024 3');
		expect(await run('x=hello.tar.gz; echo ${x%.gz} ${x%%.*} ${x#*.} ${#x} ${x/l/L} ${x//l/L} ${y:-default}')).toBe('hello.tar hello tar.gz 12 heLlo.tar.gz heLLo.tar.gz default');
		expect(await run('a=(one two "three four"); echo ${#a[@]} ${a[1]}; for i in "${a[@]}"; do echo "[$i]"; done')).toBe('3 two\n[one]\n[two]\n[three four]');
		expect(await run('echo $(echo inner) `echo old`')).toBe('inner old');
		expect(await run('x="a  b"; echo $x; echo "$x"')).toBe('a b\na  b');
	});

	it('runs scripts', async () => {
		const {run} = setup();

		expect(await run('for i in 1 2 3; do echo $i; done')).toBe('1\n2\n3');
		expect(await run('i=0; while [ $i -lt 3 ]; do i=$((i + 1)); done; echo $i')).toBe('3');
		expect(await run('until false; do echo once; break; done')).toBe('once');
		expect(await run('for ((i = 0; i < 3; i++)); do printf "%d," $i; done')).toBe('0,1,2,');
		expect(await run('if [[ -f cv.md && $USER == rob* ]]; then echo yes; elif true; then echo no; else echo never; fi')).toBe('yes');
		expect(await run('case cv.md in *.yml) echo yaml;; *.md) echo markdown;; esac')).toBe('markdown');
		expect(await run('greet() { local name=$1; echo "hi $name"; return 3; }; greet you; echo $? $name')).toBe('hi you\n3');
		expect(await run('ls *.yml | while read f; do echo "<$f>"; done')).toBe('<contact.yml>\n<side-quests.yml>');
		expect(await run('[[ abc =~ ^a(b)c$ ]] && echo ${BASH_REMATCH[1]}')).toBe('b');
		expect(await run('(( 3 > 2 )) && echo bigger')).toBe('bigger');
	});

	it('slows runaway loops down until ^C', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute('i=0; while true; do i=$((i + 1)); done');
		await vi.advanceTimersByTimeAsync(1000);
		shell.interrupt();
		await running;
		vi.useRealTimers();

		// Ten commands at full speed, then ten a second: two per iteration.
		expect(Number(shell.getVar(shell.state, 'i'))).toBeGreaterThanOrEqual(9);
		expect(Number(shell.getVar(shell.state, 'i'))).toBeLessThanOrEqual(11);
		expect(shell.state.status).toBe(130);
		expect(tty.take()).toBe('\n');
	});

	it('says so for unknown commands and bad syntax, and keeps a history', async () => {
		const {shell, run} = setup();

		expect(await run('sl')).toBe('bash: sl: command not found');
		expect(await run('fi')).toBe("bash: syntax error near unexpected token `fi'");
		expect(shell.isComplete('if true; then')).toBe(false);
		expect(shell.isComplete('cat cv.md |')).toBe(false);
		expect(shell.isComplete('echo "open')).toBe(false);
		await run('whoami');
		expect(await run('history')).toBe('    1  sl\n    2  fi\n    3  whoami\n    4  history');
		expect(await run('!w')).toBe('whoami\nrobin');
	});

	it('keeps history across sessions', async () => {
		await setup().run('echo remembered');
		const {shell} = setup();

		expect(shell.history).toEqual(['echo remembered']);
	});

	it('opens files in the editor, and exits', async () => {
		const onOpenFile = vi.fn();
		const onExit = vi.fn();
		const {run} = setup({onOpenFile, onExit});

		await run('xdg-open side-quests.yml');
		expect(onOpenFile).toHaveBeenCalledWith('side-quests');
		expect(await run('vim ~/.profile')).toBe('vim: /home/robin/.profile: cannot be opened in the editor');

		expect(await run('exit')).toBe('exit');
		expect(onExit).toHaveBeenCalled();
	});

	it('completes commands and paths', () => {
		const {shell} = setup();

		expect(shell.complete('whoa')).toEqual({completion: 'mi ', options: ['whoami']});
		expect(shell.complete('cat c')).toEqual({completion: '', options: ['contact.yml', 'cv.md']});
		expect(shell.complete('cat cv')).toEqual({completion: '.md ', options: ['cv.md']});
		expect(shell.complete('cd ../p')).toEqual({completion: 'ortfolio/', options: ['portfolio']});
		expect(shell.complete('ls | gre')).toEqual({completion: 'p ', options: ['grep']});
	});

	it('knows about the system it runs on', async () => {
		const {run} = setup();

		expect(await run('uname -a')).toMatch(/^Linux robinj\.be 1\.0\.0-rj1\.riscv64 #1 SMP PREEMPT_DYNAMIC .* riscv64 GNU\/Linux$/);
		expect(await run('lsb_release -a')).toBe('LSB Version:\tn/a\nDistributor ID:\tRobinOS\nDescription:\tRobinOS 1.0.0 (Web Edition)\nRelease:\t1.0.0\nCodename:\tHiddenBits');
		expect(await run('whoami; hostname')).toBe('robin\nrobinj.be');
		expect(await run('date +%Y')).toBe(String(new Date().getFullYear()));
		expect(await run('type cd ls ll')).toBe("cd is a shell builtin\nls is aliased to `ls --color=auto'\nll is aliased to `ls -l --color=auto'");
		expect(await run('ls -l /bin')).toMatch(/^lrwxrwxrwx\. 1 root root 7 .* \/bin -> usr\/bin$/);
		expect(await run('tree')).toBe('.\n├── contact.yml\n├── cv.md\n├── side-quests.yml\n└── whoami.txt\n\n0 directories, 4 files');
		expect(await run('cat /etc/shadow')).toBe('cat: /etc/shadow: Permission denied');
	});

	it('runs jobs in the background, and reports them', async () => {
		const {shell, run} = setup();

		expect(await run('sleep 60 & jobs')).toMatch(/^\[1\] \d+\n\[1\]\+  Running                 sleep 60 &$/);
		await run('kill %1; wait');
		expect(shell.notifications()).toBe('');
		await run('sleep 60 &');
		await run('kill $!');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(shell.notifications()).toBe('[1]+  Terminated              sleep 60\n');
	});

	it('reads what is typed', async () => {
		const {run} = setup({input: ['Robin Jacobs\n', 'one\n', 'two\n', null]});

		expect(await run('read first last; echo "$last, $first"')).toBe('Jacobs, Robin');
		expect(await run('cat')).toBe('one\ntwo');
	});

	it('lists processes, and kills them as far as it may', async () => {
		const halt = vi.fn();
		const kill = vi.fn(() => 'ok');
		const system = {
			pid: (() => {
				let next = 2000;
				return () => next++;
			})(),
			terminalPid: 1999,
			bootedAt: new Date(),
			processes: () => [{pid: 1337, name: 'desktop', started: new Date()}, {pid: 1402, name: 'web', started: new Date()}],
			kill,
			halt,
		};
		const {run} = setup({system});

		expect(await run('ps')).toMatch(/^    PID TTY          TIME CMD\n   2000 pts\/0    00:00:00 bash\n   \d+ pts\/0    00:00:00 ps$/);
		expect(await run('ps -e | grep -c "web\\|desktop"')).toBe('2');
		expect(await run('kill 1')).toBe('bash: kill: (1) - Operation not permitted');
		expect(await run('kill 99999')).toBe('bash: kill: (99999) - No such process');
		expect(await run('pkill web')).toBe('');
		expect(kill).toHaveBeenCalledWith(1402, 'TERM');
		expect(await run('kill -9 1337')).toBe('');
		expect(halt).toHaveBeenCalledWith(expect.objectContaining({mode: 'panic', lines: expect.arrayContaining([expect.stringContaining('Kernel panic - not syncing: Critical system component died! exitcode=0x00000009')])}));
	});

	it('never takes the password, for sudo or su', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({input: ['hunter2\n', 'correct horse battery staple\n', 'letmein\n', 'root\n']});

		const sudo = shell.execute('sudo rm -rf /');
		await vi.advanceTimersByTimeAsync(6000);
		await sudo;
		expect(tty.take()).toBe('[sudo] password for robin: \nSorry, try again.\n[sudo] password for robin: \nSorry, try again.\n[sudo] password for robin: \nsudo: 3 incorrect password attempts\n');

		const su = shell.execute('su -');
		await vi.advanceTimersByTimeAsync(2000);
		await su;
		vi.useRealTimers();
		expect(tty.take()).toBe('Password: \nsu: Authentication failure\n');
		expect(shell.state.status).toBe(1);
	});

	it('schedules a shutdown, and cancels it', async () => {
		vi.useFakeTimers({now: new Date('2026-10-27T22:00:00')});
		const halt = vi.fn();
		const system = {pid: () => 4242, terminalPid: 4241, bootedAt: new Date(), processes: () => [], kill: () => 'missing', halt};
		const {run} = setup({system});

		const scheduled = await run('shutdown +1');
		expect(scheduled).toMatch(/^Shutdown scheduled for Tue 2026-10-27 22:01:00 \S+, use 'shutdown -c' to cancel\.\n/);
		expect(scheduled).toMatch(/Broadcast message from robin@robinj\.be on pts\/0 \(Tue 2026-10-27 22:00:00 \S+\):\n\nThe system will power off at Tue 2026-10-27 22:01:00 \S+!\n$/);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(halt).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(halt).toHaveBeenCalledWith(expect.objectContaining({mode: 'poweroff'}));

		await run('shutdown -r 22:30');
		expect(await run('shutdown -c')).toMatch(/\n\nSystem shutdown has been cancelled\n$/);
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(halt).toHaveBeenCalledTimes(1);

		// Going down another way first cancels it.
		await run('shutdown +5');
		await run('reboot');
		await vi.advanceTimersByTimeAsync(600_000);
		expect(halt).toHaveBeenCalledTimes(2);
		expect(halt).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'reboot'}));
		vi.useRealTimers();
	});

	it('kills processes by name', async () => {
		const kill = vi.fn(() => 'ok');
		const system = {
			pid: (() => {
				let next = 2000;
				return () => next++;
			})(),
			terminalPid: 1999,
			bootedAt: new Date(),
			processes: () => [{pid: 1402, name: 'web', started: new Date()}],
			kill,
			halt: () => {},
		};
		const {run} = setup({system});

		expect(await run('killall -v web')).toBe('Killed web(1402) with signal 15');
		expect(kill).toHaveBeenCalledWith(1402, 'TERM');
		expect(await run('killall -9 nothing')).toBe('nothing: no process found');
		expect(await run('killall systemd')).toBe('systemd(1): Operation not permitted');
	});

	it('looks at the cluster at home, without changing anything', async () => {
		const {run} = setup();
		const pods = /^NAME +READY +STATUS +RESTARTS +AGE\nrobinj-be-website-7c9d8f6b5d-q8zrm +1\/1 +Running +0 +\d+m\nrobinj-be-website-7c9d8f6b5d-x2k4p +1\/1 +Running +0 +\d+m$/;

		expect(await run('kubectl config current-context')).toBe('robins-apartment');
		expect(await run('kubectl get pods')).toMatch(pods);
		expect(await run('kubectl get deploy')).toMatch(/^NAME +READY +UP-TO-DATE +AVAILABLE +AGE\nrobinj-be-website +2\/2 +2 +2 +47d$/);
		expect(await run('kubectl get hpa')).toMatch(/robinj-be-website +Deployment\/robinj-be-website +cpu: 42%\/70% +1 +3 +2 +47d$/);
		expect(await run('kubectl get nodes -o wide')).toMatch(/RobinOS 1\.0\.0 \(Server Edition\) +1\.0\.0-rj1\.riscv64/);
		expect(await run('kubectl get deploy -n kube-system')).toBe('No resources found in kube-system namespace.');
		// The newest request in the logs is the one for this very page.
		expect(await run('kubectl logs deploy/robinj-be-website --tail 1')).toMatch(new RegExp(`^Found 2 pods, using pod/robinj-be-website-7c9d8f6b5d-q8zrm\n.*"GET ${location.pathname} HTTP/1\\.1" 200 \\d+ "-" "${navigator.userAgent.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}" "-"$`));
		expect(await run('kubectl delete pod robinj-be-website-7c9d8f6b5d-q8zrm')).toBe('Error from server (Forbidden): pods "robinj-be-website-7c9d8f6b5d-q8zrm" is forbidden: User "robin" cannot delete resource "pods" in API group "" in the namespace "default"');
		expect(await run('kubectl scale deploy robinj-be-website --replicas=3')).toBe('Error from server (Forbidden): deployments.apps "robinj-be-website" is forbidden: User "robin" cannot patch resource "deployments/scale" in API group "apps" in the namespace "default"');
		expect(await run('kubectl auth can-i delete pods')).toBe('no');
		expect(await run('kubectl config use-context robins-apartment')).toBe('error: open /home/robin/.kube/config.lock: read-only file system');
	});

	it('installs cowsay through dnf, as root', async () => {
		const {run} = setup({input: ['y\n']});

		expect(await run('cowsay hi')).toBe('bash: cowsay: command not found');
		expect(await run('dnf install cowsay')).toBe('This command has to be run with superuser privileges (under the root user on most systems).');
		expect(await run('sudo dnf install cowsay')).toMatch(/Is this ok \[y\/N\]: [^]*Complete!$/);
		expect(await run('cowsay moo')).toBe(' _____\n< moo >\n -----\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||');

		// Still there next time.
		expect(await setup().run('which cowsay')).toBe('/usr/bin/cowsay');
	});
});

describe('redirections', () => {
	it('duplicate, close and swap file descriptors in order', async () => {
		const {run} = setup();

		expect(await run('{ echo out; echo err >&2; } 2>&1 >/dev/null | wc -l')).toBe('1');
		expect(await run('{ echo out; echo err >&2; } &> /dev/null; echo "[$?]"')).toBe('[0]');
		expect(await run('echo hi >&-; cat <&-; echo "[$?]"')).toBe('[0]');
		expect(await run('cat 0<&0 <<< hi; echo x 1>&1; echo y >| /dev/null')).toBe('hi\nx');
		expect(await run('cat <> /etc/hostname; echo z >> /dev/stdout; echo e 2>/dev/stderr')).toBe('robinj.be\nz\ne');
	});

	it('read from stdin and the terminal as files', async () => {
		const {run} = setup({input: ['typed\n']});

		expect(await run('echo piped | cat < /dev/stdin')).toBe('piped');
		expect(await run('echo ignored | cat < /dev/tty')).toBe('typed');
		expect(await run('echo shown > /dev/tty | wc -c')).toBe('shown\n0');
	});

	it('fail the command when a target is bad', async () => {
		const {shell, run} = setup();

		expect(await run('x="a b"; echo hi > $x')).toBe('bash: $x: ambiguous redirect');
		expect(shell.state.status).toBe(1);
		expect(await run('cat < nope')).toBe('bash: nope: No such file or directory');
		expect(await run('echo hi >&5')).toBe('bash: 5: Bad file descriptor');
		expect(await run('echo hi > ${u?}')).toBe('bash: u: parameter null or not set');
		expect(await run('{ echo hi; } > nope/x')).toBe('bash: nope/x: No such file or directory');
		expect(await run('> /root/x')).toBe('bash: /root/x: Permission denied');
		expect(shell.state.status).toBe(1);
		expect(await run('( echo hi ) > /dev/null; echo "[$?]"')).toBe('[0]');
	});
});

describe('errors while running', () => {
	it('stop the command that hit them', async () => {
		const {shell, run} = setup();

		expect(await run('x=${u?}; echo $?')).toBe('bash: u: parameter null or not set\n1');
		expect(await run('x=${u?} echo hi; echo $?')).toBe('bash: u: parameter null or not set\n1');
		expect(await run('for x in ${u?}; do :; done; echo $?')).toBe('bash: u: parameter null or not set\n1');
		expect(await run('case ${u?} in *) ;; esac; echo $?')).toBe('bash: u: parameter null or not set\n1');
		expect(await run('for ((i = 0; i < 1/0; i++)); do :; done; echo $?')).toBe('bash: i < 1/0: division by 0 (error token is "/0")\n1');
		expect(await run('(( 1/0 )); echo $?')).toBe('bash: 1/0: division by 0 (error token is "/0")\n1');
		expect(await run('[[ 1 -eq 1/0 ]]; echo $?')).toBe('bash: 1/0: division by 0 (error token is "/0")\n1');
		expect(await run('[[ -n x || 1 -eq 1/0 ]] && echo short-circuited')).toBe('short-circuited');
		expect(shell.state.status).toBe(0);
	});

	it('say what is wrong with a path that is not a program', async () => {
		const {shell, run} = setup();

		expect(await run('/usr/bin/nope')).toBe('bash: /usr/bin/nope: No such file or directory');
		expect(shell.state.status).toBe(127);
		expect(await run('/usr/bin/cowsay')).toBe('bash: /usr/bin/cowsay: No such file or directory');
		expect(await run('/etc')).toBe('bash: /etc: Is a directory');
		expect(shell.state.status).toBe(126);
		expect(await run('./cv.md')).toBe('bash: ./cv.md: Permission denied');
		expect(shell.state.status).toBe(126);
		expect(await run('/bin/whoami; ../../../usr/bin/hostname')).toBe('robin\nrobinj.be');
	});

	it('stop runaway recursion', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute('f() { f; }; f; echo $?');
		await vi.runAllTimersAsync();
		await running;
		expect(tty.take()).toBe('bash: f: maximum function nesting level exceeded (1000)\n1\n');
	});

	it('exit from a function leaves only the subshell it runs in', async () => {
		const {run} = setup();

		expect(await run('f() { exit 3; }; (f); echo $?')).toBe('3');
	});

	it('let only so many processes run at once', async () => {
		vi.useFakeTimers();
		const {shell, run} = setup();

		await run('for i in {1..128}; do sleep 100 & done');
		expect(shell.jobs).toHaveLength(128);
		expect(await run('sleep 1 &')).toBe('bash: fork: Resource temporarily unavailable');
		expect(await run('ls')).toBe('bash: fork: Resource temporarily unavailable');
		expect(shell.state.status).toBe(254);
		expect(await run('echo builtins still work')).toBe('builtins still work');
	});

	it('a writer whose reader went away stops quietly', async () => {
		const {shell, run} = setup();

		expect(await run('seq 100000 | head -1')).toBe('1');
		expect(shell.state.status).toBe(0);
	});

	it('^C stops a whole pipeline', async () => {
		const {shell, tty} = setup();

		const running = shell.execute('sleep 100 | cat; echo never');
		await vi.waitFor(() => expect(shell.procs.size).toBe(2));
		shell.interrupt();
		await running;
		expect(tty.take()).toBe('\n');
		expect(shell.state.status).toBe(130);
		expect(shell.procs.size).toBe(0);
	});

	it('a program killed from outside says how it ended', async () => {
		const {shell, tty} = setup();

		const running = shell.execute('sleep 100; echo $?');
		await vi.waitFor(() => expect(shell.procs.size).toBe(1));
		const [pid] = shell.procs.keys();
		expect(shell.kill(pid, 'WINCH')).toBe('ok');
		expect(shell.kill(pid, 'TERM')).toBe('ok');
		await running;
		expect(tty.take()).toBe('Terminated\n143\n');
	});

	it('a background job that exits reports its status', async () => {
		const {shell, run} = setup();

		await run('exit 4 &');
		await vi.waitFor(() => expect(shell.notifications()).toBe('[1]+  Exit 4                  exit 4\n'));
		expect(shell.exited).toBe(false);
	});
});

describe('variables in the shell', () => {
	it('knows its own and its parent\'s pid', async () => {
		const {run} = setup({system: fakeSystem()});

		expect(await run('echo $$ $BASHPID $PPID')).toBe('2000 2000 1999');
	});

	it('appends to arrays and their elements', async () => {
		const {run} = setup();

		expect(await run('a=(x y); a[1]+=z; a+=w; a[i=2]=v; echo ${a[@]}')).toBe('xw yz v');
		expect(await run('s=abc; s[2]=q; echo ${s[@]}')).toBe('abc q');
		expect(await run('e=; e[0]=first; echo ${e[@]}')).toBe('first');
		expect(await run('n[1]+=one; echo ${n[@]}')).toBe('one');
	});

	it('keeps the gaps in sparse arrays, when appending and in subshells', async () => {
		const {run} = setup();

		expect(await run('a=(x); a[2]=z; a+=(w); echo ${a[@]} ${#a[@]} ${a[3]}; (echo ${a[@]}); echo ${a[@]} | cat')).toBe('x z w 3 w\nx z w\nx z w');
		expect(await run('unset b; b+=(only); echo ${#b[@]}')).toBe('1');
	});

	it('passes temporary assignments to programs, not to the shell', async () => {
		const {run} = setup();

		expect(await run('FOO=bar env | grep ^FOO=; echo "[$FOO]"')).toBe('FOO=bar\n[]');
		expect(await run('FOO=bar export -p | grep -c FOO=')).toBe('1');
	});

	it('runs if without else to success', async () => {
		const {run} = setup();

		expect(await run('false; if false; then :; fi; echo $?')).toBe('0');
	});
});

describe('history expansion', () => {
	it('repeats earlier commands and words, showing what it ran', async () => {
		const {run} = setup();

		await run('echo one two');
		expect(await run('echo !$')).toBe('echo two\ntwo');
		expect(await run('echo !!')).toBe('echo echo two\necho two');
		expect(await run('!-2')).toBe('echo two\ntwo');
		expect(await run('!1')).toBe('echo one two\none two');
		expect(await run('!ech')).toBe('echo one two\none two');
	});

	it('leaves ! alone in ${!name}, $! and [!...], as bash does', async () => {
		const {run} = setup({system: fakeSystem()});

		expect(await run('x=y; y=z; echo ${!x}')).toBe('z');
		expect(await run('echo /etc/[!ph]*')).toBe('/etc/os-release /etc/robinj-release /etc/shadow');
		expect(await run('true & echo "[$!]"')).toBe('[1] 2001\n[2001]');
	});

	it('leaves escaped and single-quoted marks alone', async () => {
		const {run} = setup();

		expect(await run('echo \\!x \'!x\' a!=b "!(x)"')).toBe('!x !x a!=b !(x)');
	});

	it('reports events it cannot find, running nothing', async () => {
		const {shell, run} = setup();

		expect(await run('echo !nope')).toBe('bash: !nope: event not found');
		expect(shell.history).toEqual([]);
	});

	it('keeps multi-line commands on one history line', async () => {
		const {shell, run} = setup();

		await run('for i in 1 2\ndo\n  echo $i\ndone');
		await run('if true\nthen\n  echo yes\nfi');
		await run('cat <<EOF\nkept\nEOF');
		expect(shell.history).toEqual(['for i in 1 2; do echo $i; done', 'if true; then echo yes; fi', 'cat <<EOF\nkept\nEOF']);
	});

	it('joins multi-line case items and function definitions into lines that run again', async () => {
		const {shell, run} = setup();

		await run('case x in\n  x)\n    echo matched\n    ;;\nesac');
		await run('f()\n{\n  echo defined\n}');
		expect(shell.history).toEqual(['case x in x) echo matched ;; esac', 'f() { echo defined; }']);
		expect(await run(`${shell.history[0]}; ${shell.history[1]}; f`)).toBe('matched\ndefined');
	});

	it('skips blank lines and repeats, and keeps at most a thousand', async () => {
		const {shell} = setup();

		shell.addHistory('   ');
		shell.addHistory('same');
		shell.addHistory('same');
		expect(shell.history).toEqual(['same']);
		for (let i = 0; i < 1005; i++) {
			shell.addHistory(`command ${i}`);
		}
		expect(shell.history).toHaveLength(1000);
		expect(shell.history[0]).toBe('command 5');
	});
});

describe('the prompt', () => {
	it('expands bash\'s prompt escapes', async () => {
		vi.useFakeTimers({now: new Date(2026, 9, 28, 9, 5, 7), toFake: ['Date']});
		const {shell, run} = setup();

		await run("PS1='\\h \\W \\s \\v \\V \\\\ \\101 \\0101 \\q \\[\\e[1m\\]\\$\\n\\a\\r'");
		expect(shell.prompt()).toBe('robinj portfolio bash 5.2 5.2.32 \\ A A \\q \x1b[1m$\n\x07\r');
		await run("PS1='\\t \\A \\d'");
		expect(shell.prompt()).toBe('09:05:07 09:05 Wed Oct 28');
	});

	it('shortens the home directory, and shows the root as /', async () => {
		const {shell, run} = setup();

		await run("PS1='\\w|\\W'; cd");
		expect(shell.prompt()).toBe('~|~');
		await run('cd /');
		expect(shell.prompt()).toBe('/|/');
		await run('unset PS1');
		expect(shell.prompt()).toBe('');
		expect(shell.prompt('PS2')).toBe('> ');
	});
});

describe('completion', () => {
	it('completes commands after operators and keywords', () => {
		const {shell} = setup();

		expect(shell.complete('').options).toEqual(expect.arrayContaining(['whoami', 'cd', 'if', 'll']));
		expect(shell.complete('').options).not.toContain('cowsay');
		expect(shell.complete('true && who').completion).toBe('ami ');
		expect(shell.complete('echo $(who').completion).toBe('ami ');
		expect(shell.complete('if true; then who').completion).toBe('ami ');
		expect(shell.complete('sudo dn').completion).toBe('f ');
		expect(shell.complete('ll').options).toEqual(['ll']);
	});

	it('completes paths, showing hidden files only when asked', () => {
		const {shell} = setup();

		expect(shell.complete('cat ~/')).toEqual({completion: 'portfolio/', options: ['portfolio']});
		expect(shell.complete('cat ~/.')).toEqual({completion: '', options: ['.bash_history', '.kube', '.profile']});
		expect(shell.complete('cat ~/.k')).toEqual({completion: 'ube/', options: ['.kube']});
		expect(shell.complete('ls /etc/h')).toEqual({completion: 'ostname ', options: ['hostname']});
		expect(shell.complete('ls /root/')).toEqual({completion: '', options: []});
		expect(shell.complete('./c')).toEqual({completion: '', options: ['contact.yml', 'cv.md']});
		expect(shell.complete('echo nothing')).toEqual({completion: '', options: []});
	});

	it('includes functions and aliases', async () => {
		const {shell, run} = setup();

		await run('greet() { :; }; alias greetings=true');
		expect(shell.complete('gree')).toEqual({completion: 't', options: ['greet', 'greetings']});
	});
});

describe('the system around the shell', () => {
	it('works on its own, without a desktop', async () => {
		const {shell, run} = setup();

		expect(await run('web; editor; echo $?')).toBe('0');
		expect(shell.pid).toBe(4000);
	});

	it('shows apps it does not know by name', async () => {
		const system = fakeSystem({processes: () => [{pid: 1500, name: 'mystery', started: new Date()}]});
		const {run} = setup({system});

		expect(await run('ps -p 1500 -f | tail -1')).toMatch(/^robin +1500 +1290 .* mystery$/);
	});

	it('exits only once', () => {
		const onExit = vi.fn();
		const {shell} = setup({onExit});

		shell.exit();
		shell.exit();
		expect(onExit).toHaveBeenCalledTimes(1);
	});
});
