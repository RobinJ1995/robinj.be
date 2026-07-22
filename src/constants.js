// Route/page registry. Both views (editorial + terminal) render from CONTENT
// below; the source-view toggle now switches between the two *designs* rather
// than showing raw markup, so pages no longer carry an inlined `?raw` source.
export const PAGES = Object.freeze({
	CV: {
		name: 'cv',
		url: '/cv',
		title: 'CV',
		home: true,
		menu: true,
		source: true,
	},
	Projects: {
		name: 'projects',
		url: '/projects',
		title: 'Projects',
		menu: true,
		source: true,
	},
	Contact: {
		name: 'contact',
		url: '/contact',
		title: 'Contact',
		menu: true,
		source: true,
	},
	// whoami has no rendered equivalent — it only exists inside the source view.
	Whoami: {
		name: 'whoami',
		url: '/whoami',
		title: 'whoami',
		menu: false,
		source: true,
		sourceOnly: true,
	},
	NotFound: {
		name: '404',
		url: '/404',
		title: '[404] Not Found',
		'404': true,
		menu: false,
	},
});

export const ROBIN_AT_ROBINJ_DOT_BE = 'robin@robinj.be';

// Single source of truth for the site's content. Both the editorial and the
// terminal/IDE views are driven from this object.
export const CONTENT = Object.freeze({
	name: 'Robin Jacobs',
	tagline: 'Developer & open-source enthusiast',
	location: 'Dublin, Ireland',
	email: ROBIN_AT_ROBINJ_DOT_BE,
	linkedin: 'linkedin.com/in/robin-jacobs',
	github: 'github.com/RobinJ1995',
	bio: [
		'Senior Software Engineer with a soft spot for authorisation layers and platform services; designing the stuff that quietly powers everything else.',
		'I gravitate towards authorisation systems, distributed back-ends, and the hidden, gnarly bits of platform engineering. Outside of work I tinker with side-projects, geek out at open-source conferences, and keep a Kubernetes cluster alive in my flat for no especially good reason.',
	],

	work: [
		{
			title: 'Senior Software Engineer',
			company: 'Beeline',
			logo: '/img/experience/beeline.webp',
			type: 'Full-time',
			location: 'Dublin, Ireland (Remote)',
			start: 'Sep 2024',
			end: 'Present',
			summary: 'Beeline Professional — the Extended Workforce Platform. Owning the in-house ABAC + ReBAC authorisation system.',
			bullets: [
				'Took ownership of the ABAC+ReBAC system end-to-end.',
				'Specified and shipped proposals to simplify internals and improve self-service for security policies.',
			],
			tech: ['Java', 'Authorisation', 'ABAC', 'ReBAC'],
		},
		{
			title: 'Senior Software Engineer',
			company: 'Rapid7',
			logo: '/img/experience/rapid7.webp',
			type: 'Full-time',
			location: 'Dublin, Ireland (Remote)',
			start: 'Feb 2022',
			end: 'Oct 2023',
			summary: 'Team lead and Scrum Master for account management, RBAC and Platform integration. Led a new authentication service from spec to delivery.',
			bullets: [
				'Spec, design and implementation of a new platform authentication service.',
				'Stakeholder alignment, milestone planning, parallelisable task design for the team.',
			],
			tech: ['Java', 'Python', 'Docker', 'Vert.x', 'Cassandra'],
		},
		{
			title: 'Software Engineer II',
			company: 'Rapid7',
			logo: '/img/experience/rapid7.webp',
			type: 'Full-time',
			location: 'Dublin, Ireland',
			start: 'Jul 2017',
			end: 'Feb 2022',
			promoted: true,
			summary: 'Built and led RBAC Platform service over three years. Worked extensively on InsightOps log search, alerting and AWS integrations.',
			bullets: [
				'Designed and shipped an RBAC Platform service; led customer migrations across three years.',
				'Led AWS CloudTrail integration from design to GA.',
				'Maintained ingestion libraries (Java, Python, JS, Ruby, PHP, C#).',
				'Migrated build & acceptance testing to Docker-based workflows.',
			],
			tech: ['Java', 'Python', 'Docker', 'Vert.x', 'Dropwizard', 'Cassandra'],
		},
		{
			title: 'PHP Developer & Sysadmin',
			company: 'Webtown',
			logo: '/img/experience/webtown.webp',
			type: 'Full-time',
			location: 'Letterkenny, Ireland',
			start: 'Sep 2016',
			end: 'Jul 2017',
			summary: 'Custom monitoring solution covering 300+ customer sites built on a mix of CMSes and frameworks.',
			bullets: [
				'Built central management & monitoring across WordPress / WooCommerce / CodeIgniter / Laravel deployments.',
				'Linux server setup & maintenance (Debian, Ubuntu, CentOS) — LAMP stacks, mail, internal tooling.',
			],
			tech: ['PHP', 'Laravel', 'WordPress', 'WooCommerce', 'MariaDB', 'Debian'],
		},
		{
			title: 'Node.js Developer',
			company: 'CloudRanger',
			logo: '/img/experience/cloudranger.webp',
			type: 'College internship',
			location: 'Letterkenny, Ireland',
			start: 'Mar 2016',
			end: 'Jun 2017',
			summary: 'API service consumed by an AngularJS frontend and a Scala agent. Later acquired by Druva.',
			tech: ['Node.js', 'Express', 'DynamoDB', 'S3'],
		},
		{
			title: 'Web Developer',
			company: 'Heuvel-Folie-Serres',
			logo: '/img/experience/heuvel-folie-serres.webp',
			type: 'Part-time, during high school & college',
			location: 'Sint-Lenaarts, Belgium',
			start: 'Aug 2010',
			end: 'Dec 2015',
			summary: 'Built several customer-facing sites with custom CMSes, image processing, and limited cross-site integration. My part-time job through school.',
			tech: ['PHP', 'Laravel', 'MariaDB'],
		},
	],

	projects: [
		{
			name: 'Sprint Retrospective',
			tagline: 'Realtime retrospective tool that runs on a Kubernetes cluster.',
			url: 'sprintretro.app',
			logo: '/img/project/sprintretrospective.webp',
			blurb: 'Started as a throwaway "how do React Hooks work" experiment. Ended up as a full K8s cluster: React frontend, Node API, websocket server, MongoDB and Redis Pub/Sub for live activity.',
			tech: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'Redis', 'Docker', 'Kubernetes'],
		},
		{
			name: 'DistroHopper',
			tagline: 'Android home screen replacement themed after Linux distros.',
			url: 'play.google.com/store/apps/details?id=be.robinj.distrohopper',
			logo: '/img/project/distrohopper.webp',
			blurb: 'A spare-time project started in high school — a custom Android launcher with themes resembling various Linux distributions and a multi-source search feature. Still maintained based on Play Store feedback.',
			tech: ['Java', 'Android SDK'],
		},
		{
			name: 'SINControl',
			tagline: 'Control panel for a Debian server used by a student org.',
			url: 'github.com/RobinJ1995/penguinControl',
			logo: '/img/project/sincontrol.svg',
			blurb: 'Manage system users, Apache vHosts, FTP, e-mail, maintenance jobs and more. Built during my time volunteering with the Student Information Network (SIN) at Thomas More.',
			tech: ['PHP', 'Laravel', 'MariaDB', 'Apache', 'Postfix', 'ownCloud'],
		},
	],

	volunteering: [
		{title: 'System admin & developer', org: 'Student Information Network (SIN)', location: 'Geel, Belgium', start: 'Sep 2013', end: 'Aug 2016'},
		{title: 'Coach', org: 'CoderDojo Belgium', location: 'Geel, Belgium', start: 'Jan 2015', end: 'Jun 2016'},
		{title: 'Mentor', org: 'CoderDojo Letterkenny', location: 'Letterkenny, Ireland', start: 'Sep 2015', end: 'Feb 2016'},
		{title: 'Mentor', org: 'Teen-Turn', location: 'Dublin, Ireland', start: 'Sep 2019', end: 'Dec 2019', note: 'Winner — EU Digital Impact Organisation of the Year.'},
	],

	education: [
		{degree: 'BSc Applied Computing', school: 'Letterkenny Institute of Technology', location: 'Letterkenny, Ireland', start: '2015', end: '2016', note: 'A "semester" abroad that has now lasted a decade.'},
		{degree: 'BSc Applied Computer Science', school: 'Thomas More University', location: 'Geel, Belgium', start: '2013', end: '2016'},
		{degree: 'Industrial Sciences & Applied Computing', school: 'SO-Zenit', location: 'Turnhout, Belgium', start: '2007', end: '2013'},
	],

	languages: [
		{name: 'Dutch', level: 'Native'},
		{name: 'English', level: 'Bilingual proficiency · CEFR C2'},
		{name: 'French', level: 'Notions'},
	],
});
