import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';

const PAGE = '<html>hi</html>\n';
const BINARY = 'Warning: Binary output can mess up your terminal. Use "--output -" to tell \nWarning: curl to output it to your terminal anyway, or consider "--output \nWarning: <FILE>" to save to a file.';
const TRY = "curl: try 'curl --help' or 'curl --manual' for more information";
const STAMP = '\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d';

// A body that comes in the chunks given, and fails once the request is aborted, as fetch's do.
const body = (chunks, signal) => new ReadableStream({
	start: controller => signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError'))),
	pull: controller => {
		if (!chunks.length) {
			controller.close();
			return undefined;
		}
		const chunk = chunks.shift();
		return chunk instanceof Promise ? chunk.then(data => controller.enqueue(data)) : controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
	},
});

const reply = (chunks = [PAGE], {status = 200, statusText = '', headers = {'content-type': 'text/html', 'content-length': '16'}} = {}) => vi.fn(async (url, init) => (
	new Response(init.method === 'HEAD' ? null : body([...chunks], init.signal), {status, statusText, headers})
));

const failing = () => vi.fn(async () => {
	throw new TypeError('Failed to fetch');
});

// A request that never answers, but gives up when aborted.
const hanging = () => vi.fn((url, {signal}) => new Promise((resolve, reject) => {
	signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
}));

const timed = async ({shell, tty}, line, ms) => {
	const running = shell.execute(line);
	await vi.advanceTimersByTimeAsync(ms);
	await running;
	return tty.take().replace(/\n$/, '');
};

