import {nameOf} from './fs';
import {strftime} from './util';

// curl and wget, by way of the browser's fetch(): no cookies or credentials of
// the visitor's go along, and what the browser won't do, they can't either.

const CURL_VERSION = '8.15.0';
const WGET_VERSION = '1.25.0';
const TRY = "curl: try 'curl --help' or 'curl --manual' for more information\n";
// Headers fetch() won't send, or that only the browser itself sets.
const FORBIDDEN = /^(accept-charset|accept-encoding|access-control-request-.*|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|set-cookie|te|trailer|transfer-encoding|upgrade|user-agent|via|proxy-.*|sec-.*)$/i;
const TOKEN = /^[!#$%&'*+.^`|~\w-]+$/;

// Whether the browser will send a `Name: value` header.
const sendable = line => {
	const name = line.split(':')[0].trim();
	return line.includes(':') && TOKEN.test(name) && !/[\0\r\n]/.test(line) && !FORBIDDEN.test(name);
};

const requestHeaders = (lines, defaults = {}) => {
	const headers = new Headers(defaults);
	for (const line of lines) {
		const colon = line.indexOf(':');
		headers.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
	}
	return headers;
};

class Failure extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

// A URL as curl and wget read one: no scheme means http.
const parseUrl = text => {
	const withScheme = /^[a-z][\w+.-]*:\/\//i.test(text) ? text : `http://${text}`;
	try {
		return new URL(withScheme);
	} catch {
		return null;
	}
};

const portOf = url => url.port || (url.protocol === 'https:' ? '443' : '80');
const two = n => String(n).padStart(2, '0');

// The request, cancelled by ^C or after `timeout` ms. Resolves with the response
// and a reader for its body; fails with curl's 7 when refused, 28 on a timeout.
const send = async (api, url, init, timeout) => {
	const controller = new AbortController();
	let timedOut = false;
	const timer = timeout ? setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeout) : null;
	const off = api.abort.on(() => controller.abort());
	const finish = () => {
		clearTimeout(timer);
		off();
	};

	try {
		const response = await api.abort.race(fetch(url, {
			...init, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'follow',
		}));
		const reader = response.body?.getReader();
		return {
			response,
			// Chunks as Uint8Arrays, null at the end.
			read: async () => {
				try {
					const {done, value} = await api.abort.race(reader?.read() ?? Promise.resolve({done: true}));
					return done ? null : value;
				} catch {
					api.abort.check();
					throw new Failure(timedOut ? 28 : 56, '');
				}
			},
			close: () => {
				finish();
				controller.abort();
			},
		};
	} catch (e) {
		finish();
		api.abort.check();
		throw new Failure(timedOut ? 28 : 7, e.message);
	}
};

// Browsers give HTTP/2 responses no status text; that's all there is to tell them apart by.
const statusLine = response => (response.statusText ? `HTTP/1.1 ${response.status} ${response.statusText}` : `HTTP/2 ${response.status} `);
const headerLines = response => [...response.headers].map(([name, value]) => `${name}: ${value}`);

// --- curl ---

const CURL_HELP = `Usage: curl [options...] <url>
 -d, --data <data>           HTTP POST data
 -f, --fail                  Fail fast with no output on HTTP errors
 -h, --help <subject>        Get help for commands
 -o, --output <file>         Write to file instead of stdout
 -O, --remote-name           Write output to file named as remote file
 -i, --show-headers          Show response headers in output
 -s, --silent                Silent mode
 -T, --upload-file <file>    Transfer local FILE to destination
 -u, --user <user:password>  Server user and password
 -A, --user-agent <name>     Send User-Agent <name> to server
 -v, --verbose               Make the operation more talkative
 -V, --version               Show version number and quit

This is not the full help; this menu is split into categories.
Use "--help category" to get an overview of all categories.
For all options use the manual or "--help all".
`;

