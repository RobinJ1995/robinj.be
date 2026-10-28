import {describe, it, expect, beforeEach} from 'vitest';
import {parse, parseExpansions, ParseError} from './parse';
import {setup, stubStorage} from './test-helpers';

// What parsing `source` fails with: [message, whether more input could fix it].
const failure = source => {
	try {
		parse(source);
	} catch (e) {
		expect(e).toBeInstanceOf(ParseError);
		return [e.message, e.incomplete];
	}
	throw new Error(`${JSON.stringify(source)} parsed`);
};

const unexpected = token => [`syntax error near unexpected token \`${token}'`, false];
const INCOMPLETE = ['syntax error: unexpected end of file', true];

beforeEach(() => {
	stubStorage();
});

describe('parsing', () => {
	it('wants more for anything left open', () => {
		for (const source of [
			"echo 'open", 'echo "open', 'echo `open', 'echo $(open', 'echo ${open', 'echo $((1 +', 'echo trailing\\', "echo $'open",
			'a=(1 2', 'if true; then', 'while true', 'for i in 1; do', 'case x in', 'f() {', '{ echo', '(echo', 'echo |', 'true &&',
			'[[ -f x', 'cat <<EOF', 'cat <<EOF\nnot the end', 'echo "${x', 'echo ${a[1', 'echo ${x:-', "echo ${x:-'", 'echo ${x:1', 'echo "a\\',
			"echo $'\\", 'echo ${x/a', 'echo "$(echo "',
		]) {
			expect(failure(source), source).toEqual(INCOMPLETE);
		}
	});

	it('names the token it did not expect', () => {
		expect(failure(')')).toEqual(unexpected(')'));
		expect(failure(';;')).toEqual(unexpected(';;'));
		expect(failure('echo a )')).toEqual(unexpected(')'));
		expect(failure('done')).toEqual(unexpected('done'));
		expect(failure('if then')).toEqual(unexpected('then'));
		expect(failure('if true; then fi')).toEqual(unexpected('fi'));
		expect(failure('cat <')).toEqual(unexpected('newline'));
		expect(failure('cat < |')).toEqual(unexpected('|'));
		expect(failure('cat < >x')).toEqual(unexpected('>'));
		expect(failure('a=(1 ; 2)')).toEqual(unexpected(';'));
		expect(failure('echo $((1)2)')).toEqual(unexpected(')'));
		expect(failure('f() echo')).toEqual(unexpected('newline'));
		expect(failure('function ; { :; }')).toEqual(unexpected(';'));
		expect(failure('for i in a b & do :; done')).toEqual(unexpected('&'));
		expect(failure('for ; do :; done')).toEqual(unexpected(';'));
		expect(failure('for ((i = 0; i < 3)); do :; done')).toEqual(unexpected('(('));
		expect(failure('case ; in esac')).toEqual(unexpected(';'));
		expect(failure('case x in ; esac')).toEqual(unexpected(';'));
		expect(failure('case x in a) echo & ) esac')).toEqual(unexpected(')'));
		expect(failure('[[ ]]')).toEqual(unexpected(']]'));
		expect(failure('[[ ; ]]')).toEqual(unexpected(';'));
		expect(failure('[[ a == ; ]]')).toEqual(unexpected(';'));
		expect(failure('[[ a b ]]')).toEqual(unexpected('b'));
		expect(failure('[[ (a ]]')).toEqual(unexpected(']]'));
	});

	it('rejects loop variables that are not names', () => {
		expect(failure('for 1x in a; do :; done')).toEqual(["`1x': not a valid identifier", false]);
	});

	it('finds the expansions in plain text', () => {
		expect(parseExpansions('a $b ${c} $((1)) `d`').map(part => part.t)).toEqual(['q', 'param', 'q', 'param', 'q', 'arith', 'q', 'cmd']);
		expect(parseExpansions('ends in \\')).toEqual([{t: 'q', v: 'ends in \\', start: 0, end: 9}]);
	});
});

