import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';

const USAGE = 'Usage: awk [POSIX or GNU style options] -f progfile [--] file ...';

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('awk programs', () => {
	it('runs BEGIN, the rules for each record, then END', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print \"hello\", 1+2, 3/2, 2^10, -2^2, 7%3, 2**3, 2^3^2 }'")).toBe('hello 3 1.5 1024 -4 1 8 512');
		expect(await run("printf 'one 1\\ntwo 2\\nthree 3\\n' | awk '$2 > 1 { print NR\": \"$1 } END { print \"total\", NR }'")).toBe('2: two\n3: three\ntotal 3');
		expect(await run("awk -F: '$3 >= 1000 { print $1 }' /etc/passwd")).toBe('robin');
		expect(await run("awk '/^r/' /etc/passwd")).toBe('root:x:0:0:Super User:/root:/bin/bash\nrobin:x:1000:1000:Robin Jacobs:/home/robin:/bin/bash');
		expect(await run("awk 'END { print NR }' /etc/passwd /etc/hostname")).toBe('4');
		expect(await run("awk 'BEGIN { x = 1 } BEGIN { print x + 1 }'")).toBe('2');
	});

	it('matches ranges, from the record that starts one to the one that ends it', async () => {
		const {run} = setup();

		expect(await run("seq 10 | awk 'NR == 3, NR == 5'")).toBe('3\n4\n5');
		expect(await run("seq 5 | awk '/3/, 0 { print \"r\", $0 }'")).toBe('r 3\nr 4\nr 5');
		expect(await run("seq 6 | awk '$0 % 3 == 1, $0 % 3 == 1'")).toBe('1\n4');
	});

	it('takes programs over several lines, with comments and continued lines', async () => {
		const {run} = setup();

		expect(await run([
			"awk '",
			'BEGIN {',
			'\t# a comment',
			'\ttotal = 0',
			'}',
			'{ total += $3 }',
			'END {',
			'\tprint "sum", \\',
			'\t\ttotal',
			"}' FS=: /etc/passwd",
		].join('\n'))).toBe('sum 1001');
	});

	it('reads the program from files, and options from wherever they are', async () => {
		const {run} = setup();

		expect(await run("awk -e 'BEGIN { print \"e\" }' --source 'BEGIN { print \"s\" }'")).toBe('e\ns');
		expect(await run("echo 'BEGIN { print \"from stdin\" }' | awk -f -")).toBe('from stdin');
		expect(await run("awk --field-separator=: --assign=n=2 '{ print $n }' /etc/passwd")).toBe('x\nx\nx');
		expect(await run("awk -F : '{ print $1 }' /etc/hostname")).toBe('robinj.be');
	});
});

