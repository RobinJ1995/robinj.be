import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fakeSystem, setup, stubStorage} from './test-helpers';

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('echo', () => {
	it('interprets escapes with -e, and leaves them with -E', async () => {
		const {run} = setup();

		expect(await run('echo -e "a\\tb\\x41\\0101\\u263a\\\\"')).toBe('a\tbAA☺\\');
		expect(await run('echo -E "a\\tb"')).toBe('a\\tb');
		expect(await run('echo -eE "a\\tb"')).toBe('a\\tb');
		expect(await run('echo -e "\\101\\q"')).toBe('\\101\\q');
	});

	it('leaves out the newline with -n, or after \\c', async () => {
		const {run} = setup();

		expect(await run('echo -n a; echo b')).toBe('ab');
		expect(await run('echo -ne "x\\n"; echo y')).toBe('x\ny');
		expect(await run('echo -e "a\\c"; echo b')).toBe('ab');
	});

	it('prints anything else that looks like an option', async () => {
		const {run} = setup();

		expect(await run('echo -x -n')).toBe('-x -n');
	});
});

describe('printf', () => {
	it('formats strings and characters, padded and truncated', async () => {
		const {run} = setup();

		expect(await run('printf "%5s|%-5s|%.2s|%c|%3c\\n" ab cd efg hij k')).toBe('   ab|cd   |ef|h|  k');
		expect(await run('printf "%b|%q|%q|%%\\n" "a\\tb" "it s" plain')).toBe("a\tb|'it s'|plain|%");
		expect(await run('printf "%*s|%.*s|\\n" 4 x 1 yz')).toBe('   x|y|');
	});

	it('formats integers in any base, with signs and padding', async () => {
		const {run} = setup();

		expect(await run('printf "%d %+d % d %05d %-4d| %i %+05d\\n" 1 2 3 -4 5 6 7')).toBe('1 +2  3 -0004 5   | 6 +0007');
		expect(await run('printf "%o %u %x %X %#x %#o %#X\\n" 8 -1 255 255 255 8 0')).toBe('10 18446744073709551615 ff FF 0xff 010 0');
		expect(await run('printf "%d %d %d %d %d|%x\\n" "\'A" \'"B\' 010 0x1f " -3 " ""')).toBe('65 66 8 31 -3|0');
	});

	it('formats floating point numbers', async () => {
		const {run} = setup();

		expect(await run('printf "%f %.2f %e %E %F\\n" 3.14159 2.5 1234.5 0.00012 1')).toBe('3.141590 2.50 1.234500e+03 1.200000E-04 1.000000');
		expect(await run('printf "%g %G %.3g %.0g\\n" 0.0001 2.5 3.14159 7')).toBe('0.0001 2.5 3.14 7');
		expect(await run('printf "%+.1f %+e %5.1f|%-10.3e|\\n" 2 3 3.14159 31415.9')).toBe('+2.0 +3.000000e+00   3.1|3.142e+04 |');
	});

	it('reuses the format for the remaining arguments', async () => {
		const {run} = setup();

		expect(await run('printf "%s=%s\\n" a 1 b 2 c')).toBe('a=1\nb=2\nc=');
		expect(await run('printf "%s"; echo "[$?]"')).toBe('[0]');
	});

	it('stops at \\c in a %b argument', async () => {
		const {run} = setup();

		expect(await run('printf "%b\\n" "a\\c" b; echo')).toBe('a');
	});

	it('reports what is not a number, and fails', async () => {
		const {shell, run} = setup();

		expect(await run('printf "%d\\n" abc')).toBe('bash: printf: abc: invalid number\n0');
		expect(shell.state.status).toBe(1);
		expect(await run('printf "%d\\n" 12abc')).toBe('bash: printf: 12abc: invalid number\n12');
		expect(await run('printf "%.1f\\n" x')).toBe('bash: printf: x: invalid number\n0.0');
		expect(shell.state.status).toBe(1);
	});

	it('assigns to a variable with -v, and needs a format', async () => {
		const {shell, run} = setup();

		expect(await run('printf -v out "%03d" 7; echo $out')).toBe('007');
		expect(await run('printf -- "--%s\\n" x')).toBe('--x');
		expect(await run('printf')).toBe('printf: usage: printf [-v var] format [arguments]');
		expect(shell.state.status).toBe(2);
	});
});

