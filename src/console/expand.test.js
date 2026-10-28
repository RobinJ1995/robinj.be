import {describe, it, expect, beforeEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';

beforeEach(() => {
	stubStorage();
});

describe('brace expansion', () => {
	it('expands sequences of numbers and letters, with steps and padding', async () => {
		const {run} = setup();

		expect(await run('echo {1..3} {3..1} {-1..1} {1..10..4} {10..1..-3}')).toBe('1 2 3 3 2 1 -1 0 1 1 5 9 10 7 4 1');
		expect(await run('echo {01..03} {-02..1}')).toBe('01 02 03 -02 -01 000 001');
		expect(await run('echo {a..e..2} {C..A}')).toBe('a c e C B A');
	});

	it('expands lists, nested, around quoted text', async () => {
		const {run} = setup();

		expect(await run('echo {a,{b,c}}d')).toBe('ad bd cd');
		expect(await run('echo {a,"b c"}')).toBe('a b c');
		expect(await run('echo "{a,b}" x{y {}')).toBe('{a,b} x{y {}');
		expect(await run('echo pre{"$HOME",x}')).toBe('pre/home/robin prex');
		expect(await run('echo {a..}')).toBe('{a..}');
	});

	it('refuses to make too many words', async () => {
		const {shell, run} = setup();

		expect(await run('echo {1..200000}')).toBe('bash: brace expansion: failed to allocate memory for 200000 elements');
		expect(shell.state.status).toBe(1);
		expect(await run('echo {1..400}{1..400}')).toBe('bash: brace expansion: failed to allocate memory for 100400 elements');
	});
});

describe('tilde expansion', () => {
	it('expands home directories and the working directories', async () => {
		const {run} = setup();

		expect(await run('echo ~ ~/x ~robin/y ~root ~+')).toBe('/home/robin /home/robin/x /home/robin/y /root /home/robin/portfolio');
		expect(await run('cd /tmp; echo ~-; cd ~-')).toBe('/home/robin/portfolio');
	});

	it('leaves unknown users, quoted tildes and tildes mid-word alone', async () => {
		const {run} = setup();

		expect(await run('echo ~nobody "~" a~ ~-')).toBe('~nobody ~ a~ ~-');
		expect(await run('echo ~"$USER"')).toBe('~robin');
		expect(await run('HOME=/tmp; echo ~')).toBe('/tmp');
	});
});

describe('parameter expansion', () => {
	it('knows the special parameters', async () => {
		const {run} = setup();

		expect(await run('echo $- $0 ${#RANDOM} $SECONDS $UID $EUID')).toMatch(/^himBHs bash [1-5] 0 1000 1000$/);
		expect(await run('echo $EPOCHSECONDS')).toMatch(/^\d{10}$/);
		expect(await run('x=$!; echo "[$x]"; sleep 0 & x=$!; echo "[$x]"')).toMatch(/^\[\]\n\[1\] (\d+)\n\[\1\]$/);
	});

	it('takes lengths of values, arrays and the positional parameters', async () => {
		const {run} = setup();

		expect(await run('x=héllo; a=(1 22 333); set -- p q; echo ${#x} ${#a[@]} ${#a[2]} ${#@} ${#*} ${#}')).toBe('5 3 3 2 2 2');
		expect(await run('echo ${#nope}')).toBe('0');
	});

	it('uses defaults, assigns them, or insists on a value', async () => {
		const {shell, run} = setup();

		expect(await run('unset u; e=; echo ${u-default} ${e-default} ${e:-default} [${u+alt}] ${e+alt} [${e:+alt}] ${HOME:+alt}')).toBe('default default [] alt [] alt');
		expect(await run('echo ${u=assigned} $u ${e:=filled} $e')).toBe('assigned assigned filled filled');
		expect(await run('unset u; echo ${u?}')).toBe('bash: u: parameter null or not set');
		expect(shell.state.status).toBe(1);
		expect(await run('e=; echo ${e:?is empty}')).toBe('bash: e: is empty');
		expect(await run('echo ${HOME?} ${HOME:?}')).toBe('/home/robin /home/robin');
	});

	it('cannot assign defaults to positional parameters or elements', async () => {
		const {run} = setup();

		expect(await run('set --; echo ${1:=x}')).toBe('bash: $1: cannot assign in this way');
		expect(await run('a=(); echo ${a[0]:=x}')).toBe('bash: $a: cannot assign in this way');
	});

	it('treats an empty list as missing', async () => {
		const {run} = setup();

		expect(await run('set --; echo ${@:-none} ${*-none}')).toBe('none none');
		expect(await run('set -- a; echo ${@:-none}')).toBe('a');
	});

	it('removes the shortest or longest prefix and suffix', async () => {
		const {run} = setup();

		expect(await run('x=a.b.c; echo ${x#*.} ${x##*.} ${x%.*} ${x%%.*} ${x#z} ${x%"."c}')).toBe('b.c c a.b a a.b.c a.b');
		expect(await run('set -- one.md two.md; echo ${@%.md}; a=(x.1 y.1); echo "${a[@]%.1}"')).toBe('one two\nx y');
	});

	it('replaces the first, every, a leading or a trailing match', async () => {
		const {run} = setup();

		expect(await run('x=aXbXc; echo ${x/X} ${x//X/-} ${x/#a/A} ${x/%c/C} ${x/#X/?} ${x//} ${x/X/"*"}')).toBe('abXc a-b-c AXbXc aXbXC aXbXc aXbXc a*bXc');
		expect(await run('set -- ab ac; echo ${@/a/x}; a=(m n); echo ${a[*]//?/z}')).toBe('xb xc\nz z');
		expect(await run('x="a b"; echo ${x/ /_} ${x// }')).toBe('a_b ab');
	});

	it('changes case', async () => {
		const {run} = setup();

		expect(await run('x=hello; X=HELLO; echo ${x^} ${x^^} ${X,} ${X,,} ${x,}')).toBe('Hello HELLO hELLO hello hello');
		expect(await run('set -- ab cd; echo ${@^^} ${*^}')).toBe('AB CD Ab Cd');
	});

	it('takes substrings, counting from either end', async () => {
		const {shell, run} = setup();

		expect(await run('x=abcdef; echo ${x:1:2} ${x: -2} ${x:2} ${x:1:-1} ${x:(-3):2} ${x:10} ${x:}')).toBe('bc ef cdef bcde de abcdef');
		expect(await run('set -- a b c; echo ${@:2} ${@:0:2} ${@: -1}')).toBe('b c bash a c');
		expect(await run('a=(x y z); echo ${a[@]:1} ${a[*]:0:1}')).toBe('y z x');
		expect(await run('x=abc; echo ${x:2:-2}')).toBe('bash: -2: substring expression < 0');
		expect(shell.state.status).toBe(1);
	});

	it('expands indirectly through another variable', async () => {
		const {shell, run} = setup();

		expect(await run("eval 'x=y; y=z; echo ${!x}'")).toBe('z');
		expect(await run("eval 'set -- one; n=1; echo ${!n}'")).toBe('one');
		expect(await run("eval 'x=\"bad name\"; echo ${!x}'")).toBe('bash: bad name: invalid indirect expansion');
		expect(shell.state.status).toBe(1);
	});

	it('reads array elements, counting from the end when negative', async () => {
		const {run} = setup();

		expect(await run('a=(x y z); i=1; echo ${a[0]} ${a[i+1]} ${a} [${a[5]}]')).toBe('x z x []');
		expect(await run('s=plain; echo ${s[0]} [${s[1]}] ${s[@]}')).toBe('plain [] plain');
		expect(await run('echo [${nope[0]}] [${nope[@]}]')).toBe('[] []');
	});

	it('reads elements of sparse arrays, counting back from the end when negative', async () => {
		const {run} = setup();

		expect(await run('a[5]=x; echo "[${a[5]}]" ${#a[@]} ${a[-1]}')).toBe('[x] 1 x');
		expect(await run('b=(x y z); echo ${b[-1]} ${b[-3]} ${#b[-2]}')).toBe('z x 1');
	});

	it('keeps the quoted parts of a default as they are, splitting and globbing the rest', async () => {
		const {run} = setup();

		expect(await run('unset u; x="1  2"; printf "[%s]" ${u:-"a  b"} ${u:-a  b} ${u:-"*"} ${u:-\\*} ${u:-""} ${u:-$x} ${u:-"$x"} ${HOME:+"x  y"} ${u:-~}; echo')).toBe('[a  b][a][b][*][*][][1][2][1  2][x  y][/home/robin]');
		expect(await run('echo ${u:-*.md} "${u:-*.md}"')).toBe('cv.md *.md');
	});

	it('quotes operands as words, with spaces kept', async () => {
		const {run} = setup();

		expect(await run("unset u; echo ${u:-'single'} ${u:-\"double $USER\"} ${u:-\\$} ${u:-$HOME} ${u:-$}")).toBe('single double robin $ /home/robin $');
		expect(await run('unset u; echo ${u:-{braces}} ${u:-`echo tick`}')).toBe('{braces} tick');
		expect(await run('x=abc; echo ${x:${#x}-2:1} ${x:$((1)):1}')).toBe('b b');
	});

	it('reports substitutions it cannot make', async () => {
		const {shell, run} = setup();

		expect(await run('echo ${x@Q}')).toBe('bash: ${x@Q}: bad substitution');
		expect(shell.state.status).toBe(1);
		expect(await run('echo ${#x:1}')).toBe('bash: ${#x:1}: bad substitution');
		expect(await run('echo ${}')).toBe('bash: ${}: bad substitution');
		expect(await run('echo ${#}')).toBe('0');
		expect(await run('echo ${%x}')).toBe('bash: ${%x}: bad substitution');
	});
});

describe('quoting and word splitting', () => {
	it('keeps "$@" as separate words and joins "$*" with IFS', async () => {
		const {run} = setup();

		expect(await run('set -- "a b" c; for w in "$@"; do echo "[$w]"; done')).toBe('[a b]\n[c]');
		expect(await run('set -- "a b" c; IFS=,; echo "$*"; echo "${@}"')).toBe('a b,c\na b c');
		expect(await run('a=("x y" z); for w in "${a[@]}"; do echo "[$w]"; done; IFS=-; echo "${a[*]}"')).toBe('[x y]\n[z]\nx y-z');
		expect(await run('set --; for w in "$@"; do echo never; done; echo "[$*]"')).toBe('[]');
		expect(await run('IFS=; set -- a b; echo "$*"')).toBe('ab');
	});

	it('splits unquoted expansions on IFS, keeping empty fields between non-blank separators', async () => {
		const {run} = setup();

		expect(await run('x="  a  b  "; for w in $x; do echo "[$w]"; done')).toBe('[a]\n[b]');
		expect(await run('IFS=:; x="a::b:"; for w in $x; do echo "[$w]"; done')).toBe('[a]\n[]\n[b]');
		expect(await run('IFS=" :"; x="a : b"; for w in $x; do echo "[$w]"; done')).toBe('[a]\n[b]');
		expect(await run('IFS=; x="a b"; for w in $x; do echo "[$w]"; done')).toBe('[a b]');
		expect(await run('unset IFS; x="a b"; for w in $x; do echo "[$w]"; done')).toBe('[a]\n[b]');
		expect(await run('x=; for w in $x "" "$x"; do echo "[$w]"; done')).toBe('[]\n[]');
	});

	it('does not split assignments, and joins lists in them', async () => {
		const {run} = setup();

		expect(await run('x="a  b"; y=$x; echo "$y"')).toBe('a  b');
		expect(await run('set -- 1 2; y=$@; echo "$y"; z=$((3 + 4)); echo $z')).toBe('1 2\n7');
	});
});

describe('pathname expansion', () => {
	it('matches names in a directory, but not hidden ones unless asked', async () => {
		const {run} = setup();

		expect(await run('echo /etc/host?ame /etc/[ph]* /etc/[^ph]*')).toBe('/etc/hostname /etc/hostname /etc/passwd /etc/os-release /etc/robinj-release /etc/shadow');
		expect(await run('cd ~; echo * .* .[bk]*')).toBe('portfolio .bash_history .kube .profile .bash_history .kube');
		expect(await run('echo /etc/*[[:digit:]]* /etc/[[:alpha:]]ostname /etc/[[:bogus:]h]ostname')).toBe('/etc/*[[:digit:]]* /etc/hostname /etc/hostname');
	});

	it('matches directories only with a trailing slash, across several levels', async () => {
		const {run} = setup();

		expect(await run('echo /e*/ /usr/*/ /*/b*')).toBe('/etc/ /usr/bin/ /usr/lib/ /usr/share/ /bin/bash /usr/bin');
		expect(await run('echo ~/*/*.md')).toBe('/home/robin/portfolio/cv.md');
		expect(await run('echo */')).toBe('*/');
	});

	it('leaves patterns that match nothing, or quoted or escaped ones, as they are', async () => {
		const {run} = setup();

		expect(await run('echo /root/* /nope/* \\* "*" /etc/\\h* /etc/[h')).toBe('/root/* /nope/* * * /etc/hostname /etc/[h');
		expect(await run('echo /etc/[]h]ostname /etc/[\\h]ostname /etc/[a-i]ostname')).toBe('/etc/hostname /etc/hostname /etc/hostname');
	});
});

describe('patterns in case and [[ ]]', () => {
	it('match globs, with quoted characters taken literally', async () => {
		const {run} = setup();

		expect(await run('case "a*" in "a*") echo literal;; esac; case ab in "a*") echo never;; a*) echo glob;; esac')).toBe('literal\nglob');
		expect(await run('[[ x.md == *.md && ! x.md == "*.md" && "a?" == a\\? ]] && echo yes')).toBe('yes');
		expect(await run('[[ a != b ]] && [[ a = a ]] && echo yes')).toBe('yes');
		expect(await run('[[ "x]" == [x][\\]] ]] && [[ - == [a-] ]] && [[ 5 == [[:digit:]] ]] && echo yes')).toBe('yes');
	});

	it('=~ takes quoted parts literally, and reports bad regexes as status 2', async () => {
		const {shell, run} = setup();

		expect(await run('[[ a.b =~ ^a"."b$ ]] && [[ ! axb =~ ^a"."b$ ]] && echo yes')).toBe('yes');
		expect(await run('[[ abc =~ x ]] || echo "no ${#BASH_REMATCH[@]}"')).toBe('no 0');
		expect(await run('[[ abc =~ ( ]]; echo $?')).toBe('2');
		expect(shell.state.status).toBe(0);
	});

	it('compares numbers arithmetically inside [[ ]]', async () => {
		const {run} = setup();

		expect(await run('x=3; [[ x+1 -eq 4 && 010 -eq 8 && 2 -lt 10 ]] && echo yes')).toBe('yes');
		expect(await run('[[ b < a ]] || echo no')).toBe('no');
		expect(await run('[[ cv.md -ef ./cv.md ]] && echo same')).toBe('same');
	});
});

describe('arithmetic expansion', () => {
	it('expands variables and command substitutions first', async () => {
		const {run} = setup();

		expect(await run('x=4; echo $(( $x * $(echo 2) + "1" ))')).toBe('9');
		expect(await run('echo $((x = 5)) $x')).toBe('5 5');
	});

	it('reports a variable that refers to itself, as bash does, and carries on', async () => {
		const {run} = setup();

		expect(await run("x='x + 1'; echo $((x)); echo $?")).toBe('bash: x + 1: expression recursion level exceeded (error token is "x + 1")\n1');
		expect(await run('echo $((2 + 2))')).toBe('4');
	});

	it('reports errors with the offending token', async () => {
		const {shell, run} = setup();

		expect(await run('echo $((1/0))')).toBe('bash: 1/0: division by 0 (error token is "/0")');
		expect(shell.state.status).toBe(1);
		expect(await run('echo $(( x + ))')).toBe('bash: x +: syntax error: operand expected (error token is "+")');
	});
});