describe('awk records and fields', () => {
	it('splits on blanks by default, and rebuilds the record when a field changes', async () => {
		const {run} = setup();

		expect(await run("echo 'a b c' | awk '{ print $2, NF, $NF; $2 = \"X\"; print; print NF }'")).toBe('b 3 c\na X c\n3');
		expect(await run("echo '3 4' | awk '{ print $(1), $1 * $2, $NF-1, $(NF-1) }'")).toBe('3 12 3 3');
		expect(await run("echo 'a b c d' | awk '{ NF = 2; print; print NF; $5 = \"e\"; print; print NF }'")).toBe('a b\n2\na b   e\n5');
		expect(await run("echo 'a b' | awk 'BEGIN { OFS = \"-\"; ORS = \"|\\n\" } { print $1, $2; $1 = $1; print }'")).toBe('a-b|\na-b|');
		expect(await run("awk 'BEGIN { $0 = \"x y z\"; print NF, $2; print length; $3 = \"\"; print; $0 = \"\"; print NF }'")).toBe('3 y\n5\nx y \n0');
		expect(await run("printf '  a   b  \\n' | awk -F' ' '{ print NF, $1 }'")).toBe('2 a');
	});

	it('splits on one character literally, on longer separators as a regular expression, or into characters', async () => {
		const {run} = setup();

		expect(await run("echo 'a,,b,' | awk -F, '{ print NF; for (i = 1; i <= NF; i++) printf \"[%s]\", $i; print \"\" }'")).toBe('4\n[a][][b][]');
		expect(await run("echo 'a.b|c' | awk -F. '{ print $2 }'")).toBe('b|c');
		expect(await run("echo 'a1b22c333d' | awk -F'[0-9]+' '{ print NF, $1, $4 }'")).toBe('4 a d');
		expect(await run("echo 'abc' | awk 'BEGIN { FS = \"\" } { print NF, $2 }'")).toBe('3 b');
		expect(await run("printf 'a\\tb c\\td\\n' | awk -F'\\t' '{ print $2 }'")).toBe('b c');
		expect(await run("printf 'a\\tb c\\td\\n' | awk -Ft '{ print $2 }'")).toBe('b c');
		expect(await run("echo 'x--y' | awk -F'-*' '{ print $2 }'")).toBe('y');
		expect(await run("echo | awk -F, '{ print NF }'")).toBe('0');
		expect(await run("printf 'axxbxc' | awk 'BEGIN { RS = \"x*\" } { print }'")).toBe('a\nb\nc');
	});

	it('changes FS for the next record, not this one', async () => {
		const {run} = setup();

		expect(await run("printf 'a:b c\\nd:e f\\n' | awk '{ print $1; FS = \":\" }'")).toBe('a:b\nd');
	});

	it('reads records separated by other characters, blank lines, or a regular expression', async () => {
		const {run} = setup();

		expect(await run("printf 'a,b;c,d;' | awk 'BEGIN { RS = \";\"; FS = \",\" } { print $2 }'")).toBe('b\nd');
		expect(await run("printf '\\na b\\n\\nc d\\ne f\\n\\n\\ng\\n' | awk 'BEGIN { RS = \"\" } { print NR\": \"$0\" (\"NF\")\" }'")).toBe('1: a b (2)\n2: c d\ne f (4)\n3: g (1)');
		expect(await run("printf 'a:b\\nc\\n\\nd' | awk 'BEGIN { RS = \"\"; FS = \":\" } { print NF }'")).toBe('3\n1');
		expect(await run("printf 'a\\n\\n\\nb\\nc\\n\\n' | awk 'BEGIN { RS = \"\\n\\n+\" } { print NR \":\" $0 \":\" length(RT) }'")).toBe('1:a:3\n2:b\nc:2');
		expect(await run("printf 'last' | awk '{ print $0 \"|\" RT \"|\" }'")).toBe('last||');
	});

	it('knows where it is: NR, FNR, FILENAME, and what the last record was at the END', async () => {
		const {run} = setup();

		expect(await run("awk '{ print FILENAME, FNR, NR }' /etc/hostname /etc/hostname")).toBe('/etc/hostname 1 1\n/etc/hostname 1 2');
		expect(await run("echo x | awk '{ print FILENAME \"|\" FNR }' - /etc/hostname")).toBe('-|1\n/etc/hostname|1');
		expect(await run("echo x | awk '{ print \"[\" FILENAME \"]\" }'")).toBe('[]');
		expect(await run("printf 'a\\nb c\\n' | awk 'END { print $0, NF, NR }'")).toBe('b c 2 2');
	});

	it('takes var=value operands as it gets to them, and ARGV as it is by then', async () => {
		const {run} = setup();

		expect(await run("awk '{ print x, $0 }' x=1 /etc/hostname x=2 /etc/hostname")).toBe('1 robinj.be\n2 robinj.be');
		expect(await run("awk 'BEGIN { print ARGC, ARGV[0], ARGV[1]; ARGV[1] = \"/etc/hostname\" } { print }' nope")).toBe('2 awk nope\nrobinj.be');
		expect(await run("awk 'BEGIN { ARGV[1] = \"\" } { print }' nope < /etc/hostname")).toBe('robinj.be');
		expect(await run("awk 'BEGIN { print ENVIRON[\"HOME\"], ENVIRON[\"SHLVL\"] + 1 }'")).toBe('/home/robin 2');
		expect(await run("awk -v x='a\\tb' -v n=010 'BEGIN { print x, n + 1, (n == 10) }'")).toBe('a\tb 11 1');
	});

	it('skips directories and gives up on files that are not there', async () => {
		const {shell, run} = setup();

		expect(await run("awk 1 /etc /etc/hostname")).toBe("awk: warning: command line argument `/etc' is a directory: skipped\nrobinj.be");
		expect(shell.state.status).toBe(0);
		expect(await run('awk 1 /nope')).toBe("awk: fatal: cannot open file `/nope' for reading: No such file or directory");
		expect(shell.state.status).toBe(2);
	});

	it('only reads input when there are rules or an END for it', async () => {
		const {run} = setup({input: ['typed\n']});

		expect(await run("awk 'BEGIN { print \"no input\" }'")).toBe('no input');
		expect(await run("awk 'END { print NR, $0 }'")).toBe('1 typed');
	});
});