describe('cd and pwd', () => {
	it('complains about too many arguments, and unset HOME or OLDPWD', async () => {
		const {shell, run} = setup();

		expect(await run('cd a b')).toBe('bash: cd: too many arguments');
		expect(shell.state.status).toBe(1);
		expect(await run('cd -')).toBe('bash: cd: OLDPWD not set');
		expect(await run('unset HOME; cd')).toBe('bash: cd: HOME not set');
	});

	it('goes home without an argument, and stays put for an empty one', async () => {
		const onCwd = vi.fn();
		const {run} = setup({onCwd});

		expect(await run('cd ""; pwd')).toBe('/home/robin/portfolio');
		expect(onCwd).not.toHaveBeenCalled();
		expect(await run('cd -L; pwd')).toBe('/home/robin');
		expect(onCwd).toHaveBeenLastCalledWith('~');
	});

	it('follows links logically, and pwd -P shows where it really is', async () => {
		const {run} = setup();

		expect(await run('cd /bin; pwd; pwd -P; echo $PWD $OLDPWD')).toBe('/bin\n/usr/bin\n/bin /home/robin/portfolio');
	});

	it('changes only the subshell\'s directory in a subshell', async () => {
		const onCwd = vi.fn();
		const {run} = setup({onCwd});

		expect(await run('(cd /tmp; pwd); pwd')).toBe('/tmp\n/home/robin/portfolio');
		expect(onCwd).not.toHaveBeenCalled();
	});
});

describe('test and [', () => {
	it('tests files', async () => {
		const {run} = setup();
		const check = async expression => run(`[ ${expression} ] && echo yes || echo no`);

		expect(await check('-f cv.md')).toBe('yes');
		expect(await check('-f .')).toBe('no');
		expect(await check('-d . -a -e /etc/passwd -a -a /tmp')).toBe('yes');
		expect(await check('-e nope')).toBe('no');
		expect(await check('-e ""')).toBe('no');
		expect(await check('-L /bin -a -h /bin -a ! -L /usr/bin')).toBe('yes');
		expect(await check('-c /dev/null -a ! -c cv.md')).toBe('yes');
		expect(await check('-s cv.md -a -s /tmp')).toBe('yes');
		expect(await check('-s /dev/null')).toBe('no');
		expect(await check('-r cv.md -a ! -r /etc/shadow')).toBe('yes');
		expect(await check('-w cv.md')).toBe('no');
		expect(await check('-w /dev/null')).toBe('yes');
		expect(await check('-x /usr/bin/ls -a ! -x cv.md')).toBe('yes');
		expect(await check('-O cv.md -a -G cv.md -a ! -O /etc')).toBe('yes');
		expect(await check('-k /tmp -a ! -k /etc')).toBe('yes');
		expect(await check('-p cv.md')).toBe('no');
	});

	it('tests strings, variables and terminals', async () => {
		const {run} = setup();

		expect(await run('[ -n x -a -z "" ] && echo yes')).toBe('yes');
		expect(await run('[ -v HOME ] && [ ! -v NOPE ] && echo yes')).toBe('yes');
		expect(await run('[ -t 1 ] && echo yes')).toBe('yes');
		expect(await run('echo $([ -t 1 ] && echo yes || echo no)')).toBe('no');
		expect(await run('[ a ] && echo yes')).toBe('yes');
		expect(await run('[ "" ] || echo no')).toBe('no');
		expect(await run('test; echo $?')).toBe('1');
	});

	it('compares strings, numbers and files', async () => {
		const {run} = setup();
		const check = async expression => run(`[ ${expression} ] && echo yes || echo no`);

		expect(await check('a = a -a a == a -a a != b')).toBe('yes');
		expect(await check('a \\< b -a b \\> a')).toBe('yes');
		expect(await check('1 -eq 1 -a 1 -ne 2 -a 1 -lt 2 -a 2 -le 2 -a 3 -gt 2 -a 3 -ge 3')).toBe('yes');
		expect(await check('" 7 " -eq 7')).toBe('yes');
		expect(await check('cv.md -ef ./cv.md -a /bin -ef /usr/bin')).toBe('yes');
		expect(await check('nope -ef nope')).toBe('no');
		expect(await check('cv.md -nt contact.yml -o cv.md -ot contact.yml')).toBe('no');
	});

	it('combines with !, -a, -o and parentheses', async () => {
		const {run} = setup();
		const check = async expression => run(`[ ${expression} ] && echo yes || echo no`);

		expect(await check('! -f nope')).toBe('yes');
		expect(await check('-f nope -o -d .')).toBe('yes');
		expect(await check('-f cv.md -a -f nope')).toBe('no');
		expect(await check('\\( -f nope -o -f cv.md \\) -a ! \\( -d cv.md \\)')).toBe('yes');
		expect(await check('! ! a')).toBe('yes');
	});

	it('reports malformed expressions with status 2', async () => {
		const {shell, run} = setup();

		expect(await run('[ \\( -f cv.md ]')).toBe("bash: [: `)' expected, found ]");
		expect(shell.state.status).toBe(2);
		expect(await run('[ -f = ]')).toBe('bash: [: =: unary operator expected');
		expect(await run('[ a = b = c ]')).toBe('bash: [: =: binary operator expected');
		expect(await run('[ a b ]')).toBe('bash: [: too many arguments');
		expect(await run('test a b c')).toBe('bash: test: too many arguments');
		expect(await run('[ x -eq 1 ]')).toBe('bash: [: x: integer expression expected');
		expect(shell.state.status).toBe(2);
		expect(await run('[ -f cv.md')).toBe("bash: [: missing `]'");
		expect(shell.state.status).toBe(2);
	});
});

