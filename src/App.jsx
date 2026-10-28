import React, {useState, useEffect, useRef} from 'react';
import './style/App.scss';
import {PAGES} from './constants';
import EditorialApp from './view/Editorial';
import EditorApp from './view/Editor';
import Desktop from './view/Desktop';
import Console from './view/Console';
import VideoPlayer from './view/VideoPlayer';

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
// A page's source view shares its title, as it does its URL.
export const pageTitle = path => {
	const page = findPage(parsePage(path)) || Object.values(PAGES).find(p => p['404']);

	return `${page.title} • Robin Jacobs`;
};

const App = ({initialPath}) => {
	const path = initialPath ?? homePath();
	const [viewSource, setViewSource] = useState(() => parseViewSource(path));
	const [pageName, setPageName] = useState(() => parsePage(path));
	// Whether the website or editor is open. With neither, the URL names no page.
	const [pageOpen, setPageOpen] = useState(true);
	const pageless = useRef(false);

	// Back and forward go from page to page, in whichever window is in front.
	useEffect(() => {
		const handlePopState = e => {
			if (e?.state?.name) {
				return navigate(e.state.name, e, false, true);
			}

			return window.location.reload();
		};

		window.addEventListener('popstate', handlePopState);

		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	// `name` may end in `/source` for the page's source view; `keepView` keeps the
	// current view instead. Only a change of page adds to the history.
	const navigate = (name, e = null, pushHistory = true, keepView = false) => {
		if (e) {
			e.preventDefault();
		}

		const source = String(name).endsWith('/source');
		const page = findPage(String(name).replace(/\/source$/, ''));

		if (!page) {
			return;
		}

		setPageName(page.name);
		setViewSource(inSource => (source || (keepView && inSource)) && !!page.source);

		if (pushHistory && page.name !== pageName && typeof window !== 'undefined') {
			window.history.pushState({name: page.name}, '', page.url);
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

	// The URL is always the page's, never its source view's, so that's what gets
	// shared; with the website and editor both closed, it's the bare site.
	useEffect(() => {
		const {pathname} = window.location;
		const url = !pageOpen ? '/' : pageless.current ? page.url : pathname.replace(/\/source\/?$/, '') || '/';
		pageless.current = !pageOpen;
		// Named, so that coming back to the page arrived at doesn't reload it.
		if (url !== pathname || window.history.state?.name !== page.name) {
			window.history.replaceState({name: page.name}, '', url);
		}
		document.title = pageTitle(url);
	}, [page.name, viewSource, pageOpen]);

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

	// With the website and editor both closed, they open on the home page again.
	const onPageOpen = open => {
		setPageOpen(open);
		if (!open) {
			setPageName(Object.values(PAGES).find(p => p.home).name);
		}
	};
	const sourcePage = page.source ? page.name : 'cv';

	const showWindow = win => navigate(win === 'source' ? `${sourcePage}/source` : page.name);

	const renderWindow = (win, {close, raise, focused, system}) => {
		if (win === 'video') {
			return <VideoPlayer onClose={close} />;
		} else if (win === 'console') {
			const openInEditor = name => {
				raise('source');
				navigate(`${name}/source`);
			};

			return <Console focused={focused} system={system} onClose={close} onOpenFile={openInEditor} />;
		}

		return win === 'source'
			? <EditorApp page={sourcePage} onNavigate={navigate} onToggleView={toggleViewSource} onClose={close} />
			: <EditorialApp page={page.name} onNavigate={navigate} onToggleView={toggleViewSource} />;
	};

	return (
		<Desktop
			focused={showSource ? 'source' : 'site'}
			hrefs={{site: page.url, source: `/${sourcePage}/source`}}
			address={page.url}
			homeHref={findPage('cv').url}
			onShow={showWindow}
			onHome={e => navigate('cv', e)}
			onPageOpen={onPageOpen}
			renderWindow={renderWindow} />
	);
};

export default App;
