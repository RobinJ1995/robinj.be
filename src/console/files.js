import {CONTENT} from '../content';
import {parseMarkdown, inlineToText} from '../markdown';

export const HOME = '/home/robin';
export const PORTFOLIO = `${HOME}/portfolio`;

// Markdown as plain lines, one per paragraph or bullet, blank lines between blocks.
const markdownLines = (markdown, indent) => (markdown ? parseMarkdown(markdown) : []).flatMap((block, i) => [
	...(i ? [''] : []),
	...(block.type === 'ul'
		? block.items.map(item => `${indent}- ${inlineToText(item)}`)
		: [`${indent}${inlineToText(block.inline)}`]),
]);

const profile = () => [
	'# ─────────────────────────────',
	`# ${CONTENT.name}`,
	`# ${CONTENT.tagline}`,
	'# ─────────────────────────────',
	`export ROLE="${CONTENT.role}"`,
	`export LOCATION="${CONTENT.location}"`,
].join('\n');

const whoami = () => {
	const prompt = `${CONTENT.email}:~$`;

	return [
		`${prompt} whoami`,
		CONTENT.name,
		`${prompt} cat ~/.profile`,
		profile(),
		`${prompt} fortune --about-me`,
		...CONTENT.bio,
		`${prompt} ls -la ./contact`,
		`-rw-r--r--  robin  e-mail     ${CONTENT.email}`,
		`-rw-r--r--  robin  linkedin   ${CONTENT.linkedin}`,
		`-rw-r--r--  robin  github     ${CONTENT.github}`,
	].join('\n');
};

const cv = () => [
	'# CV',
	`> ${CONTENT.bio[0]}`,
	'',
	'## Work Experience',
	...CONTENT.work.flatMap(w => [
		'',
		`### ${w.title} @ ${w.company} [${w.start} → ${w.end}]`,
		`  ${w.location} · ${w.type}`,
		...markdownLines(w.description, '  '),
		...(w.tech ? [`  tech: ${w.tech.map(t => `"${t}"`).join(', ')}`] : []),
	]),
	'',
	'## Education',
	...CONTENT.education.flatMap(e => [
		'',
		`### ${e.degree} @ ${e.school} [${e.start} → ${e.end}]`,
		`  ${e.location}`,
		...markdownLines(e.description, '  '),
	]),
	'',
	'## Volunteering',
	...CONTENT.volunteering.flatMap(v => [
		`  - ${v.title} @ ${v.org} [${v.start} → ${v.end}] ${v.location}`,
		...markdownLines(v.description, '    '),
	]),
	'',
	'## (Non-Programming) Languages',
	...CONTENT.languages.map(l => `  - ${l.name}: ${l.level}`),
].join('\n');

const sideQuests = () => CONTENT.projects.flatMap((p, i) => [
	...(i ? [''] : []),
	`- name: ${p.name}`,
	`  url: https://${p.url}`,
	'  description: >',
	...markdownLines(p.description, '    '),
	`  stack: [${p.tech.join(', ')}]`,
	...(p.integrations ? [`  integration_with: [${p.integrations.join(', ')}]`] : []),
]).join('\n');

const contact = () => [
	'# Hi!',
	`name: ${CONTENT.name}`,
	`location: ${CONTENT.location}`,
	'channels:',
	`  - email: ${CONTENT.email}`,
	`  - linkedin: https://${CONTENT.linkedin}`,
	`  - github: https://${CONTENT.github}`,
].join('\n');

// Text files end with a newline, so what's printed after them starts on a line of its own.
const asFile = text => () => `${text()}\n`;

// The editor's files as plain text, by path; `page` is the file's page in the editor.
export const FILES = {
	[`${HOME}/.profile`]: {text: asFile(profile)},
	[`${PORTFOLIO}/whoami.txt`]: {text: asFile(whoami), page: 'whoami'},
	[`${PORTFOLIO}/cv.md`]: {text: asFile(cv), page: 'cv'},
	[`${PORTFOLIO}/side-quests.yml`]: {text: asFile(sideQuests), page: 'side-quests'},
	[`${PORTFOLIO}/contact.yml`]: {text: asFile(contact), page: 'contact'},
};