describe('read', () => {
	it('splits a line over names, the last taking the rest', async () => {
		const {run} = setup({input: ['  one  two three  \n']});

		expect(await run('read a b; echo "[$a][$b]"')).toBe('[one][two three]');
	});

	it('splits on IFS, or not at all when it is empty', async () => {
		const {run} = setup();

		expect(await run('IFS=: read a b <<< "x:y:z"; echo "$a|$b"')).toBe('x|y:z');
		expect(await run('IFS= read line <<< "  padded  "; echo "[$line]"')).toBe('[  padded  ]');
		expect(await run('IFS= read a b <<< "x y"; echo "[$a][$b]"')).toBe('[x y][]');
	});

	it('reads into an array with -a, and into REPLY without names', async () => {
		const {run} = setup();

		expect(await run('read -a arr <<< "one two  three"; echo ${#arr[@]} ${arr[2]}')).toBe('3 three');
		expect(await run('read -a empty <<< ""; echo ${#empty[@]}')).toBe('0');
		expect(await run('IFS= read -a whole <<< "a b"; echo "${whole[0]}"')).toBe('a b');
		expect(await run('read <<< "  as is  "; echo "[$REPLY]"')).toBe('[  as is  ]');
	});

	it('takes backslashes as escapes and line continuations, unless -r', async () => {
		const {run} = setup({input: ['a\\\n', 'b\n']});

		expect(await run('read x; echo "[$x]"')).toBe('[ab]');
		expect(await run('read <<< "a\\\\b c"; echo "$REPLY"')).toBe('ab c');
		expect(await run('read -r <<< "a\\\\b c"; echo "$REPLY"')).toBe('a\\b c');
	});

	it('fails at the end of input, keeping what it got', async () => {
		const {run} = setup();

		expect(await run('printf "no newline" | { read x; echo "$? [$x]"; }')).toBe('1 [no newline]');
		expect(await run('read x < /dev/null; echo "$? [$x]"')).toBe('1 []');
	});

	it('prompts on a terminal only', async () => {
		const {run} = setup({input: ['Robin\n']});

		expect(await run('read -p "Name: " name; echo "hi $name"')).toBe('Name: hi Robin');
		expect(await run('read -sp "Name: " name <<< "Bob"; echo "hi $name"')).toBe('hi Bob');
	});

	it('needs valid names', async () => {
		const {shell, run} = setup();

		expect(await run('read 1x')).toBe("bash: read: `1x': not a valid identifier");
		expect(shell.state.status).toBe(1);
		expect(await run('read -a 2x')).toBe("bash: read: `2x': not a valid identifier");
	});
});

