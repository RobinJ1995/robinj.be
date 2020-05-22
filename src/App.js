import React, {useState} from 'react';
import './App.scss';
import {PAGES} from './constants';

const initialPage = String(window.location.pathname).replace('/', '').trim() ||
	Object.values(PAGES).find(page => page.home).name;

const App = () => {
	const [page, setPage] = useState(initialPage);

	const navigate = (pageName, e = null) => {
		if (e) {
			e.preventDefault();
		}

		const page = PAGES[String(pageName).toUpperCase()];

		setPage(page.name);
		document.title = `${page.title} • Robin`;
		window.history.pushState((({name, url}) => ({name, url}))(page), page.title, page.url);
	};

	const PageContent = PAGES[String(page).toUpperCase()].content;

	return (
		<div>
			<header>
				<h1>Robin</h1>

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
				<PageContent/>
			</main>
			<footer>

			</footer>
		</div>
	);
};

export default App;
