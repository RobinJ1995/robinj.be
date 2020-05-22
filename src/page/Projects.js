import React from 'react';
import {TECHNOLOGIES} from '../constants';
import Project from '../component/Project';

const Projects = () => (<div className="projects">
	<Project
		name="DistroHopper"
		link="https://play.google.com/store/apps/details?id=be.robinj.distrohopper"
		logo="distrohopper.webp"
		technologiesUsed={[
			TECHNOLOGIES.JAVA,
			TECHNOLOGIES.ANDROID_SDK]}>
		<p>Custom home screen replacement for Android with themes resembling various Linux
			distributions as well as a search feature with support for several (internal and
			external) search sources.</p>
		<p>This is a spare-time project I started when I was in high school, which I am still
			working on based on feedback users leave on the Google Play Store, or on the Github
			repository. The codebase has however seen a couple of rewrites in the meantime.</p>
	</Project>
	<Project
		name="Sprint Retrospective"
		link="https://sprintretrospective.eu/"
		logo="sprintretrospective.webp"
		technologiesUsed={[
			TECHNOLOGIES.REACT,
			TECHNOLOGIES.NODE_JS,
			TECHNOLOGIES.EXPRESS_JS,
			TECHNOLOGIES.MONGODB,
			TECHNOLOGIES.DOCKER,
			TECHNOLOGIES.KUBERNETES]}>
		<p>One of those projects that started out as a throwaway experiment to play with some
			different technologies, and happened to turn into something useful.</p>
		<p><em>"How do these new React Hooks work?"</em> turned into <em>"Let's hook this up to an
			API and a database... I wonder what MongoDB is like?"</em> and quickly became a full
			Kubernetes cluster with each component of the application running in Docker containers
			that are replicated/load balanced across 2 nodes.</p>
	</Project>
	<Project
		name="SINControl"
		link="https://github.com/RobinJ1995/penguinControl#readme"
		logo="sincontrol.svg"
		technologiesUsed={[
			TECHNOLOGIES.PHP,
			TECHNOLOGIES.LARAVEL,
			TECHNOLOGIES.MARIADB]}
		integrationWith={[
			TECHNOLOGIES.APACHE,
			TECHNOLOGIES.PROFTPD,
			TECHNOLOGIES.POSTFIX,
			TECHNOLOGIES.MARIADB,
			TECHNOLOGIES.OWNCLOUD,
			TECHNOLOGIES.CRON]}>
		<p>Control panel for both users and administrators of a Debian server.</p>
		<p>Ability to manage system users, Apache vHosts, FTP-accounts, e-mail addresses and
			forwards, run system maintenance tasks, …</p>
	</Project>
</div>);

export default Projects;