describe('variables', () => {
	it('export lists, marks and unmarks', async () => {
		const {shell, run} = setup();

		expect(await run('export | head -2')).toBe('declare -x COLORTERM="truecolor"\ndeclare -x HISTCONTROL="ignoredups"');
		expect(await run('export Q=\'say "$x"\'; export -p | grep Q=')).toBe('declare -x Q="say \\"\\$x\\""');
		expect(await run('FOO=1; export FOO; env | grep FOO')).toBe('FOO=1');
		expect(await run('export -n FOO; env | grep -c FOO')).toBe('0');
		expect(await run('export NEWVAR; export -p | grep -c NEWVAR')).toBe('0');
		expect(await run('export 1x')).toBe("bash: export: `1x': not a valid identifier");
		expect(shell.state.status).toBe(1);
	});

	it('local only works in functions, and shadows the global', async () => {
		const {shell, run} = setup();

		expect(await run('local x')).toBe('bash: local: can only be used in a function');
		expect(shell.state.status).toBe(1);
		expect(await run('a=global; f() { local a=1 b; local 2x; echo "[$a][$b]"; }; f; echo "$? $a"')).toBe("bash: local: `2x': not a valid identifier\n[1][]\n0 global");
	});

	it('unset removes variables and functions', async () => {
		const {shell, run} = setup();

		expect(await run('x=1; unset -v x; echo "[$x]"')).toBe('[]');
		expect(await run('f() { :; }; unset -f f; f')).toBe('bash: f: command not found');
		expect(await run('unset 1x')).toBe("bash: unset: `1x': not a valid identifier");
		expect(shell.state.status).toBe(1);
	});

	it('set lists variables, quoted, and sets the positional parameters', async () => {
		const {run} = setup();

		expect(await run('a=(x "y z"); set | grep "^a="')).toBe("a=([0]=x [1]='y z')");
		expect(await run('set | grep "^PS2\\|^HOME="')).toBe("HOME=/home/robin\nPS2='> '");
		expect(await run('set -- a b c; echo $#')).toBe('3');
		expect(await run('set -e +x; echo $#')).toBe('3');
		expect(await run('set x y; echo $1')).toBe('x');
		expect(await run('set --; echo $#')).toBe('0');
	});

	it('shift drops positional parameters, if there are enough', async () => {
		const {shell, run} = setup();

		expect(await run('set -- a b c; shift; echo $@; shift 2; echo $#; shift 5; echo $?')).toBe('b c\n0\n1');
		expect(await run('shift x')).toBe('bash: shift: x: numeric argument required');
		expect(await run('shift -1')).toBe('bash: shift: -1: numeric argument required');
		expect(shell.state.status).toBe(1);
	});

	it('let evaluates each expression, failing on zero', async () => {
		const {shell, run} = setup();

		expect(await run('let x=5 "y = x * 2"; echo $y')).toBe('10');
		expect(await run('let 0; echo $?')).toBe('1');
		expect(await run('let')).toBe('bash: let: expression expected');
		expect(shell.state.status).toBe(1);
	});
});

describe('control flow', () => {
	it('return gives a function its status, masked to a byte', async () => {
		const {shell, run} = setup();

		expect(await run('return')).toBe("bash: return: can only `return' from a function or sourced script");
		expect(shell.state.status).toBe(1);
		expect(await run('f() { return 300; }; f; echo $?')).toBe('44');
		expect(await run('f() { false; return; }; f; echo $?')).toBe('1');
	});

	it('break and continue leave loops, as many levels as asked', async () => {
		const {shell, run} = setup();

		expect(await run('for i in 1 2; do for j in a b; do echo $i$j; break 2; done; done')).toBe('1a');
		expect(await run('for i in 1 2; do for j in a b; do echo $i$j; continue 2; done; done')).toBe('1a\n2a');
		expect(await run('for i in 1 2; do break 9; done; echo $i')).toBe('1');
		expect(await run('break')).toBe("bash: break: only meaningful in a `for', `while', or `until' loop");
		expect(shell.state.status).toBe(0);
		expect(await run('continue')).toBe("bash: continue: only meaningful in a `for', `while', or `until' loop");
	});

	it('exit needs a number', async () => {
		const onExit = vi.fn();
		const {shell, run} = setup({onExit});

		expect(await run('exit abc')).toBe('bash: exit: abc: numeric argument required\nexit');
		expect(onExit).toHaveBeenCalled();
		expect(shell.exited).toBe(true);
	});

	it('exit in a subshell only leaves the subshell', async () => {
		const onExit = vi.fn();
		const {run} = setup({onExit});

		expect(await run('(exit 300); echo $?')).toBe('44');
		expect(await run('false; (exit); echo $?')).toBe('1');
		expect(onExit).not.toHaveBeenCalled();
	});

	it('eval runs its arguments as a command line', async () => {
		const {shell, run} = setup();

		expect(await run('eval "x=5; echo \\$x"')).toBe('5');
		expect(await run('eval echo a "&&" echo b')).toBe('a\nb');
		expect(await run('eval "fi"')).toBe("bash: eval: line 1: syntax error near unexpected token `fi'");
		expect(shell.state.status).toBe(2);
		expect(await run('eval; echo $?')).toBe('0');
	});
});

