import fs from 'node:fs';
import path from 'node:path';
import {render, routes} from './dist-ssr/entry-server.js';

const template = fs.readFileSync('build/index.html', 'utf8');

const outFileFor = route => {
	if (route === '/') {
		return 'build/index.html';
	} else if (route === '/404') {
		// nginx serves /404.html as the fallback (try_files ... /404.html ...).
		return 'build/404.html';
	}

	return path.join('build', route, 'index.html');
};

for (const route of routes) {
	const {html, title} = render(route);
	const page = template
		.replace('<!--app-html-->', html)
		.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);

	const outFile = outFileFor(route);
	fs.mkdirSync(path.dirname(outFile), {recursive: true});
	fs.writeFileSync(outFile, page);

	console.log(`prerendered ${route} -> ${outFile}`);
}
