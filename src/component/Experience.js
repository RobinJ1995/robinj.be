import React from 'react';
import Technology from './Technology';
import dateFormat from 'dateformat';

const formatEmploymentDate = date => dateFormat(date, 'm/\'yy');

const Experience = ({
				title,
				company,
				location,
				start = null,
				end = null,
				children: description,
				technologies = []
			 }) => {
	return (<div className="experience">
		<h4 className="experience-title-and-company"><span className="experience-title">{title}</span> @ <span className="experience-company">{company}</span></h4>

		<p className="experience-location">{location}</p>
		{start && <p className="experience-start-end">
			<span className="experience-start">{formatEmploymentDate(start)}</span>
			-
			<span className="experience-end">{end ? formatEmploymentDate(end) : '...'}</span>
		</p>}

		<div className="experience-description">{description}</div>

		{technologies.length > 0 &&
			<p className="cv-technologies">Technologies: {technologies.map(Technology)}</p>}
	</div>);
};

export default Experience;