describe('source', () => {
	it('runs a file in the current shell', async () => {
		const {run} = setup();

		expect(await run('. /etc/os-release; echo $PRETTY_NAME')).toBe('RobinOS 1.0.0 (Web Edition)');
	});

	it('passes arguments, and returns early on return', async () => {
		stubStorage({'terminal:history': ['echo "got $1"', 'return 7', 'echo never']});
		const {run} = setup();

		expect(await run('set -- outer; source ~/.bash_history inner; echo "$? $1"')).toBe('got inner\n7 outer');
	});

	it('reports syntax errors with the file name', async () => {
		stubStorage({'terminal:history': ['fi']});
		const {shell, run} = setup();

		expect(await run('. ~/.bash_history')).toBe("bash: /home/robin/.bash_history: line 1: syntax error near unexpected token `fi'");
		expect(shell.state.status).toBe(2);
	});

	it('needs a file it can read', async () => {
		const {shell, run} = setup();

		expect(await run('source')).toBe('bash: source: filename argument required\nsource: usage: source filename [arguments]');
		expect(shell.state.status).toBe(2);
		expect(await run('source nope')).toBe('bash: nope: No such file or directory');
		expect(shell.state.status).toBe(1);
	});
});

describe('alias and unalias', () => {
	it('lists, defines and shows aliases', async () => {
		const {shell, run} = setup();

		expect(await run('alias')).toBe([
			"alias egrep='grep -E --color=auto'", "alias fgrep='grep -F --color=auto'", "alias grep='grep --color=auto'",
			"alias l.='ls -d .* --color=auto'", "alias ll='ls -l --color=auto'", "alias ls='ls --color=auto'",
		].join('\n'));
		expect(await run('alias hi="echo hi"; hi there; alias -p hi')).toBe("hi there\nalias hi='echo hi'");
		expect(await run('alias q="it\'s"; alias q')).toBe("alias q='it'\\''s'");
		expect(await run('alias nope')).toBe('bash: alias: nope: not found');
		expect(shell.state.status).toBe(1);
	});

	it('only expands a plain first word', async () => {
		const {run} = setup();

		expect(await run('alias hi="echo hi"; "hi"')).toBe('bash: hi: command not found');
		expect(await run('echo hi ll')).toBe('hi ll');
	});

	it('unalias removes one, or all', async () => {
		const {shell, run} = setup();

		expect(await run('unalias ll nope; echo $?; alias ll')).toBe('bash: unalias: nope: not found\n1\nbash: alias: ll: not found');
		expect(await run('unalias')).toBe('unalias: usage: unalias [-a] name [name ...]');
		expect(shell.state.status).toBe(2);
		expect(await run('unalias -a; alias')).toBe('');
	});
});

describe('type and command', () => {
	it('type says what each name is', async () => {
		const {shell, run} = setup();

		expect(await run('f() { echo fn; }; type -t ls cd if f cat nope; echo $?')).toBe('alias\nbuiltin\nkeyword\nfunction\nfile\n1');
		expect(await run('type f if cat')).toBe('f is a function\nf() { echo fn; }\nif is a shell keyword\ncat is /usr/bin/cat');
		expect(await run('type nope')).toBe('bash: type: nope: not found');
		expect(shell.state.status).toBe(1);
	});

	it('command -v says how a name would run', async () => {
		const {shell, run} = setup();

		expect(await run('f() { :; }; command -v ls cd cat nope if f')).toBe("alias ls='ls --color=auto'\ncd\n/usr/bin/cat\nif\nf");
		expect(shell.state.status).toBe(1);
	});

	it('command runs builtins and programs, but not functions', async () => {
		const {shell, run} = setup();

		expect(await run('command; echo $?')).toBe('0');
		expect(await run('echo() { printf "fn\\n"; }; command echo hi; echo')).toBe('hi\nfn');
		expect(await run('f() { :; }; command f')).toBe('bash: f: command not found');
		expect(shell.state.status).toBe(127);
	});
});