describe('awk expressions', () => {
	it('concatenates, does arithmetic and assigns in all the usual ways', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print 1 \" \" 2+3, 2 -1, \"a\" -1, 10 % 3 * 2, -\"3x\", +\"4\" }'")).toBe('1 5 1 -1 2 -3 4');
		expect(await run("awk 'BEGIN { i = 1; print i++ + ++i, i; x = y = 3; print x, y; x += 2; x -= 1; x *= 3; x /= 2; x %= 4; x ^= 2; print x }'")).toBe('4 3\n3 3\n4');
		expect(await run("awk 'BEGIN{x=5;x++;print x--;print x; $0 = \"1 2\"; $2++; ++$1; print; a[\"k\"]--; print a[\"k\"] }'")).toBe('6\n5\n2 3\n-1');
		expect(await run("awk 'BEGIN { print 1 ? 2 ? \"a\" : \"b\" : \"c\", 0 ? \"x\" : \"y\", !0, !1, !\"\", !\"a\" }'")).toBe('a y 1 0 1 0');
		expect(await run("awk 'BEGIN { print (1 || x++), x + 0, (0 && y++), y + 0, (1 && 2), (0 || \"\") }'")).toBe('1 0 0 0 1 0');
	});

	it('compares as numbers when both sides look like numbers, and as strings otherwise', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print 1 == 1.0, \"a\" < \"b\", \"10\" < \"9\", 10 < 9, 2 >= 2, 1 != 1, 3 <= 2, (\"b\" > \"a\") }'")).toBe('1 1 1 0 1 0 0 1');
		expect(await run("echo '10 9' | awk '{ print ($1 < $2), ($1 < \"9\"), ($1 == 10.0) }'")).toBe('0 1 1');
		expect(await run("echo '10' | awk '{ a = $1; b = \"9\"; print (a < b), (a < 9) }'")).toBe('1 0');
		expect(await run("awk 'BEGIN { x; print (x == 0), (x == \"\"), length(x) }'")).toBe('1 1 0');
		expect(await run("echo ' 0 ' | awk '{ print ($1 ? \"t\" : \"f\"), ($0 ? \"t\" : \"f\") }'")).toBe('f f');
		expect(await run("awk 'BEGIN { x = 0 / 1; y = log(-1); print (y < 1), (y == y), (y != y) }'")).toBe('0 0 1');
	});

	it('matches regular expressions, literal or made of strings', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print (\"abc\" ~ \"b\"), (\"abc\" !~ /^b/), (\"a.c\" ~ \"a\\\\.c\"), (\"abc\" ~ \"a\\\\.c\") }'")).toBe('1 1 1 0');
		expect(await run("awk 'BEGIN { s = \"a1b22\"; gsub(/[[:digit:]]+/, \"#\", s); print s; s = \"A-z\"; gsub(/[^[:alpha:]]/, \"\", s); print s }'")).toBe('a#b#\nAz');
		expect(await run("awk 'BEGIN { s = \"the cat scat\"; gsub(/\\ycat\\y/, \"dog\", s); print s; print match(\"aaa\", /a{2}/), RLENGTH; print match(\"a{\", /{/) }'")).toBe('the dog scat\n1 2\n2');
		expect(await run("awk 'BEGIN { print (\"a]\" ~ /[]]/), (\"x/y\" ~ /x\\/y/), (\"x/y\" ~ /[/]/), (\"a\\tb\" ~ /\\t/), (\"[\" ~ /[[]/) }'")).toBe('1 1 1 1 1');
		expect(await run("awk 'BEGIN { print (\"b\" ~ /[^a]/), (\"-\" ~ /[a-]/), (\"x\" ~ /\\x78/), (\"ab\" ~ /a|z/) }'")).toBe('1 1 1 1');
		expect(await run("awk 'BEGIN { print (\"ab\" ~ /\\`a/), (\"ab\" ~ /b\\'\"'\"'/), (sprintf(\"%c\", 8) ~ /\\b/), (sprintf(\"%c\", 7) ~ /\\a/), (\"]\" ~ /[\\]]/), (\"a\\\\\" ~ /a\\\\/) }'")).toBe('1 1 1 1 1 1');
		expect(await run("awk 'BEGIN { print \"\\101\\x42\\q\\xz\", \"a\\\nb\", (\"}\" ~ /}/) }'")).toBe('ABqxz ab 1');
		expect(await run("awk 'BEGIN { x **= 2; $++i = \"f\"; getline a[1] < \"/etc/hostname\"; print x, $1, a[1] }\r\nfunc f() {}'")).toBe('0 f robinj.be');
		expect(await run("awk 'BEGIN { print 1 + \\\r\n2 }'")).toBe('3');
		expect(await run("printf 'yes\\nno\\n' | awk '/y/ ? \"m\" : \"n\"'")).toBe('yes\nno');
	});

	it('keeps arrays, with several subscripts, and knows what is in them', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { x[\"a\"] = 1; x[\"b\"] = 2; for (k in x) s += x[k]; print s, length(x), (\"a\" in x), (\"z\" in x) }'")).toBe('3 2 1 0');
		expect(await run("awk 'BEGIN { a[1, 2] = \"x\"; for (k in a) { split(k, p, SUBSEP); print p[1], p[2] } print ((1, 2) in a), ((2, 1) in a) }'")).toBe('1 2\n1 0');
		expect(await run("awk 'BEGIN { if (!(\"k\" in u)) print \"no k\"; print length(u); u[1]; print length(u) }'")).toBe('no k\n0\n1');
		expect(await run("awk 'BEGIN { x[\"a\"]; x[\"b\"]; x[\"c\"]; for (k in x) { delete x[\"c\"]; n++ } print n; delete x; print length(x) }'")).toBe('2\n0');
		expect(await run("awk 'BEGIN { a[0.1] = 1; a[01] = 2; for (k in a) print k }'")).toBe('0.1\n1');
		expect(await run("awk 'BEGIN { a[10]; a[9]; for (k in a) if (k > 9) print k }'")).toBe('10');
	});

	it('prints numbers as integers when they are, and with OFMT or CONVFMT when not', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { x = 0.1 + 0.2; print x; CONVFMT = \"%.2f\"; y = x \"\"; print y; OFMT = \"%.3f\"; print x, 1.0 }'")).toBe('0.3\n0.30\n0.300 1');
		expect(await run("awk 'BEGIN { print 1e6, 1e30, 100000 * 100000, 0.000001, -0, 1e300 * 1e300, -1e300 * 1e300, log(-1) }'")).toBe('1000000 1000000000000000019884624838656 10000000000 1e-06 -0 inf -inf nan');
		expect(await run("awk 'BEGIN { print 0x1A, 1e3, .5, 5., \"0x1A\" + 0 }'")).toBe('26 1000 0.5 5 0');
		expect(await run("awk 'BEGIN { OFMT = \"%.2f%s|\"; print 0.5 }'")).toBe('0.50|');
	});
});

