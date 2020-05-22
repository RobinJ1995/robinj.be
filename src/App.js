import React, {useState, useEffect} from 'react';
import './style/App.scss';
import {PAGES} from './constants';
import ViewSource from './component/ViewSource';

const initialPage = String(window.location.pathname)
	.replace(/^\//, '')
	.replace(/\/$/, '')
	.trim()
	|| Object.values(PAGES).find(page => page.home)?.name;

const App = () => {
	const [viewSource, setViewSource] = useState(String(initialPage).endsWith('/source'));
	const [pageName, setPageName] = useState(initialPage.replace(/\/source$/, ''));

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

	const page = Object.values(PAGES).find(page => page.name === pageName);
	if (!page) {
		setPageName(Object.values(PAGES).find(page => page['404']).name);

		return <h1>404 Not Found</h1>;
	}

	document.title = `${page.title} ${viewSource ? ' (Source)' : ''} • Robin Jacobs`;
	const PageContent = viewSource ? () => <ViewSource>{page.source}</ViewSource> : page.content;

	const navigate = (pageName, e = null, pushHistory = true) => {
		if (e) {
			e.preventDefault();
		}

		const source = pageName.endsWith('/source');
		const page = Object.values(PAGES).find(({ name }) => name === String(pageName).replace(/\/source$/, ''));

		setPageName(page.name);
		setViewSource(source);
		
		if (pushHistory) {
			const historyPageTitle = page.title + (source ? ' (Source)' : '') + ' • Robin Jacobs';
			const historyPageName = page.name + (source ? '/source' : '');
			const historyPageUrl = page.url + (source ? '/source' : '');

			const historyState = { name: historyPageName, title: historyPageTitle };

			window.history.pushState(historyState, historyPageTitle, historyPageUrl);
		}
	};

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
				<img className="picture" src="/img/robin.webp" alt="" />
				<h1>Robin Jacobs</h1>
				<p className="slogan">Developer & open-source enthusiast</p>

				<nav>
					<ul>
						{Object.values(PAGES)
							.filter(page => page.menu)
							.map(page => <li key={page.name}>
								<a
									href={page.url}
									onClick={(e) => navigate(page.name, e)}
								>{page.title}</a>
							</li>)}
					</ul>
				</nav>
			</header>
			<main>
				<h2>{page.title} {page.source &&
					<a
						href={`${page.url}${viewSource ? '' : '/source'}`}
						title="View source"
						className={['view-source-button', viewSource ? 'active' : null].filter(x => !!x).join(' ')}
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
