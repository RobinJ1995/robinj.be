import React from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import 'highlight.js/scss/vs.scss';

hljs.registerLanguage('javascript', javascript);

const ViewSource = ({ children }) => {
	// Input is the site's own source (never user input), so the innerHTML is safe.
	const highlighted = hljs.highlight(String(children), { language: 'javascript' }).value;

	return <div className="view-source">
		<pre><code
			className="hljs language-javascript"
			dangerouslySetInnerHTML={{ __html: highlighted }}
		/></pre>
	</div>;
};

export default ViewSource;