const CURL_FLAGS = {
	s: 'silent', S: 'show-error', i: 'include', I: 'head', f: 'fail', L: 'location', v: 'verbose', O: 'remote-name', k: 'insecure',
	h: 'help', V: 'version',
};
const CURL_VALUES = {X: 'request', H: 'header', d: 'data', o: 'output', w: 'write-out', m: 'max-time', b: 'cookie', c: 'cookie-jar', u: 'user', A: 'user-agent', e: 'referer'};
const CURL_LONG = new Set([...Object.values(CURL_FLAGS), 'show-headers', 'compressed', 'no-progress-meter', 'globoff']);
const CURL_LONG_VALUES = new Set([...Object.values(CURL_VALUES), 'data-raw', 'data-binary', 'json']);
// What the browser keeps to itself.
const UNSUPPORTED = new Set(['cookie', 'cookie-jar', 'user', 'user-agent', 'referer']);

// -s hides errors too, unless -S.
const errorsShown = opts => !opts.silent || opts['show-error'];

const curlOptions = (api, args) => {
	const opts = {headers: [], data: [], urls: []};
	const fail = message => {
		api.err(`curl: ${message}\n${TRY}`);
		return null;
	};
	const set = (name, flag, value) => {
		if (UNSUPPORTED.has(name)) {
			return fail(`option ${flag}: the installed libcurl version does not support this`);
		} else if (name === 'header') {
			// Those the browser won't send are left out without a word, as fetch() does.
			if (sendable(value)) {
				opts.headers.push(value);
			}
		} else if (name.startsWith('data') || name === 'json') {
			opts.data.push({value, raw: name !== 'data', json: name === 'json'});
		} else {
			opts[name] = value;
		}
		return true;
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--') && arg.length > 2) {
			const [name, attached] = arg.slice(2).split(/=(.*)/s);
			if (CURL_LONG_VALUES.has(name)) {
				const value = attached ?? args[++i];
				if (value === undefined) {
					return fail(`option ${arg}: requires parameter`);
				} else if (!set(name, `--${name}`, value)) {
					return null;
				}
			} else if (CURL_LONG.has(name)) {
				opts[name === 'show-headers' ? 'include' : name] = true;
			} else {
				return fail(`option ${arg}: is unknown`);
			}
		} else if (arg.startsWith('-') && arg.length > 1) {
			for (let j = 1; j < arg.length; j++) {
				const c = arg[j];
				if (CURL_VALUES[c]) {
					const value = arg.slice(j + 1) || args[++i];
					if (value === undefined) {
						return fail(`option -${c}: requires parameter`);
					} else if (!set(CURL_VALUES[c], `-${c}`, value)) {
						return null;
					}
					break;
				} else if (!CURL_FLAGS[c]) {
					return fail(`option -${arg.slice(j)}: is unknown`);
				}
				opts[CURL_FLAGS[c]] = true;
			}
		} else {
			opts.urls.push(arg);
		}
	}

	return opts;
};