describe('awk statements', () => {
	it('loops, and breaks out of and continues them', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { i = 0; while (i < 3) { i++; if (i == 2) continue; print i } do { print \"do\" } while (0) }'")).toBe('1\n3\ndo');
		expect(await run("awk 'BEGIN { for (i = 0; i < 5; i++) { if (i == 3) break; print i } }'")).toBe('0\n1\n2');
		expect(await run("awk 'BEGIN { while (i++ < 3) ; print i; for (;j < 2;) j++; print j; for (k = 0; k < 2; k++); print k }'")).toBe('4\n2\n2');
		expect(await run("awk 'BEGIN { do { n++; if (n > 2) break; continue } while (1); print n; a[1]; for (k in a) { break } for (k in a) continue; print k }'")).toBe('3\n1');
		expect(await run("awk 'BEGIN { if (1) ; else print \"no\"; if (0) print \"no\"; else if (1) print \"yes\"\nelse print \"no\" }'")).toBe('yes');
	});

	it('skips to the next record or the next file', async () => {
		const {run} = setup();

		expect(await run("seq 4 | awk '$0 % 2 { next } { print }'")).toBe('2\n4');
		expect(await run("awk 'FNR == 1 { print; nextfile } { print \"never\" }' /etc/passwd /etc/hostname")).toBe('root:x:0:0:Super User:/root:/bin/bash\nrobinj.be');
	});

	it('exits with a status, after running the END rules', async () => {
		const {shell, run} = setup();

		expect(await run("awk 'BEGIN { exit 3 } END { print \"end ran\" }'")).toBe('end ran');
		expect(shell.state.status).toBe(3);
		expect(await run("seq 5 | awk '$0 == 2 { exit } END { print NR; exit }'")).toBe('2');
		expect(shell.state.status).toBe(0);
		expect(await run("awk 'END { exit 4; print \"no\" } END { print \"never\" }' < /dev/null")).toBe('');
		expect(shell.state.status).toBe(4);
		expect(await run("awk 'BEGIN { exit -1 }'; echo $?")).toBe('255');
	});

	it('has functions, with local variables, recursion, and arrays passed by reference', async () => {
		const {run} = setup();

		expect(await run("awk 'function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) } BEGIN { print fact(10) }'")).toBe('3628800');
		expect(await run("awk 'function g(a, b,   loc) { loc = a + b; return loc } BEGIN { print g(1, 2), loc \"|\" g(5) }'")).toBe('3 |5');
		expect(await run("awk 'function fill(arr) { arr[\"k\"] = 1 } BEGIN { fill(z); print length(z), z[\"k\"] }'")).toBe('1 1');
		expect(await run("awk 'function inner(a) { a[1] = 9 } function outer(b) { inner(b) } BEGIN { outer(z); print z[1] }'")).toBe('9');
		expect(await run("awk 'function set(s) { s = 5; return } BEGIN { x = 1; set(x); print x, set(x) \"|\" }'")).toBe('1 |');
		expect(await run("awk 'function local(a,   t) { t[1] = a; return length(t) } BEGIN { print local(1) local(2) }'")).toBe('11');
		expect(await run("awk 'function h(n) { if (n > 0) h(n - 1); else print \"bottom\" } BEGIN { h(500) }'")).toBe('bottom');
		expect(await run("awk 'function s(x) { x[1] = 1 } BEGIN { s(1) }'")).toBe("awk: cmd. line:1: fatal: attempt to use scalar `x' as an array");
	});

	it('reads uninitialised arguments as nothing, and fields as getline targets', async () => {
		const {run} = setup();

		expect(await run("awk 'function f(a) { return a \"|\" } BEGIN { print f(u) length(u) }'")).toBe('|0');
		expect(await run("echo 'a b' | awk '{ \"echo z\" | getline $2; print; print --x, x }'")).toBe('a z\n-1 -1');
		expect(await run("awk 'BEGIN { c = \"echo a; echo b\"; c | getline x; c | getline y; print x y }'")).toBe('ab');
		expect(await run("awk 'BEGIN { print \"a\" > \"/dev/zero\"; print \"b\" > \"/dev/zero\"; print split(\"\", s, /,/), match(\"x\", /y/, m), length(m) }'")).toBe('0 0 0');
	});

	it('leaves loops from inside them', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { while (1) break; do break; while (1); for (;;) break; print \"out\" }'")).toBe('out');
		expect(await run("seq 3 | awk '{ for (i = 0; i < 5; i++) if ($0 == 2) next; print }'")).toBe('1\n3');
	});

	it('deletes elements, or whole arrays', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { a[\"x\"]; delete a[\"x\"]; print length(a); a[1]; a[2]; delete a; print length(a) }'")).toBe('0\n0');
	});
});

