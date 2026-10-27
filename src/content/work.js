// Newest first. Descriptions are Markdown (see src/markdown.js).
export default [
	{
		title: 'Senior Software Engineer',
		company: 'Beeline',
		logo: '/img/experience/beeline.webp',
		type: 'Full-time',
		location: 'Dublin, Ireland (Remote)',
		start: 'Sep 2024',
		end: 'Sep 2026',
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
];