const max5 = bytes => {
	const units = ['', 'k', 'M', 'G'];
	let value = bytes;
	let unit = 0;
	while (value >= 100000 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return (unit && value < 100 ? value.toFixed(1) : String(Math.round(value))) + units[unit];
};

// curl's progress meter, drawn at the start and the end.
const meter = (api, received, total, ms) => {
	const percent = total ? Math.floor(received / total * 100) : 0;
	const speed = ms ? Math.round(received / ms * 1000) : 0;
	const time = ms >= 1000 ? `0:${two(Math.floor(ms / 60000))}:${two(Math.floor(ms / 1000) % 60)}` : '--:--:--';
	api.err(`\r${String(percent).padStart(3)} ${max5(total || received).padStart(5)}  ${String(percent).padStart(3)} ${max5(received).padStart(5)}    0     0  ${max5(speed).padStart(5)}      0 ${time} ${time} --:--:-- ${max5(speed).padStart(5)}`);
};
const METER = '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n';

const writeOut = (format, info) => format
	.replace(/\\([nrt\\])/g, (match, c) => ({n: '\n', r: '\r', t: '\t', '\\': '\\'})[c])
	.replace(/%\{(\w+)\}/g, (match, name) => info[name] ?? '')
	.replace(/%%/g, '%');

const curl = async api => {
	const opts = curlOptions(api, api.args);
	if (!opts) {
		return 2;
	} else if (opts.help) {
		api.out(CURL_HELP);
		return 0;
	} else if (opts.version) {
		api.out(`curl ${CURL_VERSION} (riscv64-redhat-linux-gnu) libcurl/${CURL_VERSION} OpenSSL/3.5.1 zlib/1.3.1.zlib-ng nghttp2/1.66.0\nRelease-Date: 2025-07-16\nProtocols: http https\nFeatures: alt-svc AsynchDNS HSTS HTTP2 HTTPS-proxy IPv6 Largefile libz SSL threadsafe UnixSockets\n`);
		return 0;
	} else if (opts.urls.length === 0) {
		api.err(`curl: no URL specified\n${TRY}`);
		return 2;
	}

	let status = 0;
	for (const text of opts.urls) {
		const started = Date.now();
		const info = {http_code: '000', response_code: '000', url_effective: text, url: text, size_download: '0', num_redirects: '0', content_type: '', exitcode: '0', errormsg: ''};
		try {
			await fetchOne(api, opts, text, info);
		} catch (e) {
			if (!(e instanceof Failure)) {
				throw e;
			}
			info.exitcode = String(e.code);
			info.errormsg = e.message;
			if (errorsShown(opts) && e.message) {
				api.err(`curl: (${e.code}) ${e.message}\n`);
			}
			status = e.code;
		} finally {
			info.time_total = ((Date.now() - started) / 1000).toFixed(6);
			if (opts['write-out'] !== undefined) {
				api.out(writeOut(opts['write-out'], info));
			}
		}
	}

	return status;
};

const fetchOne = async (api, opts, text, info) => {
	const url = parseUrl(text);
	if (!url) {
		throw new Failure(3, 'URL rejected: Malformed input to a URL function');
	} else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Failure(1, `Protocol "${url.protocol.slice(0, -1)}" not supported`);
	}

	const headers = requestHeaders(opts.headers, {Accept: opts.data.some(data => data.json) ? 'application/json' : '*/*'});
	let body;
	if (opts.data.length) {
		body = await requestBody(api, opts.data);
		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', opts.data[0].json ? 'application/json' : 'application/x-www-form-urlencoded');
		}
	}
	const method = opts.request ?? (opts.head ? 'HEAD' : body === undefined ? 'GET' : 'POST');
	const verbose = line => opts.verbose && api.err(`${line}\n`);
	verbose(`*   Trying ${url.hostname}:${portOf(url)}...`);
	verbose(`> ${method} ${url.pathname}${url.search} HTTP/${url.protocol === 'https:' ? '2' : '1.1'}`);
	verbose(`> Host: ${url.host}`);
	for (const [name, value] of headers) {
		verbose(`> ${name.replace(/(^|-)\w/g, c => c.toUpperCase())}: ${value}`);
	}
	verbose('> ');

	const output = outputFor(api, opts, url);
	const meterShown = !opts.silent && !opts['no-progress-meter'] && !opts.verbose && !(output.stream ?? api.stdout).isTTY;
	if (meterShown) {
		api.err(METER);
		meter(api, 0, 0, 0);
	}

	const started = Date.now();
	let connection;
	try {
		connection = await send(api, url.href, {method, headers, body}, opts['max-time'] ? Number(opts['max-time']) * 1000 : 0);
	} catch (e) {
		if (meterShown) {
			api.err('\n');
		}
		throw Object.assign(e, e.code === 28
			? {message: `Connection timed out after ${Date.now() - started} milliseconds`}
			: {message: `Failed to connect to ${url.hostname} port ${portOf(url)} after ${Date.now() - started} ms: Could not connect to server`});
	}

	const {response} = connection;
	Object.assign(info, {
		http_code: String(response.status), response_code: String(response.status), url_effective: response.url || url.href,
		num_redirects: response.redirected ? '1' : '0', content_type: response.headers.get('Content-Type') ?? '',
	});
	verbose(`< ${statusLine(response)}`);
	for (const line of headerLines(response)) {
		verbose(`< ${line}`);
	}
	verbose('< ');

	try {
		if (opts.fail && response.status >= 400) {
			throw new Failure(22, `The requested URL returned error: ${response.status}`);
		} else if (opts.include || opts.head) {
			output.write(`${[statusLine(response), ...headerLines(response)].map(line => `${line}\r\n`).join('')}\r\n`);
		}

		const total = Number(response.headers.get('Content-Length')) || 0;
		let received = 0;
		const decoder = new TextDecoder();
		const next = () => connection.read().catch(e => {
			throw Object.assign(e, {message: e.code === 28
				? `Operation timed out after ${Date.now() - started} milliseconds with ${received} bytes received`
				: 'Failure when receiving data from the peer'});
		});
		for (let chunk = await next(); chunk !== null && !opts.head; chunk = await next()) {
			if (output.terminal && chunk.includes(0)) {
				if (errorsShown(opts)) {
					api.err('Warning: Binary output can mess up your terminal. Use "--output -" to tell \nWarning: curl to output it to your terminal anyway, or consider "--output \nWarning: <FILE>" to save to a file.\n');
				}
				throw new Failure(23, '');
			}
			received += chunk.length;
			output.write(decoder.decode(chunk, {stream: true}));
			await output.drain();
		}
		output.write(decoder.decode());
		info.size_download = String(received);
		if (meterShown) {
			meter(api, received, total || received, Date.now() - started);
			api.err('\n');
		}
	} finally {
		connection.close();
	}

	verbose(`* Connection #0 to host ${url.hostname} left intact`);
};