describe('help', () => {
	it('lists the builtins in two columns', async () => {
		const {run} = setup();

		const lines = (await run('help')).split('\n');
		expect(lines[0]).toBe('GNU bash, version 5.2.32(1)-release (riscv64-redhat-linux-gnu)');
		expect(lines[8]).toBe(' :                                       if COMMANDS; then COMMANDS; [ elif >');
		expect(lines.at(-1)).toBe(' history [-c] [-d offset] [n] or his>    { COMMANDS ; }');
	});

	it('explains the topics matching each pattern', async () => {
		const {shell, run} = setup();

		expect(await run('help cd')).toBe('cd: cd [-L|[-P [-e]] [-@]] [dir]\n    Change the shell working directory.');
		expect(await run('help ex')).toBe('exit: exit [n]\n    Exit the shell.\nexport: export [-fn] [name[=value] ...] or export -p\n    Set export attribute for shell variables.');
		expect(await run('help e')).toBe("bash: help: no help topics match `e'.  Try `help help' or `man -k e' or `info e'.");
		expect(shell.state.status).toBe(1);
	});
});

describe('history', () => {
	it('shows the last entries, numbered', async () => {
		const {run} = setup();

		await run('echo one');
		await run('echo two');
		expect(await run('history 2')).toBe('    2  echo two\n    3  history 2');
		expect(await run('history 0')).toBe('');
	});

	it('deletes an entry, or all of them', async () => {
		const {shell, run} = setup();

		await run('echo one');
		await run('history -d 1');
		expect(shell.history).toEqual(['history -d 1']);
		expect(await run('history -d 99')).toBe('bash: history: 99: history position out of range');
		expect(await run('history -d')).toBe('bash: history: : history position out of range');
		expect(await run('history x')).toBe('bash: history: x: numeric argument required');
		expect(shell.state.status).toBe(1);
		expect(await run('history -c; history')).toBe('');
		expect(shell.history).toEqual([]);
	});
});

describe('jobs', () => {
	it('lists background jobs, current and previous marked', async () => {
		vi.useFakeTimers();
		const {run} = setup({system: fakeSystem()});

		expect(await run('sleep 100 & sleep 200 & sleep 300 &')).toBe('[1] 2001\n[2] 2002\n[3] 2003');
		expect(await run('jobs')).toBe('[1]   Running                 sleep 100 &\n[2]-  Running                 sleep 200 &\n[3]+  Running                 sleep 300 &');
		expect(await run('jobs -l')).toBe('[1]   2001 Running                 sleep 100 &\n[2]-  2002 Running                 sleep 200 &\n[3]+  2003 Running                 sleep 300 &');
		expect(await run('jobs -p')).toBe('2001\n2002\n2003');
	});

	it('reports finished jobs before the next prompt, with how they ended', async () => {
		vi.useFakeTimers();
		const {shell, run} = setup({system: fakeSystem()});

		await run('sleep 1 & false & (exit 3) & sleep 100 & sleep 100 &');
		await run('kill -9 %4; kill -USR1 %5');
		await vi.advanceTimersByTimeAsync(1000);
		expect(shell.notifications()).toBe([
			'[2]   Exit 1                  false',
			'[3]   Exit 3                  (exit 3)',
			'[4]-  Killed                  sleep 100',
			'[5]+  User defined signal 1   sleep 100',
			'[1]   Done                    sleep 1',
			'',
		].join('\n'));
		expect(await run('jobs')).toBe('');
	});

	it('fg waits for a job in the foreground', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({system: fakeSystem()});

		const running = shell.execute('sleep 1 & fg %1');
		await vi.advanceTimersByTimeAsync(1000);
		await running;
		expect(tty.take()).toBe('[1] 2001\nsleep 1\n');
		expect(shell.jobs).toEqual([]);
	});

	it('^C during fg interrupts the job', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup({system: fakeSystem()});

		const running = shell.execute('(sleep 100; echo never) & fg');
		await vi.advanceTimersByTimeAsync(10);
		shell.interrupt();
		await running;
		await vi.advanceTimersByTimeAsync(200_000);
		expect(tty.take()).toBe('[1] 2001\n(sleep 100; echo never)\n');
		expect(shell.state.status).toBe(130);
	});

	it('fg needs a job', async () => {
		const {shell, run} = setup();

		expect(await run('fg')).toBe('bash: fg: current: no such job');
		expect(shell.state.status).toBe(1);
		expect(await run('fg %2')).toBe('bash: fg: %2: no such job');
	});

	it('wait waits for jobs, by number, name or pid', async () => {
		vi.useFakeTimers();
		const {shell} = setup({system: fakeSystem()});

		const running = shell.execute('sleep 1 & sleep 2 & (sleep 3; exit 5) & wait %sleep; echo $?; wait 2002 %-; echo $?; wait %9; echo $?');
		await vi.advanceTimersByTimeAsync(3000);
		await running;
		expect(shell.tty.take()).toBe('[1] 2001\n[2] 2002\n[3] 2003\n0\n0\n127\n');
		expect(await (async () => {
			const waiting = shell.execute('wait; echo $?');
			await vi.advanceTimersByTimeAsync(0);
			await waiting;
			return shell.tty.take();
		})()).toBe('5\n');
	});

	it('^C stops waiting, but leaves the job running', async () => {
		vi.useFakeTimers();
		const {shell, tty, run} = setup({system: fakeSystem()});

		const running = shell.execute('sleep 100 & wait');
		await vi.advanceTimersByTimeAsync(10);
		shell.interrupt();
		await running;
		expect(tty.take()).toBe('[1] 2001\n\n');
		expect(await run('jobs')).toBe('[1]+  Running                 sleep 100 &');
	});
});