beforeEach(() => {
	stubStorage();
	vi.stubGlobal('fetch', reply());
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('curl', () => {
	it('fetches without the visitor\'s cookies, credentials or referrer, and without caching', async () => {
		const {run} = setup();

		expect(await run('curl https://robinj.be/')).toBe(PAGE.trim());
		expect(fetch).toHaveBeenCalledWith('https://robinj.be/', expect.objectContaining({
			method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'follow',
		}));
		expect([...fetch.mock.calls[0][1].headers]).toEqual([['accept', '*/*']]);
		expect(await run('curl -s robinj.be/x?y=1 | cat')).toBe(PAGE.trim());
		expect(fetch.mock.calls[1][0]).toBe('http://robinj.be/x?y=1');
	});

	it('shows the response headers with -i, and only them with -I', async () => {
		const {run} = setup();

		expect(await run('curl -i https://robinj.be/')).toBe(`HTTP/2 200 \r\ncontent-length: 16\r\ncontent-type: text/html\r\n\r\n${PAGE.trim()}`);
		expect(await run('curl -sI https://robinj.be/')).toBe('HTTP/2 200 \r\ncontent-length: 16\r\ncontent-type: text/html\r\n\r');
		expect(fetch.mock.calls[1][1].method).toBe('HEAD');
		vi.stubGlobal('fetch', reply(['gone'], {status: 404, statusText: 'Not Found', headers: {}}));
		expect(await run('curl --show-headers https://robinj.be/x')).toBe('HTTP/1.1 404 Not Found\r\n\r\ngone');
	});

	it('talks about the request and response with -v', async () => {
		const {run} = setup();

		expect(await run("curl -v -H 'X-Test: yes' 'https://robinj.be/x?y=1' 2>&1 >/dev/null")).toBe([
			'*   Trying robinj.be:443...', '> GET /x?y=1 HTTP/2', '> Host: robinj.be', '> Accept: */*', '> X-Test: yes', '> ',
			'< HTTP/2 200 ', '< content-length: 16', '< content-type: text/html', '< ', '* Connection #0 to host robinj.be left intact',
		].join('\n'));
		expect(await run('curl -v http://robinj.be:8080/ 2>&1 | head -2')).toBe('*   Trying robinj.be:8080...\n> GET / HTTP/1.1');
	});

	it('posts data, as a form or JSON, and sends other methods and headers', async () => {
		const {run} = setup({input: ['from stdin\n']});

		await run("curl -X PUT -d a=1 -d 'b=2' -H 'Content-Type: text/plain' https://robinj.be/post");
		expect(fetch.mock.calls[0][1]).toMatchObject({method: 'PUT', body: 'a=1&b=2'});
		expect(fetch.mock.calls[0][1].headers.get('content-type')).toBe('text/plain');
		await run("curl --json '{\"a\":1}' https://robinj.be/json");
		expect(fetch.mock.calls[1][1]).toMatchObject({method: 'POST', body: '{"a":1}'});
		expect([...fetch.mock.calls[1][1].headers]).toEqual([['accept', 'application/json'], ['content-type', 'application/json']]);
		await run('curl -d @/etc/passwd --data-raw @raw --data-binary=x -d @- https://robinj.be/');
		expect(fetch.mock.calls[2][1].body).toBe('root:x:0:0:Super User:/root:/bin/bashbin:x:1:1:bin:/bin:/usr/sbin/nologinrobin:x:1000:1000:Robin Jacobs:/home/robin:/bin/bash&@raw&x&from stdin');
		expect(fetch.mock.calls[2][1].headers.get('content-type')).toBe('application/x-www-form-urlencoded');
		expect(await run('curl --no-progress-meter -d @nope https://robinj.be/ 2>&1 >/dev/null')).toBe('Warning: Couldn\'t read data from file "nope", this makes an empty POST.');
	});

	it('writes to a file only if it is a device', async () => {
		const {shell, run} = setup();

		expect(await run('curl -o /dev/null https://robinj.be/')).toMatch(/^ {2}% Total {4}% Received % Xferd {2}Average Speed {3}Time {4}Time {5}Time {2}Current\n {33}Dload {2}Upload {3}Total {3}Spent {4}Left {2}Speed\n\r {2}0 {5}0 {4}0 {5}0 {4}0 {5}0 {6}0 {6}0 --:--:-- --:--:-- --:--:-- {5}0\r100 {4}16 {2}100 {4}16 {4}0 {5}0 +\d+ {6}0 --:--:-- --:--:-- --:--:-- +\d+$/);
		expect(await run("curl -so /dev/null -w '%{http_code} %{content_type} %{size_download} %{url_effective} %{exitcode}%{nope}%%\\t|\\n' https://robinj.be/")).toBe('200 text/html 16 https://robinj.be/ 0%\t|');
		expect(await run('curl -o out.html https://robinj.be/')).toBe('Warning: Failed to open the file out.html: Read-only file system\ncurl: (23) Failure writing output to destination');
		expect(shell.state.status).toBe(23);
		expect(await run('curl -sO https://robinj.be/page.html')).toBe('');
		expect(await run('curl -O https://robinj.be/page.html')).toBe('Warning: Failed to open the file page.html: Read-only file system\ncurl: (23) Failure writing output to destination');
		expect(await run('curl -O https://robinj.be/')).toBe('curl: (23) Remote file name has no length!');
		expect(await run('curl -o - https://robinj.be/ --no-progress-meter | cat')).toBe(PAGE.trim());
		expect(await run('curl https://robinj.be/ > /dev/null')).toMatch(/Dload/);
	});

	it('keeps its progress meter up to date with large and slow downloads, and follows redirects', async () => {
		vi.useFakeTimers();
		let finish;
		vi.stubGlobal('fetch', reply([new Uint8Array(300_000), new Promise(resolve => {
			finish = resolve;
		})], {headers: {}}));
		const session = setup();

		const running = session.shell.execute('curl -o /dev/null https://robinj.be/big');
		await vi.advanceTimersByTimeAsync(61_500);
		finish(new Uint8Array(100));
		await running;
		expect(session.tty.take().split('\r').pop()).toBe('100  293k  100  293k    0     0   4880      0 0:01:01 0:01:01 --:--:--  4880\n');

		vi.stubGlobal('fetch', vi.fn(async () => ({status: 200, statusText: 'OK', headers: new Headers(), redirected: true, url: 'https://robinj.be/new', body: null})));
		expect(await timed(session, "curl -sL -w '%{num_redirects} %{url_effective} [%{content_type}]' https://robinj.be/old", 0)).toBe('1 https://robinj.be/new []');
	});

	it('will not put binary output on a terminal unless asked to', async () => {
		vi.stubGlobal('fetch', reply([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1])], {headers: {'content-type': 'image/png'}}));
		const {shell, run} = setup();

		expect(await run('curl https://robinj.be/face.png')).toBe(BINARY);
		expect(shell.state.status).toBe(23);
		expect(await run('curl -s https://robinj.be/face.png')).toBe('');
		// Six bytes, the first of them not UTF-8: it becomes a three-byte U+FFFD.
		expect(await run('curl -o - https://robinj.be/face.png | wc -c')).toMatch(/\r100 {5}6 .*\n8$/);
		expect(await run('curl -s https://robinj.be/face.png | wc -c')).toBe('8');
	});

	it('fails on HTTP errors with -f, quietly with -s, unless -S', async () => {
		vi.stubGlobal('fetch', reply(['nope'], {status: 404, statusText: 'Not Found'}));
		const {shell, run} = setup();

		expect(await run('curl https://robinj.be/404')).toBe('nope');
		expect(shell.state.status).toBe(0);
		expect(await run('curl -f https://robinj.be/404')).toBe('curl: (22) The requested URL returned error: 404');
		expect(shell.state.status).toBe(22);
		expect(await run('curl -sf https://robinj.be/404')).toBe('');
		expect(await run('curl -sSf https://robinj.be/404 -w "%{http_code}"')).toBe('curl: (22) The requested URL returned error: 404\n404');
	});

	it('reports what the browser would not do as a connection failure', async () => {
		// The clock stands still, so the attempt takes no time at all.
		vi.useFakeTimers();
		vi.stubGlobal('fetch', failing());
		const {shell, run} = setup();

		expect(await run('curl https://robinj.be/')).toBe('curl: (7) Failed to connect to robinj.be port 443 after 0 ms: Could not connect to server');
		expect(shell.state.status).toBe(7);
		expect(await run('curl -s robinj.be')).toBe('');
		expect(await run("curl -sS -w '[%{http_code}]' http://example.com:8080/")).toBe(`curl: (7) Failed to connect to example.com port 8080 after 0 ms: Could not connect to server\n[000]`);
		expect(await run('curl -o /dev/null https://robinj.be/ 2>&1 | tail -1')).toBe('curl: (7) Failed to connect to robinj.be port 443 after 0 ms: Could not connect to server');
	});

	it('times out with -m, connecting or receiving', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', hanging());
		const session = setup();

		expect(await timed(session, 'curl -m 2 https://robinj.be/', 2000)).toBe('curl: (28) Connection timed out after 2000 milliseconds');
		expect(session.shell.state.status).toBe(28);

		vi.stubGlobal('fetch', reply(['part', new Promise(() => {})]));
		expect(await timed(session, 'curl --max-time 1 https://robinj.be/', 1000)).toBe('partcurl: (28) Operation timed out after 1000 milliseconds with 4 bytes received');
	});

	it('says so when the connection breaks off', async () => {
		let pulled = false;
		vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
			pull: controller => {
				if (pulled) {
					controller.error(new TypeError('network error'));
				} else {
					controller.enqueue(new TextEncoder().encode('half'));
				}
				pulled = true;
			},
		}))));
		const {shell, run} = setup();

		expect(await run('curl https://robinj.be/')).toBe('halfcurl: (56) Failure when receiving data from the peer');
		expect(shell.state.status).toBe(56);
	});

	it('stops at ^C, waiting or downloading, and cancels the request', async () => {
		vi.stubGlobal('fetch', hanging());
		const {shell, tty} = setup();

		let running = shell.execute('curl https://robinj.be/');
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);

		vi.stubGlobal('fetch', reply(['start', new Promise(() => {})]));
		running = shell.execute('curl https://robinj.be/');
		await vi.waitFor(() => expect(tty.take()).toContain('start'));
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		expect(shell.procs.size).toBe(0);
	});

	it('streams what it gets, and stops when the reader has had enough', async () => {
		let signal;
		vi.stubGlobal('fetch', vi.fn(async (url, init) => {
			({signal} = init);
			return new Response(new ReadableStream({pull: controller => controller.enqueue(new Uint8Array(4096).fill(97))}));
		}));
		const {shell, run} = setup();

		expect(await run('curl -s https://robinj.be/endless | head -c 10')).toBe('aaaaaaaaaa');
		expect(signal.aborted).toBe(true);
		expect(shell.procs.size).toBe(0);
	});

	it('cannot do what the browser keeps to itself', async () => {
		const {shell, run} = setup();

		for (const option of ['-b x=1', '--cookie-jar jar', '-u robin:pw', '-A agent', '-e https://elsewhere']) {
			expect(await run(`curl ${option} https://robinj.be/`)).toBe(`curl: option ${option.split(' ')[0]}: the installed libcurl version does not support this\n${TRY}`);
			expect(shell.state.status).toBe(2);
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it('leaves out the headers the browser won\'t send', async () => {
		const {run} = setup();

		expect(await run("curl -s -v -H 'Cookie: a=b' --header 'Sec-Fetch-Mode: cors' -H 'bad name: x' -H 'X-Line: a'$'\\n''b' -H nocolon -H 'X-Ok: y' https://robinj.be/ 2>&1 | grep '^> [A-Z]'")).toBe('> GET / HTTP/2\n> Host: robinj.be\n> Accept: */*\n> X-Ok: y');
		expect([...fetch.mock.calls[0][1].headers]).toEqual([['accept', '*/*'], ['x-ok', 'y']]);
	});

	it('explains its options and URLs it cannot use', async () => {
		const {shell, run} = setup();

		expect(await run('curl')).toBe(`curl: no URL specified\n${TRY}`);
		expect(shell.state.status).toBe(2);
		expect(await run('curl --bogus')).toBe(`curl: option --bogus: is unknown\n${TRY}`);
		expect(await run('curl -sZ https://x')).toBe(`curl: option -Z: is unknown\n${TRY}`);
		expect(await run('curl -o')).toBe(`curl: option -o: requires parameter\n${TRY}`);
		expect(await run('curl --max-time')).toBe(`curl: option --max-time: requires parameter\n${TRY}`);
		expect(await run('curl ftp://example.com/')).toBe('curl: (1) Protocol "ftp" not supported');
		expect(shell.state.status).toBe(1);
		expect(await run("curl 'http://[bad'")).toBe('curl: (3) URL rejected: Malformed input to a URL function');
		expect(shell.state.status).toBe(3);
		expect(await run('curl -V | head -1')).toBe('curl 8.15.0 (riscv64-redhat-linux-gnu) libcurl/8.15.0 OpenSSL/3.5.1 zlib/1.3.1.zlib-ng nghttp2/1.66.0');
		expect(await run('curl --help | head -1')).toBe('Usage: curl [options...] <url>');
		expect(await run('curl -sSLk --compressed --globoff -XGET https://robinj.be/')).toBe(PAGE.trim());
	});
});

describe('wget', () => {
	const install = async () => {
		vi.useFakeTimers();
		const session = setup();
		await timed(session, 'sudo dnf install -y wget', 10_000);
		vi.useRealTimers();
		return session;
	};

	it('has to be installed first', async () => {
		const {run} = setup();

		expect(await run('wget https://robinj.be/')).toBe('bash: wget: command not found');
		const session = await install();
		expect(await session.run('which wget')).toBe('/usr/bin/wget');
		expect(await setup().run('dnf list installed')).toBe('Installed packages\nwget.riscv64            1.25.0-1.rj1        robinj');
	});

	it('cannot save to the read-only filesystem', async () => {
		const {shell, run} = await install();

		expect(await run('wget https://robinj.be/')).toMatch(new RegExp(`^--${STAMP}--  https://robinj\\.be/\nResolving robinj\\.be \\(robinj\\.be\\)\\.\\.\\. done\\.\nConnecting to robinj\\.be:443\\.\\.\\. connected\\.\nHTTP request sent, awaiting response\\.\\.\\. 200 OK\nLength: 16 \\[text/html\\]\nindex\\.html: Read-only file system\n\nCannot write to ‘index\\.html’ \\(Read-only file system\\)\\.$`));
		expect(shell.state.status).toBe(3);
		expect(await run('cd ~; wget -q robinj.be/portfolio')).toBe('');
		expect(await run('cd ~; wget robinj.be/portfolio 2>&1 | tail -3')).toBe('portfolio.1: Read-only file system\n\nCannot write to ‘portfolio.1’ (Read-only file system).');
		expect(fetch.mock.calls[1][0]).toBe('http://robinj.be/portfolio');
		expect(await run('wget -P /tmp/ https://robinj.be/a%20b.txt 2>&1 | tail -1')).toBe('Cannot write to ‘/tmp/a b.txt’ (Read-only file system).');
		expect(await run('wget -O page.html https://robinj.be/')).toBe('page.html: Read-only file system');
		expect(shell.state.status).toBe(1);
	});

	it('writes to standard output, or a device, with -O', async () => {
		const {shell, run} = await install();

		expect(await run('wget -O - https://robinj.be/')).toMatch(new RegExp(`HTTP request sent, awaiting response\\.\\.\\. 200 OK\nLength: 16 \\[text/html\\]\nSaving to: ‘STDOUT’\n\n${PAGE}- {18} 100%\\[===================>\\] {6}16  --\\.-KB/s    in 0s\n\n${STAMP} \\(\\d+\\.?\\d* [KMG]?B/s\\) - written to stdout \\[16/16\\]\n$`));
		expect(await run('wget -qO- https://robinj.be/')).toBe(PAGE.trim());
		expect(await run('wget -q -O /dev/null https://robinj.be/; echo $?')).toBe('0');
		expect(await run('wget --output-document=/dev/null https://robinj.be/ 2>&1 | tail -2')).toMatch(new RegExp(`^${STAMP} \\(.*\\) - ‘/dev/null’ saved \\[16/16\\]\n$`));
		expect(await run('wget -nv -O /dev/null https://robinj.be/')).toMatch(new RegExp(`^${STAMP} URL:https://robinj\\.be/ \\[16/16\\] -> "/dev/null" \\[1\\]$`));
		expect(await run('wget -nv -O- https://robinj.be/')).toMatch(new RegExp(`^${PAGE}${STAMP} URL:https://robinj\\.be/ \\[16/16\\] -> "-" \\[1\\]$`));
		expect(shell.state.status).toBe(0);
	});

	it('reports HTTP errors and failed connections', async () => {
		const {shell, run} = await install();

		vi.stubGlobal('fetch', reply(['nope'], {status: 404, statusText: 'Not Found'}));
		expect(await run('wget https://robinj.be/404 2>&1 | tail -3')).toMatch(new RegExp(`^HTTP request sent, awaiting response\\.\\.\\. 404 Not Found\n${STAMP} ERROR 404: Not Found\\.\n$`));
		expect(await run('wget https://robinj.be/404; echo $?')).toMatch(/\n8$/);
		vi.stubGlobal('fetch', reply(['nope'], {status: 500, headers: {}}));
		expect(await run('wget -O- https://robinj.be/ 2>&1 | grep -E "HTTP|ERROR"')).toMatch(new RegExp(`^HTTP request sent, awaiting response\\.\\.\\. 500 Error\n${STAMP} ERROR 500: Error\\.$`));
		vi.stubGlobal('fetch', failing());
		expect(await run('wget https://robinj.be/')).toMatch(new RegExp(`Resolving robinj\\.be \\(robinj\\.be\\)\\.\\.\\. done\\.\nConnecting to robinj\\.be:443\\.\\.\\. failed: Connection refused\\.$`));
		expect(shell.state.status).toBe(4);
	});

	it('times out, and gives up when the connection breaks off', async () => {
		const session = await install();
		vi.useFakeTimers();
		vi.stubGlobal('fetch', hanging());

		expect(await timed(session, 'wget -T 2 https://robinj.be/', 2000)).toMatch(/Connecting to robinj\.be:443\.\.\. failed: Connection timed out\.$/);
		expect(session.shell.state.status).toBe(4);

		vi.stubGlobal('fetch', reply(['part', new Promise(() => {})]));
		expect(await timed(session, 'wget --timeout=1 -O- https://robinj.be/', 1000)).toMatch(new RegExp(`part\n${STAMP} \\(.*\\) - Read error at byte 4/16 \\(Connection timed out\\)\\. Giving up\\.\n$`));
		vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
			start: controller => controller.error(new TypeError('network error')),
		}))));
		expect(await timed(session, 'wget -O- https://robinj.be/ 2>&1 | tail -2', 0)).toMatch(/Read error at byte 0 \(Connection reset by peer\)\. Giving up\.\n$/);
	});

	it('reports its rate, and stops when its reader has had enough', async () => {
		const session = await install();
		vi.useFakeTimers();
		let finish;
		vi.stubGlobal('fetch', reply([new Uint8Array(20_480), new Promise(resolve => {
			finish = resolve;
		})], {headers: {'content-length': '20480'}}));

		const running = session.shell.execute('wget -O /dev/null https://robinj.be/');
		await vi.advanceTimersByTimeAsync(2000);
		finish(new Uint8Array(0));
		await running;
		expect(session.tty.take()).toMatch(/Length: 20480 \(20K\)[^]*\(10\.0 KB\/s\) - ‘\/dev\/null’ saved \[20480\/20480\]/);
		vi.useRealTimers();

		vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({pull: controller => controller.enqueue(new Uint8Array(4096).fill(98))}))));
		expect(await session.run('wget -qO- https://robinj.be/endless | head -c 5')).toBe('bbbbb');
		expect(session.shell.procs.size).toBe(0);
	});

	it('checks with --spider, and shows the server\'s headers with -S', async () => {
		const {run} = await install();

		expect(await run('wget -S --spider https://robinj.be/')).toMatch(/HTTP request sent, awaiting response\.\.\. \n {2}HTTP\/2 200\n {2}content-length: 16\n {2}content-type: text\/html\nLength: 16 \[text\/html\]\nRemote file exists\.\n$/);
		expect(fetch.mock.calls[0][1].method).toBe('HEAD');
	});

	it('posts, sends headers and other methods', async () => {
		vi.stubGlobal('fetch', reply(['x'.repeat(2048)], {headers: {}}));
		const {run} = await install();

		expect(await run("wget -O /dev/null --post-data 'a=1' --header 'X-A: b' https://robinj.be/ 2>&1 | grep Length")).toBe('Length: unspecified');
		expect(fetch.mock.calls[0][1]).toMatchObject({method: 'POST', body: 'a=1'});
		expect([...fetch.mock.calls[0][1].headers]).toEqual([['content-type', 'application/x-www-form-urlencoded'], ['x-a', 'b']]);
		await run("wget -qO- --method=DELETE --post-data=x --header='Content-Type: text/plain' https://robinj.be/");
		expect(fetch.mock.calls[1][1]).toMatchObject({method: 'DELETE', body: 'x'});
		expect(fetch.mock.calls[1][1].headers.get('content-type')).toBe('text/plain');
		await run("wget -qO- --header 'Cookie: x' --header nocolon --header 'X-Ok: y' https://robinj.be/");
		expect([...fetch.mock.calls[2][1].headers]).toEqual([['x-ok', 'y']]);
		vi.stubGlobal('fetch', reply(['x'.repeat(2048)], {headers: {'content-length': '2048'}}));
		expect(await run('wget -O /dev/null https://robinj.be/ 2>&1 | grep Length')).toBe('Length: 2048 (2.0K)');
	});

	it('explains its options, and refuses what the browser keeps to itself', async () => {
		const {shell, run} = await install();
		const usage = "Usage: wget [OPTION]... [URL]...\n\nTry `wget --help' for more options.";

		expect(await run('wget')).toBe(`wget: missing URL\n${usage}`);
		expect(shell.state.status).toBe(1);
		expect(await run('wget --bogus')).toBe(`wget: unrecognized option '--bogus'\n${usage}`);
		expect(shell.state.status).toBe(2);
		expect(await run('wget -qZ')).toBe(`wget: invalid option -- 'Z'\n${usage}`);
		expect(await run('wget -n')).toBe(`wget: invalid option -- 'n'\n${usage}`);
		expect(await run('wget -O')).toBe(`wget: option requires an argument -- 'O'\n${usage}`);
		expect(await run('wget --header')).toBe(`wget: option '--header' requires an argument\n${usage}`);
		expect(await run('wget --user=robin --password pw https://robinj.be/')).toBe(`wget: unrecognized option '--user=robin'\n${usage}`);
		expect(await run('wget --load-cookies jar https://robinj.be/')).toBe(`wget: unrecognized option '--load-cookies'\n${usage}`);
		expect(await run('wget -U agent https://robinj.be/')).toBe(`wget: invalid option -- 'U'\n${usage}`);
		expect(await run('wget gopher://x')).toMatch(/--  gopher:\/\/x\ngopher:\/\/x: Unsupported scheme ‘gopher’\.$/);
		expect(await run("wget 'http://[bad'")).toMatch(/\nhttp:\/\/\[bad: Invalid URL\.$/);
		expect(shell.state.status).toBe(1);
		expect(await run('wget --version | head -1; wget -V | head -1')).toBe('GNU Wget 1.25.0 built on linux-gnu.\nGNU Wget 1.25.0 built on linux-gnu.');
		expect(await run('wget --help | head -1; wget -h | head -1')).toBe('GNU Wget 1.25.0, a non-interactive network retriever.\nGNU Wget 1.25.0, a non-interactive network retriever.');
		expect(fetch).not.toHaveBeenCalled();
	});
});
