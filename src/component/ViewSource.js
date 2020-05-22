import React from 'react';
import Highlight from 'react-highlight.js';
import 'highlight.js/scss/vs.scss'

const ViewSource = ({ children }) => {
	return <div className="view-source">
		<Highlight language="javascript">{children}</Highlight>
	</div>;
};

export default ViewSource;
