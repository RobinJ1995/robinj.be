import React, {useState, useEffect} from 'react';
import './style/App.scss';
import {PAGES} from './constants';
import ViewSource from './component/ViewSource';

// Pure path parsers (no `window`), so they run identically on the server and client.
const parseViewSource = path => String(path)
	.replace(/\/$/, '')
	.endsWith('/source');
const parsePage = path => String(path)
	.replace(/^\//, '')
	.replace(/\/$/, '')
	.replace(/\/source$/, '')
	.trim()
	|| Object.values(PAGES).find(page => page.home)?.name;

const homePath = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

// Shared title logic, reused by the prerenderer (entry-server) so static <title>
// tags match what the client sets after hydration.
export const pageTitle = path => {
	const pageName = parsePage(path);
	const viewSource = parseViewSource(path);
	const page = Object.values(PAGES).find(p => p.name === pageName)
		|| Object.values(PAGES).find(p => p['404']);

	return `${page.title} ${viewSource ? ' (Source)' : ''} • Robin Jacobs`;
};

const App = ({initialPath}) => {
	const path = initialPath ?? homePath();
	const [viewSource, setViewSource] = useState(() => parseViewSource(path));
	const [pageName, setPageName] = useState(() => parsePage(path));

	useEffect(() => {
		const handlePopState = e => {
			if (e?.state?.name) {
				return navigate(e.state.name, e, false);
			}

			return window.location.reload();
		};

		window.addEventListener('popstate', handlePopState);

		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	const navigate = (pageName, e = null, pushHistory = true) => {
		if (e) {
			e.preventDefault();
		}

		const source = pageName.endsWith('/source');
		const page = Object.values(PAGES).find(({ name }) => name === String(pageName).replace(/\/source$/, ''));

		setPageName(page.name);
		setViewSource(source);

		if (pushHistory && typeof window !== 'undefined') {
			const historyPageTitle = page.title + (source ? ' (Source)' : '') + ' • Robin Jacobs';
			const historyPageName = page.name + (source ? '/source' : '');
			const historyPageUrl = page.url + (source ? '/source' : '');

			const historyState = { name: historyPageName, title: historyPageTitle };

			window.history.pushState(historyState, historyPageTitle, historyPageUrl);
		}
	};

	const page = Object.values(PAGES).find(page => page.name === pageName);
	if (!page) {
		navigate(Object.values(PAGES).find(page => page['404']).name, null, false);

		return <h1>404 Not Found</h1>;
	}

	if (typeof document !== 'undefined') {
		document.title = `${page.title} ${viewSource ? ' (Source)' : ''} • Robin Jacobs`;
	}
	const PageContent = viewSource ? () => <ViewSource>{page.source}</ViewSource> : page.content;

	const toggleViewSource = e => {
		if (e) {
			e.preventDefault();
		}

		if (viewSource) {
			return navigate(pageName.replace(/\/source$/, ''));
		}

		return navigate(`${pageName}/source`);
	}

	return (
		<div id="page">
			<header>
				<img className="picture" src="/img/me.webp" alt="" />
				<h1>Robin Jacobs</h1>
				<p className="slogan">Developer &amp; open-source enthusiast</p>

				<nav>
					<ul>
						{Object.values(PAGES)
							.filter(p => p.menu)
							.map(p => <li
								key={p.name}
								className={p.name === page?.name ? 'current-page' : ''}>
								<a
									href={p.url}
									onClick={(e) => navigate(p.name, e)}
								>{p.title}</a>
							</li>)}
					</ul>
				</nav>
			</header>
			<main>
				<h2>{page.title} {page.source &&
					<a
						href={`${page.url}${viewSource ? '' : '/source'}`}
						title="View source"
						className={[
								'view-source-button',
								viewSource ? 'active' : null
							].filter(x => !!x).join(' ')}
						onClick={toggleViewSource}
					><img src="/img/icon/source.svg" alt="[View source]" /></a>}</h2>
				<PageContent />
			</main>
			<footer>

			</footer>
		</div>
	);
};

export default App;
