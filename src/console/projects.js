import {HOME} from './files';

// ~/Projects holds a link to each of Robin's public repositories on GitHub,
// listed once per page load, the first time something needs to know what's in it.

export const PROJECTS = `${HOME}/Projects`;
const REPOSITORIES_API = 'https://api.github.com/users/RobinJ1995/repos?type=owner&per_page=100';
const TIMEOUT_MS = 6000;

let listed = null;
let request = null;

export const insideProjects = path => path === PROJECTS || path.startsWith(`${PROJECTS}/`);

// Every page of the listing; none at all if a page can't be had.
const fetchAll = async signal => {
	const all = [];
	for (let url = REPOSITORIES_API; url;) {
		const response = await fetch(url, {signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/vnd.github+json'}});
		if (!response.ok) {
			return [];
		}
		all.push(...await response.json());
		url = response.headers.get('Link')?.match(/<([^>]*)>;\s*rel="next"/)?.[1];
	}
	return all;
};

// [{name, url}] once GitHub has answered, or failed to; null before.
export const repositories = () => listed;

export const listRepositories = () => {
	request ??= (async () => {
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
		try {
			listed = (await fetchAll(abort.signal))
				.filter(repo => typeof repo.name === 'string' && typeof repo.html_url === 'string')
				.map(repo => ({name: repo.name, url: repo.html_url}));
		} catch {
			listed = [];
		} finally {
			clearTimeout(timer);
		}
		return listed;
	})();

	return request;
};

// For tests: forget what GitHub said.
export const resetRepositories = () => {
	listed = null;
	request = null;
};