const requestBody = async (api, data) => {
	const parts = [];
	for (const {value, raw} of data) {
		if (raw || !value.startsWith('@')) {
			parts.push(value);
			continue;
		}
		const name = value.slice(1);
		const opened = name === '-' ? {input: api.stdin} : api.openRead(name);
		if (opened.error) {
			api.err(`Warning: Couldn't read data from file "${name}", this makes an empty POST.\n`);
			parts.push('');
		} else {
			parts.push((await opened.input.readAll(api.abort)).replace(/[\r\n]/g, ''));
		}
	}

	return parts.join('&');
};

// Where the body goes: stdout, or a file, which the read-only filesystem only
// allows for devices.
const outputFor = (api, opts, url) => {
	const toStdout = {write: api.out, drain: api.drain, terminal: api.stdout.isTTY};
	let name = opts.output;
	if (opts['remote-name'] && name === undefined) {
		name = nameOf(url.pathname);
		if (!name || name === '/') {
			throw new Failure(23, 'Remote file name has no length!');
		}
	}
	if (name === undefined || name === '-') {
		return {...toStdout, terminal: toStdout.terminal && name === undefined};
	}

	const opened = api.openWrite(name);
	if (opened.error) {
		if (errorsShown(opts)) {
			api.err(`Warning: Failed to open the file ${name}: ${opened.error}\n`);
		}
		throw new Failure(23, 'Failure writing output to destination');
	}
	return {write: text => opened.output.write(text), drain: () => api.abort.race(opened.output.drain()), stream: opened.output};
};

// --- wget ---

const WGET_USAGE = 'Usage: wget [OPTION]... [URL]...\n';

