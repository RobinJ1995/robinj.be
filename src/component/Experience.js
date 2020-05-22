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
	return (<div className="job">
		<h3 className="job-title-and-company"><span className="job-title">{title}</span> @ <span className="job-company">{company}</span></h3>
		{start && <p className="job-start-end">
			<span className="job-start">{formatEmploymentDate(start)}</span>
			-
			<span className="job-end">{end ? formatEmploymentDate(end) : '...'}</span>
		</p>}
		<p className="job-location">{location}</p>

		<div className="job-description">{description}</div>

		{technologies.length > 0 &&
			<p className="cv-technologies">Technologies: {technologies.map(Technology)}</p>}
	</div>);
};

export default Experience;