describe('the shell grammar', () => {
	it('skips comments, and joins lines ending in a backslash', async () => {
		const {run} = setup();

		expect(await run('echo a # comment')).toBe('a');
		expect(await run('echo a\\\nb \\\n c')).toBe('ab c');
		expect(await run('echo one \\\n# still a comment')).toBe('one');
		expect(await run('# only a comment')).toBe('');
	});

	it('reads ANSI-C and locale strings', async () => {
		const {run} = setup();

		expect(await run("echo $'\\x41\\u263a\\101|\\q|\\'|\\\\|\\e[0m|\\t' | od -c 2>&1 | head -1; echo $'\\x41\\u263a\\101|\\q|\\'|\\\\'")).toMatch(/A☺A\|\\q\|'\|\\$/);
		expect(await run("printf %s $'\\cA\\ca\\n' | wc -c")).toBe('3');
		expect(await run('echo $"hi $USER"')).toBe('hi robin');
	});

	it('keeps the escapes double quotes keep', async () => {
		const {run} = setup();

		expect(await run('echo "a\\"b\\$c\\\\d\\e\\`"')).toBe('a"b$c\\d\\e`');
		expect(await run('echo "joined \\\nline"')).toBe('joined line');
		expect(await run('echo "$" "$(echo "inner")"')).toBe('$ inner');
	});

	it('nests backquotes and command substitutions', async () => {
		const {run} = setup();

		expect(await run('echo `echo \\`echo nested\\``')).toBe('nested');
		expect(await run('echo `echo \\$HOME`')).toBe('/home/robin');
		expect(await run('echo $(echo $(echo deeper))')).toBe('deeper');
		expect(await run('echo $((2 * (3 + 4)))')).toBe('14');
	});

	it('reads here-documents, stripping tabs with <<-', async () => {
		const {run} = setup();

		expect(await run('cat <<-EOF\n\t\tindented $USER\n\tEOF')).toBe('indented robin');
		expect(await run('cat <<"EOF"\n$USER\nEOF')).toBe('$USER');
		expect(await run('cat <<\\EOF\n$USER\nEOF')).toBe('$USER');
		expect(await run('cat <<E"O"F\n`whoami`\nEOF')).toBe('`whoami`');
		expect(await run('cat <<A; cat <<B\none\nA\ntwo\nB')).toBe('one\ntwo');
		expect(await run('cat <<EOF\n\\$HOME \\x\nEOF')).toBe('$HOME \\x');
	});

	it('takes array assignments over several lines', async () => {
		const {run} = setup();

		expect(await run('a=(one\ntwo "three four")\necho ${#a[@]}')).toBe('3');
	});

	it('parses functions with and without the keyword', async () => {
		const {run} = setup();

		expect(await run('function f { echo braces; }; f')).toBe('braces');
		expect(await run('function g() { echo parens; }; g')).toBe('parens');
		expect(await run('h()\n{\n  echo newline\n}\nh')).toBe('newline');
		expect(await run('s() ( echo subshell ); s')).toBe('subshell');
		expect(await run('c() if true; then echo compound; fi; c')).toBe('compound');
		expect(await run('type f')).toBe('f is a function\nfunction f { echo braces; }');
	});

	it('parses case items with parentheses, alternatives and fall-through', async () => {
		const {run} = setup();

		expect(await run('case b in (a|b) echo first;& c) echo second;; d) echo never;; esac')).toBe('first\nsecond');
		expect(await run('case b in a) echo a;;& b) echo b;;& *) echo any;; esac')).toBe('b\nany');
		expect(await run('case x in\n  x)\n    echo multi\n    ;;\nesac')).toBe('multi');
		expect(await run('case x in x) ;; esac; echo $?')).toBe('0');
		expect(await run('case x in x) echo last; esac')).toBe('last');
	});

	it('parses arithmetic commands and C-style loops, with redirections', async () => {
		const {run} = setup();

		expect(await run('(( x = 2 )) > /dev/null; echo $x')).toBe('2');
		expect(await run('for ((;;)); do echo once; break; done')).toBe('once');
		expect(await run('for ((i = 0; i < 2; i++))\ndo echo $i; done')).toBe('0\n1');
		expect(await run('for i\ndo echo $i; done')).toBe('');
		expect(await run('for i in a b\ndo echo $i; done')).toBe('a\nb');
	});

	it('parses conditional expressions with grouping and operators', async () => {
		const {run} = setup();

		expect(await run('[[ ! ( -f nope || -d nope ) && ( a < b ) ]] && echo yes')).toBe('yes');
		expect(await run('[[ b > a && -n x ]] && echo yes')).toBe('yes');
		expect(await run('[[ abc =~ ^(a|x)b ]] && echo ${BASH_REMATCH[1]}')).toBe('a');
		expect(await run('[[ x ]] && [[ ! "" ]] && echo yes')).toBe('yes');
	});

	it('lets a pipeline end in |& to send stderr along', async () => {
		const {run} = setup();

		expect(await run('ls nope |& wc -l')).toBe('1');
		expect(await run('ls nope | wc -l')).toBe('ls: cannot access \'nope\': No such file or directory\n0');
		expect(await run('! false && echo negated')).toBe('negated');
	});
});
