import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Minimal static server that mirrors docker/nginx.conf's
//   try_files $uri $uri/index.html /404.html /index.html;
// so the E2E tests exercise the real built artifact and its routing fallback.
const ROOT = path.resolve('build');
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.woff2': 'font/woff2',
};

const isFile = p => {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
};

const send = (res, status, file) => {
	res.writeHead(status, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
	fs.createReadStream(file).pipe(res);
};

http.createServer((req, res) => {
	const urlPath = decodeURIComponent(req.url.split('?')[0]);
	const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
	const direct = path.join(ROOT, safe);

	if (urlPath !== '/' && isFile(direct)) {
		return send(res, 200, direct);
	}

	const indexed = path.join(ROOT, safe, 'index.html');
	if (isFile(indexed)) {
		return send(res, 200, indexed);
	}

	const notFound = path.join(ROOT, '404.html');
	if (isFile(notFound)) {
		return send(res, 404, notFound);
	}

	return send(res, 200, path.join(ROOT, 'index.html'));
}).listen(PORT, () => console.log(`serving build/ on http://localhost:${PORT}`));
