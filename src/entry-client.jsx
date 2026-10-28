import React from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import './index.css';
import App from './App';

const root = document.getElementById('root');
const app = (
	<React.StrictMode>
		<App initialPath={window.location.pathname} />
	</React.StrictMode>
);

// A build prerenders every page; the dev server leaves it to the client.
if (root.firstElementChild) {
	hydrateRoot(root, app);
} else {
	createRoot(root).render(app);
}