const humanSize = bytes => {
	const units = ['', 'K', 'M', 'G'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return unit ? `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}` : String(bytes);
};

// wget's transfer rates: B/s to GB/s, with three significant digits.
const rate = perSecond => {
	const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
	let value = perSecond;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ${units[unit]}`;
};

const wgetOptions = (api, args) => {
	const opts = {headers: [], urls: []};
	// Credentials, cookies and the User-Agent, which the browser keeps to itself, aren't options here.
	const values = {O: 'output', P: 'prefix', T: 'timeout'};
	const long = {
		'output-document': 'output', 'directory-prefix': 'prefix', header: 'header', method: 'method', 'post-data': 'post-data', timeout: 'timeout',
	};
	const fail = message => {
		api.err(`wget: ${message}\n${WGET_USAGE}\nTry \`wget --help' for more options.\n`);
		return null;
	};
	const set = (name, value) => {
		if (name === 'header') {
			// Those the browser won't send are left out, as with curl.
			if (sendable(value)) {
				opts.headers.push(value);
			}
		} else {
			opts[name] = value;
		}
		return true;
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const [name, attached] = arg.startsWith('--') ? arg.slice(2).split(/=(.*)/s) : [];
		if (name !== undefined && long[name]) {
			const value = attached ?? args[++i];
			if (value === undefined) {
				return fail(`option '--${name}' requires an argument`);
			} else if (!set(long[name], value)) {
				return null;
			}
		} else if (['quiet', 'no-verbose', 'server-response', 'spider', 'help', 'version'].includes(name)) {
			opts[name] = true;
		} else if (name !== undefined) {
			return fail(`unrecognized option '${arg}'`);
		} else if (arg.startsWith('-') && arg.length > 1) {
			for (let j = 1; j < arg.length; j++) {
				const c = arg[j];
				if (values[c]) {
					const value = arg.slice(j + 1) || args[++i];
					if (value === undefined) {
						return fail(`option requires an argument -- '${c}'`);
					} else if (!set(values[c], value)) {
						return null;
					}
					break;
				} else if (!'qSVhn'.includes(c) || (c === 'n' && arg[j + 1] !== 'v')) {
					return fail(`invalid option -- '${c}'`);
				}
				opts[{q: 'quiet', S: 'server-response', V: 'version', h: 'help', n: 'no-verbose'}[c]] = true;
				j += c === 'n' ? 1 : 0;
			}
		} else {
			opts.urls.push(arg);
		}
	}

	return opts;
};

const wget = async api => {
	const opts = wgetOptions(api, api.args);
	if (!opts) {
		return 2;
	} else if (opts.version) {
		api.out(`GNU Wget ${WGET_VERSION} built on linux-gnu.\n\n+digest +https +ipv6 +iri +large-file +nls +ntlm +opie +psl +ssl/openssl\n`);
		return 0;
	} else if (opts.help) {
		api.out(`GNU Wget ${WGET_VERSION}, a non-interactive network retriever.\n${WGET_USAGE}\nMandatory arguments to long options are mandatory for short options too.\n`);
		return 0;
	} else if (opts.urls.length === 0) {
		api.err(`wget: missing URL\n${WGET_USAGE}\nTry \`wget --help' for more options.\n`);
		return 1;
	}

	// -O is opened before anything is fetched.
	let file = null;
	if (opts.output !== undefined && opts.output !== '-') {
		const opened = api.openWrite(opts.output);
		if (opened.error) {
			api.err(`${opts.output}: ${opened.error}\n`);
			return 1;
		}
		file = opened.output;
	}

	const log = text => !opts.quiet && api.err(text);
	const talk = text => !opts.quiet && !opts['no-verbose'] && api.err(text);
	let status = 0;
	for (const text of opts.urls) {
		const url = parseUrl(text);
		talk(`--${strftime('%Y-%m-%d %H:%M:%S', new Date())}--  ${url?.href ?? text}\n`);
		if (!url) {
			log(`${text}: Invalid URL.\n`);
			status = 1;
			continue;
		} else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			log(`${text}: Unsupported scheme ‘${url.protocol.slice(0, -1)}’.\n`);
			status = 1;
			continue;
		}
		status = await retrieve(api, opts, url, {file, log, talk}) || status;
	}

	return status;
};

