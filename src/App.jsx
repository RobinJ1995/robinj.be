import React, {useState, useEffect} from 'react';
import './style/App.scss';
import {PAGES} from './constants';
import EditorialApp from './view/Editorial';
import TerminalApp from './view/Terminal';
import Desktop from './view/Desktop';

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

const findPage = name => Object.values(PAGES).find(p => p.name === name);

// Also used by the prerenderer (entry-server) so static <title> tags match the client's.
export const pageTitle = path => {
	const pageName = parsePage(path);
	const viewSource = parseViewSource(path);
	const page = findPage(pageName) || Object.values(PAGES).find(p => p['404']);

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

	// `name` may end in `/source` to open that page's source view.
	const navigate = (name, e = null, pushHistory = true) => {
		if (e) {
			e.preventDefault();
		}

		const source = String(name).endsWith('/source');
		const page = findPage(String(name).replace(/\/source$/, ''));

		if (!page) {
			return;
		}

		setPageName(page.name);
		setViewSource(source && !!page.source);

		if (pushHistory && typeof window !== 'undefined') {
			const historyPageTitle = page.title + (source ? ' (Source)' : '') + ' • Robin Jacobs';
			const historyPageName = page.name + (source ? '/source' : '');
			const historyPageUrl = page.url + (source ? '/source' : '');

			window.history.pushState({name: historyPageName, title: historyPageTitle}, historyPageTitle, historyPageUrl);
		}
	};

	let page = findPage(pageName);
	if (!page) {
		const notFound = Object.values(PAGES).find(p => p['404']);
		// Show the 404 without changing the URL.
		if (typeof window !== 'undefined' && pageName !== notFound.name) {
			navigate(notFound.name, null, false);
		}
		page = notFound;
	}

	if (typeof document !== 'undefined') {
		document.title = `${page.title} ${viewSource ? ' (Source)' : ''} • Robin Jacobs`;
	}

	const toggleViewSource = e => {
		if (e) {
			e.preventDefault();
		}

		if (viewSource) {
			return navigate(page.name);
		}

		return navigate(`${page.name}/source`);
	};

	const showSource = viewSource && !!page.source;
	const sourcePage = page.source ? page.name : 'cv';

	const showWindow = win => navigate(win === 'source' ? `${sourcePage}/source` : page.name);

	const renderWindow = (win, onClose) => (win === 'source'
		? <TerminalApp page={sourcePage} onNavigate={navigate} onToggleView={toggleViewSource} onClose={onClose} />
		: <EditorialApp page={page.name} onNavigate={navigate} onToggleView={toggleViewSource} />);

	return (
		<Desktop
			focused={showSource ? 'source' : 'site'}
			hrefs={{site: page.url, source: `/${sourcePage}/source`}}
			address={page.url}
			homeHref={findPage('cv').url}
			onShow={showWindow}
			onHome={e => navigate('cv', e)}
			renderWindow={renderWindow} />
	);
};

export default App;
