const Fs = require('fs');

const PAGES = ['Contact', 'CV', 'Projects', 'NotFound'];

/*
 * I can't just use Fs.readFile to embed the source of the files into the generated Javascript at
 * build time because create-react-app has intentionally crippled import/require (https://github.com/facebook/create-react-app/issues/7892).
 * As a workaround, this script is executed before the build runs.
 */

const sources = PAGES.map( name => ([ name, String(Fs.readFileSync(`src/page/${name}.js`)) ]))
	.reduce((acc, [name, source]) => ({ ...acc, [name]: source }), []);
Fs.writeFileSync('src/generated/page-source.json', JSON.stringify(sources, null, 4));