const retrieve = async (api, opts, url, {file, log, talk}) => {
	const headers = requestHeaders(opts.headers);
	const body = opts['post-data'];
	const method = opts.method ?? (opts.spider ? 'HEAD' : body === undefined ? 'GET' : 'POST');
	if (body !== undefined && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/x-www-form-urlencoded');
	}

	talk(`Resolving ${url.hostname} (${url.hostname})... `);
	let connection;
	try {
		connection = await send(api, url.href, {method, headers, body}, opts.timeout ? Number(opts.timeout) * 1000 : 0);
	} catch (e) {
		talk(`done.\nConnecting to ${url.hostname}:${portOf(url)}... `);
		log(`failed: ${e.code === 28 ? 'Connection timed out' : 'Connection refused'}.\n`);
		return 4;
	}

	const {response} = connection;
	try {
		talk(`done.\nConnecting to ${url.hostname}:${portOf(url)}... connected.\nHTTP request sent, awaiting response... `);
		if (opts['server-response']) {
			log(`\n${[statusLine(response).trim(), ...headerLines(response)].map(line => `  ${line}\n`).join('')}`);
		} else {
			talk(`${response.status} ${response.statusText || (response.ok ? 'OK' : 'Error')}\n`);
		}
		if (!response.ok) {
			log(`${strftime('%Y-%m-%d %H:%M:%S', new Date())} ERROR ${response.status}: ${response.statusText || 'Error'}.\n\n`);
			return 8;
		}

		const length = Number(response.headers.get('Content-Length'));
		const type = response.headers.get('Content-Type')?.split(';')[0];
		talk(`Length: ${length ? `${length}${length >= 1024 ? ` (${humanSize(length)})` : ''}` : 'unspecified'}${type ? ` [${type}]` : ''}\n`);
		if (opts.spider) {
			talk('Remote file exists.\n\n');
			return 0;
		}

		const stdout = opts.output === '-';
		const name = opts.output;
		if (!stdout && !file) {
			// A new file, which the read-only filesystem refuses.
			const saved = savedName(api, opts, url);
			const {error} = api.openWrite(saved);
			log(`${saved}: ${error}\n\nCannot write to ‘${saved}’ (${error}).\n`);
			return 3;
		}
		talk(`Saving to: ‘${stdout ? 'STDOUT' : name}’\n\n`);

		const started = Date.now();
		let received = 0;
		const decoder = new TextDecoder();
		const write = text => (stdout ? api.out(text) : file.write(text));
		try {
			for (let chunk = await connection.read(); chunk !== null; chunk = await connection.read()) {
				received += chunk.length;
				write(decoder.decode(chunk, {stream: true}));
				await (stdout ? api.drain() : api.abort.race(file.drain()));
			}
		} catch (e) {
			if (!(e instanceof Failure)) {
				throw e;
			}
			const reason = e.code === 28 ? 'Connection timed out' : 'Connection reset by peer';
			log(`\n${strftime('%Y-%m-%d %H:%M:%S', new Date())} (${rate(received / Math.max(Date.now() - started, 1) * 1000)}) - Read error at byte ${received}${length ? `/${length}` : ''} (${reason}). Giving up.\n\n`);
			return 4;
		}
		write(decoder.decode());

		const seconds = Math.max(Date.now() - started, 1) / 1000;
		const size = `[${received}${length ? `/${length}` : ''}]`;
		const now = strftime('%Y-%m-%d %H:%M:%S', new Date());
		if (opts['no-verbose']) {
			log(`${now} URL:${url.href} ${size} -> "${stdout ? '-' : name}" [1]\n`);
			return 0;
		}
		talk(`${(stdout ? '-' : name).padEnd(19).slice(0, 19)} 100%[===================>] ${humanSize(received).padStart(7)}  --.-KB/s    in ${seconds.toFixed(0)}s\n\n`);
		log(`${now} (${rate(received / seconds)}) - ${stdout ? 'written to stdout' : `‘${name}’ saved`} ${size}\n\n`);
		return 0;
	} finally {
		connection.close();
	}
};

// index.html for a directory; a .1, .2... after the name if there's one already.
const savedName = (api, opts, url) => {
	const base = `${opts.prefix ? `${opts.prefix.replace(/\/$/, '')}/` : ''}${decodeURIComponent(nameOf(url.pathname).replace(/^\/$/, '')) || 'index.html'}`;
	let name = base;
	for (let n = 1; !api.fs.lookup(api.resolve(name)).error; n++) {
		name = `${base}.${n}`;
	}
	return name;
};

export const NETWORK = {curl, wget};