describe('awk built-ins', () => {
	it('works with strings', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { s = \"hello world\"; print length(s), substr(s, 1, 5), substr(s, 7), index(s, \"wor\"), index(s, \"z\"), toupper(s), tolower(\"ABC\") 1 }'")).toBe('11 hello world 7 0 HELLO WORLD abc1');
		expect(await run("awk 'BEGIN { print substr(\"hello\", 0, 2), substr(\"hello\", -1), substr(\"hello\", 2, 100), substr(\"hello\", 1.5, 1), substr(\"hello\", 2, -1) \"|\" }'")).toBe('h hello ello e |');
		expect(await run("awk 'BEGIN { print length(\"héllo\"), toupper(\"é\"), length(12345), length(1/4), index(\"héllo\", \"l\") }'")).toBe('5 É 5 4 3');
	});

	it('splits strings into arrays', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { n = split(\"a:b:c\", arr, \":\"); print n, arr[1], arr[3] }'")).toBe('3 a c');
		expect(await run("awk 'BEGIN { print split(\"\", a), split(\" a  b \", b), b[1], split(\"a b\", c, / /), c[2], split(\"a1b\", d, /[0-9]/), d[2] }'")).toBe('0 2 a 2 b 2 b');
		expect(await run("awk -F, 'BEGIN { print split(\"x,y\", a), a[2] }'")).toBe('2 y');
		expect(await run("awk 'BEGIN { split(\"3 1\", a); print (a[1] > a[2]) }'")).toBe('1');
	});

	it('substitutes, with & for what matched', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { s = \"foo bar foo\"; n = gsub(/foo/, \"[&]\", s); print n, s; sub(/bar/, \"\\\\&\", s); print s; t = \"x.y.z\"; gsub(\"\\\\.\", \"-\", t); print t }'")).toBe('2 [foo] bar [foo]\n[foo] & [foo]\nx-y-z');
		expect(await run("echo 'a b a' | awk '{ print sub(/a/, \"A\"), $0, NF; print gsub(/a/, \"<&&>\", $3), $0 }'")).toBe('1 A b a 3\n1 A b <aa>');
		expect(await run("awk 'BEGIN { s = \"abc\"; print gsub(/x*/, \"-\", s), s; s = \"abc\"; gsub(/b*/, \"-\", s); print s; s = \"aaa\"; print gsub(/z/, \"y\", s), s }'")).toBe('4 -a-b-c-\n-a-c-\n0 aaa');
		expect(await run("awk 'BEGIN { s = \"a\"; gsub(/a/, \"\\\\\\\\&\", s); print s; t = \"a\"; gsub(/a/, \"x\\\\y\", t); print t }'")).toBe('\\a\nx\\y');
	});

	it('finds matches, setting RSTART and RLENGTH, and the groups too if asked', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { if (match(\"abcdef\", /cd+/)) print RSTART, RLENGTH; print match(\"x\", /y/), RSTART, RLENGTH }'")).toBe('3 2\n0 0 -1');
		expect(await run("awk 'BEGIN { match(\"key=value\", /(\\w+)=(x)?(\\w+)/, m); print m[0], m[1], m[3], (2 in m) }'")).toBe('key=value key value 0');
	});

	it('formats with printf and sprintf', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { printf \"%5.2f|%-5s|%05d|%x|%X|%o|%u|%c|%e|%E|%s|%i\\n\", 3.14159, \"ab\", 42, 255, 255, 8, -1, 65, 12345.678, 0.5, \"x\", 7.9 }'")).toBe(' 3.14|ab   |00042|ff|FF|10|18446744073709551615|A|1.234568e+04|5.000000E-01|x|7');
		expect(await run("awk 'BEGIN { s = sprintf(\"%3d|%-3d|%+d|% d|%.3s|%%|%#x|%#o|%.5d|%.0d|%-05d\", 5, 5, 5, 5, \"abcdef\", 255, 8, 42, 0, 3); print s }'")).toBe('  5|5  |+5| 5|abc|%|0xff|010|00042||3    ');
		expect(await run("awk 'BEGIN { printf \"%c%c|%*d|%-*d|%.*f|%5%|%z\\n\", \"hello\", 256, 4, 7, 3, 1, 2, 3.14159 }'")).toBe('hĀ|   7|1  |3.14|%|%z');
		expect(await run("awk 'BEGIN { printf \"%g %g %g %G %g %f %d %d %08.3f %+.2e\\n\", 0.0001, 123456789, 100, 1e-10, 0, 1e22, \"12abc\", log(-1), -3.14159, 12345 }'")).toBe('0.0001 1.23457e+08 100 1E-10 0 10000000000000000000000.000000 12 nan -003.142 +1.23e+04');
		expect(await run("echo 65 | awk '{ printf \"%c|%*s|\\n\", $1, -4, \"x\" }'")).toBe('A|x   |');
		expect(await run("awk 'BEGIN { printf \"%f|%.0g|%.*f|%c|%.3d|%x|%#X|%+f|% .1f|%e\\n\", log(-1), 123, 1, 2.25, \"\", -7, log(-1), 0, 1, 2, 1e300 * 1e300 }'")).toBe('nan|1e+02|2.2||-007|0|0|+1.000000| 2.0|inf');
		expect(await run("awk 'BEGIN { printf(\"%s-%s\\n\", \"a\", \"b\"); printf \"%s\", \"no newline\" }'")).toBe('a-b\nno newline');
	});

	it('does arithmetic, and random numbers that repeat for the same seed', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print int(-3.7), int(\"4x\"), sqrt(16), exp(0), log(1), sin(0), cos(0), atan2(0, -1) }'")).toBe('-3 4 4 1 0 0 1 3.14159');
		expect(await run("awk 'BEGIN { srand(1); a = rand(); srand(1); b = rand(); print (a == b), (a >= 0 && a < 1), srand(5), srand() }'")).toBe('1 1 1 5');
	});

	it('tells the time', async () => {
		vi.useFakeTimers({now: new Date('2026-10-28T12:00:00Z'), toFake: ['Date']});
		const {run} = setup();

		expect(await run("awk 'BEGIN { print systime(); print strftime(\"%Y-%m-%d %H:%M\", 0, 1); print strftime(\"%Y\", systime()); print (length(strftime()) > 0) }'")).toBe('1793188800\n1970-01-01 00:00\n2026\n1');
	});
});

