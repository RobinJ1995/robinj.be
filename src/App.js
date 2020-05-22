import React, {useState} from 'react';
import './style/App.scss';
import {PAGES} from './constants';

const initialPage = (String(window.location.pathname).replace('/', '').trim() ||
	Object.values(PAGES).find(page => page.home).name);

const App = () => {
	const [pageName, setPageName] = useState(initialPage);

	const navigate = (pageName, e = null) => {
		if (e) {
			e.preventDefault();
		}

		const page = PAGES[String(pageName).toUpperCase()];

		setPageName(page.name);
		document.title = `${page.title} • Robin Jacobs`;
		window.history.pushState((({name, url}) => ({name, url}))(page), page.title, page.url);
	};

	const page = PAGES[String(pageName).toUpperCase()];
	const PageContent = page.content;

	return (
		<div id="page">
			<header>
				<img className="picture" src="/img/robin.jpg" alt="" />
				<h1>Robin Jacobs</h1>
				<p className="slogan">Developer & open-source enthusiast</p>

				<nav>
					<ul>
						{Object.values(PAGES).map(page => <li key={page.name}>
							<a
								href={page.url}
								onClick={(e) => navigate(page.name, e)}
							>{page.title}</a>
						</li>)}
					</ul>
				</nav>
			</header>
			<main>
				<h2>{page.title}</h2>
				<PageContent/>
			</main>
			<footer>

			</footer>
		</div>
	);
};

export default App;
