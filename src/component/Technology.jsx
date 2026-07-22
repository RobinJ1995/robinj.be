import React from 'react';

const Technology = ({
						title,
						link = null
					}) => {
	if (link) {
		return <a className="technology" href={link}>{title}</a>;
	}

	return <span className="technology">{title}</span>;
};

export default Technology;