describe('awk input and output', () => {
	it('reads lines with getline: from the input, from files, and from commands', async () => {
		const {run} = setup();

		expect(await run("printf 'l1\\nl2\\nl3\\nl4\\n' | awk 'NR == 1 { getline; print \"after getline:\", $0, NR } NR == 3 { getline x; print \"x=\" x, NR, $0 }'")).toBe('after getline: l2 2\nx=l4 4 l3');
		expect(await run("awk 'BEGIN { getline line < \"/etc/hostname\"; print \"host:\", line; close(\"/etc/hostname\"); while ((getline l < \"/etc/passwd\") > 0) n++; print n, (getline < \"/etc/hostname\"), $0 }'")).toBe('host: robinj.be\n3 1 robinj.be');
		expect(await run("awk 'BEGIN { print (getline line < \"/nope\"), ERRNO; print getline < \"/etc\" }'")).toBe('-1 No such file or directory\n-1');
		expect(await run("awk 'BEGIN { \"echo hi there\" | getline x; print x, NR; \"echo a b\" | getline; print $2; print close(\"echo hi there\"), close(\"nope\") }'")).toBe('hi there 1\nb\n0 -1');
		expect(await run("echo typed | awk 'BEGIN { while ((getline line) > 0) print \"got\", line; print NR }'")).toBe('got typed\n1');
		expect(await run("echo x | awk 'BEGIN { getline < \"-\"; print \"[\" $0 \"]\" }'")).toBe('[x]');
		expect(await run("awk 'BEGIN { \"yes\" | getline y; print y; close(\"yes\") }'")).toBe('y');
	});

	it('writes to the standard streams and /dev/null, and to nothing on the read-only filesystem', async () => {
		const {shell, run} = setup();

		expect(await run("awk 'BEGIN { print \"a\" > \"/dev/stderr\"; print \"b\" > \"/dev/null\"; print \"c\"; print \"d\" > \"/dev/stdout\"; printf \"%s\\n\", \"e\" >> \"-\" }' 2> /dev/null")).toBe('c\nd\ne');
		expect(await run("awk 'BEGIN { print 1, 2 > \"/dev/stderr\"; print \"x\" > \"/dev/zero\" }' 2>&1")).toBe('1 2');
		expect(await run("awk 'BEGIN { print \"x\" > \"out.txt\" }'")).toBe("awk: cmd. line:1: fatal: can't redirect to `out.txt' (Read-only file system)");
		expect(shell.state.status).toBe(2);
		expect(await run("echo x | awk '{ printf \"y\" > \"/root/f\" }'")).toBe("awk: cmd. line:1: (FILENAME=- FNR=1) fatal: can't redirect to `/root/f' (Permission denied)");
		expect(await run("awk 'BEGIN { print (1,2); print(1)(2); print (\"a\") \"b\" > \"/dev/stdout\" }'")).toBe('1 2\n12\nab');
	});

	it('pipes output to commands, which run when closed, and runs commands with system()', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print \"b\\na\" | \"cat -n\"; print \"x\" }'")).toBe('x\n     1\tb\n     2\ta');
		expect(await run("awk 'BEGIN { print \"z\" | \"cat\"; r = close(\"cat\"); print \"after\", r }'")).toBe('z\nafter 0');
		expect(await run("awk 'BEGIN { r = system(\"echo from system; exit 3\"); print \"r=\" r }'")).toBe('from system\nr=3');
		expect(await run("awk 'BEGIN { printf \"first \"; fflush(); system(\"echo second\") }'")).toBe('first second');
	});

	it('flushes as it goes when writing to a terminal, and in bulk to a pipe', async () => {
		const {run} = setup();

		expect(await run("seq 3000 | awk '{ print }' | tail -1")).toBe('3000');
	});
});

