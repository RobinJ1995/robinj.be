import React from 'react';
import Technology from './Technology';

const Project = ({
					 name,
					 link,
					 logo,
					 children: description,
					 technologiesUsed = [],
					 integrationWith = []
				 }) => {
	const technologies = technologiesUsed.map(Technology);
	const integrations = integrationWith.map(Technology);

	return (<div className="project">
		<a href={link} className="project-link"><h2 className="project-name">{name}</h2></a>
		<div className="project-description">{description}</div>
		{logo &&
		<a href={link} className="project-logo-link"><img className="project-logo"
														  src={`/img/project/${logo}`}
														  alt={`${name} project logo`}/></a>}
		{technologiesUsed.length > 0 &&
		<p className="project-technologies-used">Technologies used: {technologies}</p>}
		{integrationWith.length > 0 &&
		<p className="project-integration-with">Integration with: {integrations}</p>}
	</div>);
};

export default Project;
