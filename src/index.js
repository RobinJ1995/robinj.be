import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

const root = document.getElementById('root');
if (root.hasChildNodes()) {
	ReactDOM.hydrate(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
		root);
} else {
	ReactDOM.render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
		root);
}

serviceWorker.unregister();