describe('kill', () => {
	it('lists signals, or translates one', async () => {
		const {shell, run} = setup();

		expect(await run('kill -l | head -2')).toBe(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1');
		expect(await run('kill -L | tail -1')).toBe('31) SIGSYS');
		expect(await run('kill -l 9; kill -l KILL; kill -l sigterm; kill -l 137')).toBe('KILL\n9\n15\nKILL');
		expect(await run('kill -l BOGUS')).toBe('bash: kill: BOGUS: invalid signal specification');
		expect(shell.state.status).toBe(1);
	});

	it('takes the signal as -s, -n or -NAME', async () => {
		const system = fakeSystem({processes: () => [{pid: 1402, name: 'web', started: new Date()}]});
		const {run} = setup({system});

		await run('kill -s KILL 1402; kill -n 1 1402; kill -SIGUSR1 1402; kill -2 1402; kill -- 1402');
		expect(system.kill.mock.calls).toEqual([[1402, 'KILL'], [1402, 'HUP'], [1402, 'USR1'], [1402, 'INT'], [1402, 'TERM']]);
	});

	it('only checks with signal 0, and lets harmless signals through', async () => {
		const system = fakeSystem({processes: () => [{pid: 1402, name: 'web', started: new Date()}]});
		const {shell, run} = setup({system});

		expect(await run('kill -0 1402; kill -CONT 1402; kill -0 1290')).toBe('');
		expect(shell.state.status).toBe(0);
		expect(system.kill).not.toHaveBeenCalled();
		expect(await run('kill -0 1')).toBe('bash: kill: (1) - Operation not permitted');
	});

	it('complains about bad signals and targets', async () => {
		const {shell, run} = setup();

		expect(await run('kill -s BOGUS 1')).toBe('bash: kill: BOGUS: invalid signal specification');
		expect(await run('kill -n')).toBe('bash: kill: : invalid signal specification');
		expect(await run('kill -BOGUS 1')).toBe('bash: kill: BOGUS: invalid signal specification');
		expect(await run('kill %5 abc 99999')).toBe('bash: kill: %5: no such job\nbash: kill: abc: arguments must be process or job IDs\nbash: kill: (99999) - No such process');
		expect(shell.state.status).toBe(1);
		expect(await run('kill')).toBe('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
		expect(shell.state.status).toBe(2);
	});

	it('the shell shrugs off TERM, but not KILL', async () => {
		const onExit = vi.fn();
		const {shell, run} = setup({onExit});

		expect(await run('kill $$; kill -INT $$; kill -STOP $$; echo $?')).toBe('0');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onExit).not.toHaveBeenCalled();

		await run('kill -9 $$');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onExit).toHaveBeenCalledTimes(1);
		expect(shell.exited).toBe(true);
	});

	it('kills jobs by spec', async () => {
		vi.useFakeTimers();
		const {run} = setup({system: fakeSystem()});

		await run('sleep 100 & sleep 200 & sleep 300 &');
		expect(await run('kill %- %%; wait %2; echo $?; wait %3; echo $?')).toBe('143\n143');
		expect(await run('jobs')).toBe('[1]+  Running                 sleep 100 &');
		expect(await run('kill %sl; wait; echo $?')).toBe('143');
	});
});
