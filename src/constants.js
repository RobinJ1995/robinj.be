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

const UNIX_EPOCH = new Date(0);
export const YEARS_IN_IRELAND = new Date(new Date() - new Date(2015, 8, 1))
	.getUTCFullYear() - UNIX_EPOCH.getUTCFullYear();

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
			description: `Work on Beeline Professional, the Extended Workforce Platform, with my specific area of
				involvement being the ABAC (Attribute-Based Access Control) solution.

				Took ownership of the in-house ABAC+ReBAC authorisation system; specified and
				implemented several proposals to simplify system internals as well as improve user
				self-service for security policies.`,
			tech: ['Kotlin', 'Java', 'Kubernetes', 'Spring Boot', 'ABAC'],
		},
		{
			title: 'Senior Software Engineer',
			company: 'Rapid7',
			logo: '/img/experience/rapid7.webp',
			type: 'Full-time',
			location: 'Dublin, Ireland (Remote)',
			start: 'Feb 2022',
			end: 'Oct 2023',
			description: `As an extension of my experience as a *Software Engineer II* working for Rapid7
				(see below), during my role as a Senior Software Engineer I have taken on the role of
				team lead and Scrum Master on the sprint team responsible for account management, RBAC
				and Platform integration within the company.

				One of the big projects that I have taken on during my time in this role is for a
				new authentication service. As the lead of this project, my responsibilities include
				the spec, design, and leading the implementation of this service, discussing with and
				obtaining buy-in from stakeholders, and splitting the work up into highly parallelisable
				tasks for the team to work on with clearly defined feature milestones for the project.`,
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
			description: `During my time at Rapid7, I have worked extensive on the company's log search
				product (InsightOps), including the log search engine, alerting, REST APIs and
				integrations with several AWS services.

				My biggest project during my role as an Software Engineer II has been the development
				of an RBAC (Role-Based Access Control) Platform service. I was heavily involved in this
				project from the initial design and implementation stages all the way through to customer
				migrations, over a period of 3 years, with leadership and ownership over the project being
				transfered over to me one year into the project. Aside from the technical challenges,
				this involved coordination across teams and offices to align integration with
				and migration to this new service.

				I have also led the design and implementation of the product's AWS CloudTrail
				integration, and successfully launched the service for customers.

				During my time at Rapid7 I have also been extensively involved in:

				- Development of functionality, fixing of issues, and the handling of third-party pull requests on Github on the company's ingestion libraries. These libraries allow customers to send their log data into the log search engine, and are written in a variety of languages including Java, Python, Javascript, Ruby, PHP and C#.
				- Automation of developer workflows and migration of problematic acceptance testing and build setups to a Docker container-based approach.

				Using mostly Java and Python, employing TDD/BDD development practices.`,
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
			description: `Development of a custom-built management and monitoring solution used to perform
				common maintenance tasks on and monitor the health and performance of 300+ customer
				websites which were each built with a variety of different CMS' and frameworks, and
				development of plugins for each of the used CMS' and frameworks to report back to
				and allow management by the central management and monitoring system in a secure
				manner.

				Other responsibilities included:

				- Development of custom CMS functionality, either as a custom-built solution or as a set of plugins for existing CMS' such as Wordpress and WooCommerce
				- Developing functionality for and fixing issues with the company's pre-existing classified ads system, which was built with the CodeIgniter PHP framework
				- Search engine optimisation (SEO) on customers' websites
				- Setup and maintenance of several different Linux servers running Debian, Ubuntu Server and CentOS. Most of these servers were running a standard LAMP (Linux + Apache + MariaDB + PHP) stack, with others running custom-built applications, internal tooling, and e-mail services.`,
			tech: ['PHP', 'Laravel', 'WordPress', 'WooCommerce', 'CodeIgniter', 'MariaDB', 'Debian', 'CentOS'],
		},
		{
			title: 'Node.js Developer',
			company: 'CloudRanger',
			logo: '/img/experience/cloudranger.webp',
			type: 'Full-time, college internship',
			location: 'Letterkenny, Ireland',
			start: 'Mar 2016',
			end: 'Jun 2017',
			description: `Development of an API service using Node.js, Express, and DynamoDB as the database.
				This API was consumed by an AngularJS frontend as well as a Scala agent responsible
				for interfacing with external services and hardware devices, and (aside from the
				database) used Amazon S3 as a storage backend.

				CloudRanger later got acquired by Druva.`,
			tech: ['Node.js', 'Express.js', 'DynamoDB'],
		},
		{
			title: 'Web Developer',
			company: 'Heuvel-Folie-Serres',
			logo: '/img/experience/heuvel-folie-serres.webp',
			type: 'Part-time, during high school & college',
			location: 'Sint-Lenaarts, Belgium',
			start: 'Aug 2010',
			end: 'Dec 2015',
			description: `Development of several websites for the company, with custom-built CMS systems where
				needed.

				Functionality includes ability for employees of the company to manage websites’
				contents including uploading pictures, after which pictures will be processed by
				the CMS (resize, compress, apply watermark, …).

				Every website functions as a standalone web application, but limited (as desired)
				integration between websites was implemented.

				This was my part-time job throughout my high school and college education.`,
			tech: ['PHP', 'Laravel', 'MariaDB'],
		},
	],

	projects: [
		{
			name: 'Sprint Retrospective',
			tagline: 'Realtime retrospective tool.',
			url: 'sprintretro.app',
			logo: '/img/project/sprintretrospective.webp',
			description: `One of those projects that started out as a throwaway experiment to play with some
				different technologies, and happened to turn into something useful.

				*"How do these new React Hooks work?"* turned into *"Let's hook this up to an
				API and a database... I wonder what MongoDB is like?"* and quickly became a full
				Kubernetes cluster with each component of the application running in Docker containers
				that are auto-scaling and load balanced across several Kubernetes nodes.

				The project currently consists of:

				- React frontend
				- Node.js API server
				- Node.js websocket server
				- MongoDB, as the database
				- Redis, for storage of temporary data such as active participants, and real-time streaming of activity on a retrospective through the use of Redis Pub/Sub`,
			tech: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'Redis', 'Docker', 'Kubernetes'],
		},
		{
			name: 'DistroHopper',
			tagline: 'Android home screen replacement themed after Linux distros.',
			url: 'play.google.com/store/apps/details?id=be.robinj.distrohopper',
			logo: '/img/project/distrohopper.webp',
			description: `Custom home screen replacement for Android with themes resembling various Linux
				distributions as well as a search feature with support for several (internal and
				external) search sources.

				This is a spare-time project I started when I was in high school, which I am still
				working on based on feedback users leave on the Google Play Store, or on the Github
				repository. The codebase has however seen a couple of rewrites in the meantime.`,
			tech: ['Java', 'Kotlin', 'Android SDK'],
		},
		{
			name: 'SINControl',
			tagline: 'Control panel for a Debian server used by a student org.',
			url: 'github.com/RobinJ1995/penguinControl',
			logo: '/img/project/sincontrol.svg',
			description: `Control panel for both users and administrators of a Debian server.

				Ability to manage system users, Apache vHosts, FTP-accounts, e-mail addresses and
				forwards, run system maintenance tasks, …

				This was built during my time volunteering for the Student Information Network (SIN)
				organisation at Thomas More University of Applied Sciences.`,
			tech: ['PHP', 'Laravel', 'MariaDB', 'Apache', 'Postfix', 'ownCloud'],
		},
	],

	volunteering: [
		{
			title: 'Mentor',
			org: 'Teen-Turn',
			logo: '/img/experience/teen-turn.webp',
			location: 'Dublin, Ireland',
			start: 'Sep 2019',
			end: 'Dec 2019',
			description: `Teen-Turn aims to provide teen girls the opportunity to gain hands-on technology
				experience so that they can visualise themselves in those kinds of careers and
				therefore make third level course choices accordingly.

				Winner *EU Digital Impact Organisation of the Year*`,
		},
		{
			title: 'Mentor',
			org: 'CoderDojo Letterkenny',
			logo: '/img/experience/coderdojo.webp',
			location: 'Letterkenny, Ireland',
			start: 'Sep 2015',
			end: 'Feb 2016',
			description: `Guiding children between the ages of 7 and 18 years old in learning basic programming
				principles in a playful environment.

				This CoderDojo mainly focused on teaching kids basic programming logic with
				Scratch.`,
		},
		{
			title: 'Coach',
			org: 'CoderDojo Belgium',
			logo: '/img/experience/coderdojo.webp',
			location: 'Geel, Belgium',
			start: 'Jan 2015',
			end: 'Jun 2016',
			description: `Guiding children between the ages of 7 and 18 years old in learning basic programming
				principles in a playful environment.

				The CoderDojo for which I volunteered offered a multitude of trajectories for the
				kids to follow, including Scratch, Python, Arduino, HTML/CSS and C#.`,
		},
		{
			title: 'System administrator & developer',
			org: 'Student Information Network (SIN)',
			logo: '/img/experience/sin.webp',
			location: 'Geel, Belgium',
			start: 'Sep 2013',
			end: 'Aug 2016',
			description: `Volunteering as a system administrator and web developer for a student organisation
				offering web hosting, tech support, and other web services (including cloud storage)
				to students of the college.

				Because of my volunteering I learnt a lot about Linux system administration and
				virtualisation as well as gained more experience in PHP development and integration
				with other services.`,
		},
	],

	education: [
		{
			degree: 'Applied Computing',
			school: 'Letterkenny Institute of Technology',
			location: 'Letterkenny, Ireland',
			start: 'Sep 2015',
			end: 'Feb 2016',
			description: `- 4th year Honours Degree Applied Computing
				- Special Purpose Award in Social/Civic Engagement`,
		},
		{
			degree: 'Applied Computer Science',
			school: 'Thomas More University of Applied Sciences',
			location: 'Geel, Belgium',
			start: 'Sep 2013',
			end: 'Jun 2016',
			description: 'Bachelor Applied Computer Science ending with a year abroad at Letterkenny Institute of Technology and an internship at CloudRanger (Druva).',
		},
		{
			degree: 'Industrial Sciences & Applied Computing',
			school: 'SO-Zenit',
			location: 'Turnhout, Belgium',
			start: 'Sep 2007',
			end: 'Jun 2013'
		},
	],

	languages: [
		{name: 'Dutch', level: 'Native speaker'},
		{name: 'English', level: 'Bilingual proficiency · CEFR C2'},
		{name: 'French', level: 'Notions'},
	],
});