describe('awk errors', () => {
	it('points at syntax errors', async () => {
		const {shell, run} = setup();

		expect(await run("awk 'BEGIN { print ( }'")).toBe('awk: cmd. line:1: BEGIN { print ( }\nawk: cmd. line:1:                 ^ syntax error');
		expect(shell.state.status).toBe(1);
		expect(await run("awk 'BEGIN {'")).toBe('awk: cmd. line:1: BEGIN {\nawk: cmd. line:1:        ^ unexpected newline or end of string');
		expect(await run("awk '{print $1,}'")).toBe('awk: cmd. line:1: {print $1,}\nawk: cmd. line:1:           ^ syntax error');
		expect(await run("awk 'BEGIN { print \"abc }'")).toBe('awk: cmd. line:1: BEGIN { print "abc }\nawk: cmd. line:1:               ^ unterminated string');
		expect(await run("awk 'BEGIN { x = /abc }'")).toBe('awk: cmd. line:1: BEGIN { x = /abc }\nawk: cmd. line:1:             ^ unterminated regexp');
		expect(await run("awk 'BEGIN { @ }'")).toBe("awk: cmd. line:1: BEGIN { @ }\nawk: cmd. line:1:         ^ invalid char '@' in expression");
		expect(await run("awk 'BEGIN { x = 1\ny = }'")).toBe('awk: cmd. line:2: y = }\nawk: cmd. line:2:     ^ syntax error');
	});

	it('knows which statements belong where', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { next }'")).toBe("awk: cmd. line:1: BEGIN { next }\nawk: cmd. line:1:         ^ `next' used in BEGIN action");
		expect(await run("awk 'BEGIN { return }'")).toBe("awk: cmd. line:1: BEGIN { return }\nawk: cmd. line:1:         ^ `return' used outside function context");
		expect(await run("awk '{ break }'")).toBe("awk: cmd. line:1: { break }\nawk: cmd. line:1:   ^ `break' is not allowed outside a loop");
		expect(await run("awk 'BEGIN'")).toBe('awk: cmd. line:1: BEGIN\nawk: cmd. line:1: ^ BEGIN blocks must have an action part');
		expect(await run("awk 'function f() {} function f() {}'")).toBe("awk: cmd. line:1: function f() {} function f() {}\nawk: cmd. line:1:                          ^ function `f' previously defined");
		expect(await run("awk 'function next() {}'")).toBe('awk: cmd. line:1: function next() {}\nawk: cmd. line:1:          ^ syntax error');
		expect(await run("awk 'function f() { next } BEGIN { f() }'")).toBe("awk: cmd. line:1: fatal: `next' cannot be called from a BEGIN or END rule");
		expect(await run("awk 'BEGIN { getline < }'")).toBe('awk: cmd. line:1: BEGIN { getline < }\nawk: cmd. line:1:                   ^ syntax error');
		expect(await run("awk 'BEGIN { while x }'")).toBe('awk: cmd. line:1: BEGIN { while x }\nawk: cmd. line:1:               ^ syntax error');
		expect(await run("awk '1 }'")).toBe('awk: cmd. line:1: 1 }\nawk: cmd. line:1:   ^ syntax error');
		expect(await run("awk 'BEGIN { printf }'")).toBe('awk: cmd. line:1: BEGIN { printf }\nawk: cmd. line:1:                ^ syntax error');
		expect(await run("awk 'BEGIN { ++5 }'")).toBe('awk: cmd. line:1: BEGIN { ++5 }\nawk: cmd. line:1:           ^ syntax error');
		expect(await run("awk 'BEGIN { a[] = 1 }'")).toBe('awk: cmd. line:1: BEGIN { a[] = 1 }\nawk: cmd. line:1:           ^ syntax error');
		expect(await run("awk 'BEGIN { x = substr }'")).toBe('awk: cmd. line:1: BEGIN { x = substr }\nawk: cmd. line:1:                    ^ syntax error');
		expect(await run("awk 'BEGIN { (1, 2) }'")).toBe('awk: cmd. line:1: BEGIN { (1, 2) }\nawk: cmd. line:1:                ^ syntax error');
		expect(await run("awk 'BEGIN { x = 1 y = 2 }'")).toBe('awk: cmd. line:1: BEGIN { x = 1 y = 2 }\nawk: cmd. line:1:                 ^ syntax error');
	});

	it('stops at what cannot be done', async () => {
		const {shell, run} = setup();

		expect(await run("awk 'BEGIN { print 1/0 }'")).toBe('awk: cmd. line:1: fatal: division by zero attempted');
		expect(shell.state.status).toBe(2);
		expect(await run("echo x | awk '{ print 1 % 0 }'")).toBe("awk: cmd. line:1: (FILENAME=- FNR=1) fatal: division by zero attempted in `%'");
		expect(await run("awk 'BEGIN { x /= 0 }'")).toBe('awk: cmd. line:1: fatal: division by zero attempted');
		expect(await run("awk 'BEGIN { foo() }'")).toBe("awk: cmd. line:1: fatal: function `foo' not defined");
		expect(await run("awk 'function f(a) {} BEGIN { f(1, 2) }'")).toBe("awk: cmd. line:1: fatal: function `f' called with more arguments than declared");
		expect(await run("awk 'BEGIN { x = 1; x[1] = 2 }'")).toBe("awk: cmd. line:1: fatal: attempt to use scalar `x' as an array");
		expect(await run("awk 'BEGIN { x[1] = 1; print x }'")).toBe("awk: cmd. line:1: fatal: attempt to use array `x' in a scalar context");
		expect(await run("awk 'BEGIN { x[1] = 1; x = 2 }'")).toBe("awk: cmd. line:1: fatal: attempt to use array `x' in a scalar context");
		expect(await run("awk 'BEGIN { print $-1 }'")).toBe('awk: cmd. line:1: fatal: attempt to access field -1');
		expect(await run("awk 'BEGIN { print substr(\"x\") }'")).toBe('awk: cmd. line:1: fatal: 1 is invalid as number of arguments for substr');
		expect(await run("awk 'BEGIN { split(\"a\", \"b\") }'")).toBe('awk: cmd. line:1: fatal: split: second argument is not an array');
		expect(await run("awk 'BEGIN { match(\"a\", /a/, 1) }'")).toBe('awk: cmd. line:1: fatal: match: third argument is not an array');
		expect(await run("awk 'BEGIN { sub(/a/, \"b\", \"c\") }'")).toBe('awk: cmd. line:1: fatal: sub third parameter is not a changeable object');
		expect(await run("awk 'BEGIN { printf \"%s %s\", \"only\" }'")).toBe("awk: cmd. line:1: fatal: not enough arguments to satisfy format string\n\t`%s %s'\n\t    ^ ran out for this one");
		expect(await run("awk 'function f(n) { return f(n + 1) } BEGIN { f(0) }'")).toBe("awk: cmd. line:1: fatal: function `f' called too deeply (more than 10000 levels)");
	});

	it('reports regular expressions that do not make sense', async () => {
		const {run} = setup();

		expect(await run("awk 'BEGIN { print \"(\" ~ \"(\" }'")).toBe('awk: cmd. line:1: fatal: Unmatched ( or \\(: /(/');
		expect(await run("awk 'BEGIN { print \")\" ~ \")\" }'")).toBe('awk: cmd. line:1: fatal: Unmatched ) or \\): /)/');
		expect(await run("awk 'BEGIN { print \"a\" ~ \"*a\" }'")).toBe('awk: cmd. line:1: fatal: Invalid preceding regular expression: /*a/');
		expect(await run("awk 'BEGIN { print \"a\" ~ \"[a\" }'")).toBe('awk: cmd. line:1: fatal: Unmatched [, [^, [:, [., or [=: /[a/');
		expect(await run("awk 'BEGIN { print \"a\" ~ \"a{2,1}\" }'")).toBe('awk: cmd. line:1: fatal: Invalid regular expression: /a{2,1}/');
		expect(await run("awk 'BEGIN { FS = \"[a\" } { print $1 }' /etc/hostname")).toBe('awk: cmd. line:1: (FILENAME=/etc/hostname FNR=1) fatal: Unmatched [, [^, [:, [., or [=: /[a/');
		expect(await run("awk 'BEGIN { FS = \"[\" } { print $1 }' /etc/hostname")).toBe('robinj.be');
		expect(await run("awk 'BEGIN { print \"a\\\\\" ~ \"a\\\\\" }'")).toBe('1');
	});

	it('explains how it is used', async () => {
		const {shell, run} = setup();

		expect(await run('awk')).toMatch(new RegExp(`^${USAGE.replace(/[[\]]/g, '\\$&')}\n`));
		expect(shell.state.status).toBe(2);
		expect(await run('awk -z')).toMatch(/^awk: invalid option -- 'z'\nUsage: awk/);
		expect(await run('awk --zap')).toMatch(/^awk: unrecognized option '--zap'\nUsage: awk/);
		expect(await run('awk -f')).toMatch(/^awk: option requires an argument -- 'f'\nUsage: awk/);
		expect(await run("awk -v '1x=3' 'BEGIN { }'")).toBe("awk: fatal: `1x=3' argument to `-v' not in `var=value' form");
		expect(await run('awk -f /nope')).toBe("awk: fatal: can't open source file `/nope' for reading: No such file or directory");
		expect(await run('awk --version')).toBe('GNU Awk 5.3.2, API 4.0, PMA Avon 8-g1, (GNU MPFR 4.2.2, GNU MP 6.3.0)\nCopyright (C) 1989, 1991-2025 Free Software Foundation.');
		expect(await run('awk -V | head -1')).toMatch(/^GNU Awk/);
		expect(await run('awk --help | head -1')).toBe(USAGE);
		expect(await run('awk -h | head -1')).toBe(USAGE);
		expect(shell.state.status).toBe(0);
		expect(await run("gawk 'BEGIN { print (' 2>&1 | head -1")).toBe('gawk: cmd. line:1: BEGIN { print (');
		expect(await run("awk -- 'BEGIN { print \"dashes\" }'")).toBe('dashes');
	});
});

describe('awk loops', () => {
	it('crawl along with the loop protection, and stop at ^C', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute("awk 'BEGIN { while (1) print }'");
		await vi.advanceTimersByTimeAsync(0);
		const burst = tty.take().length;
		await vi.advanceTimersByTimeAsync(1000);
		const second = tty.take().length;
		shell.interrupt();
		await running;

		expect(burst).toBeGreaterThan(0);
		// After the free start, ten thousand iterations every tenth of a second.
		expect(second).toBeLessThanOrEqual(200000);
		expect(shell.state.status).toBe(130);
		expect(shell.procs.size).toBe(0);
	});

	it('and commands they read from stop at ^C too', async () => {
		vi.useFakeTimers();
		const {shell} = setup();

		const running = shell.execute("awk 'BEGIN { \"sleep 10\" | getline x }'");
		// awk, the bash running the command, and sleep.
		await vi.waitFor(() => expect(shell.procs.size).toBe(3));
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
		expect(shell.procs.size).toBe(0);
	});

	it('that print nothing still give way', async () => {
		vi.useFakeTimers();
		const {shell} = setup();

		const running = shell.execute("awk 'BEGIN { for (;;) x++ }'");
		await vi.advanceTimersByTimeAsync(500);
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
	});
});
