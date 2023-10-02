import React from 'react';
import Experience from '../component/Experience';
import {TECHNOLOGIES, YEARS_IN_IRELAND} from '../constants';
import Projects from './Projects';

const CV = () => (<div className="cv">
	<div className="cv-experience">
		<h3>Work Experience</h3>
		<Experience
			title="Senior Software Engineer"
			company="Rapid7"
			type="Full-time"
			location="Dublin, Ireland"
			start={new Date(2022, 1, 10)}
			end={new Date(2023, 9, 2)}
		>
			<p>An an extension of my experience as a <em>Software Engineer II</em> working for Rapid7
			(see below), during my role as a Senior Software Engineer I have taken on the role of
			team lead and Scrum Master on the sprint team responsible for account management, RBAC
			and Platform integration within the company.</p>
			<p>One of the big projects that I have taken on during my time in this role is for a
			new authentication service. As the lead of this project, my responsibilities include
			the spec, design, and leading the implementation of this service, discussing with and
			obtaining buy-in from stakeholders, and splitting the work up into highly parallelisable
			tasks for the team to work on with clearly defined feature milestones for the project.</p>
		</Experience>
		<Experience
			title="Software Engineer II"
			company="Rapid7"
			type="Full-time"
			location="Dublin, Ireland"
			start={new Date(2017, 6, 24)}
			end={new Date(2022, 1, 10)}
			promoted={true}
			technologies={[
				TECHNOLOGIES.JAVA,
				TECHNOLOGIES.PYTHON,
				TECHNOLOGIES.DOCKER,
				TECHNOLOGIES.VERTX,
				TECHNOLOGIES.DROPWIZARD,
				TECHNOLOGIES.CASSANDRA]}
		>
			<p>During my time at Rapid7, I have worked extensive on the company's log search
				product (InsightOps), including the log search engine, alerting, REST APIs and
				integrations with several AWS services.</p>
			<p>My biggest project during my role as an Software Engineer II has been the development
				of an RBAC <span className="abbrev">(Role-Based Access Control)</span> Platform
				service. I was heavily involved in this project from the initial design and
				implementation stages all the way through to customer migrations, over a period
				of 3 years, with leadership and ownership over the project being transfered
				over to me one year into the project. Aside from the technical challenges,
				this involved coordination across teams and offices to align integration with
				and migration to this new service.</p>
			<p>I have also led the design and implementation of the product's AWS CloudTrail
				integration, and successfully launched the service for customers.</p>

			<p>During my time at Rapid7 I have also been extensively involved in:</p>
			<ul>
				<li>Development of functionality, fixing of issues, and the handling of third-party
					pull requests on Github on the company's ingestion libraries. These libraries
					allow customers to send their log data into the log search engine, and are
					written in a variety of languages including Java, Python, Javascript, Ruby, PHP
					and C#.</li>
				<li>Automation of developer workflows and migration of problematic acceptance
					testing and build setups to a Docker container-based approach.</li>
			</ul>
			<p>Using mostly Java and Python, employing TDD/BDD development practices.</p>
		</Experience>
		<Experience
			title="PHP Developer & Sysadmin"
			company="Webtown"
			type="Full-time"
			location="Letterkenny, Ireland"
			start={new Date(2016, 8, 3)}
			end={new Date(2017, 6, 14)}
			technologies={[
				TECHNOLOGIES.PHP,
				TECHNOLOGIES.LARAVEL,
				TECHNOLOGIES.WORDPRESS,
				TECHNOLOGIES.WOOCOMMERCE,
				TECHNOLOGIES.CODEIGNITER,
				TECHNOLOGIES.MARIADB,
				TECHNOLOGIES.DEBIAN,
				TECHNOLOGIES.CENTOS]}
		>
			<p>Development of a custom-built management and monitoring solution used to perform
				common maintenance tasks on and monitor the health and performance of 300+ customer
				websites which were each built with a variety of different CMS' and frameworks, and
				development of plugins for each of the used CMS' and frameworks to report back to
				and allow management by the central management and monitoring system in a secure
				manner.</p>
			<p>Other responsibilities included:</p>
			<ul>
				<li>Development of custom CMS functionality, either as a custom-built solution or as
					a set of plugins for existing CMS' such as Wordpress and WooCommerce</li>
				<li>Developing functionality for and fixing issues with the company's pre-existing
					classified ads system, which was built with the CodeIgniter PHP framework</li>
				<li>Search engine optimisation (SEO) on customers' websites</li>
				<li>Setup and maintenance of several different Linux servers running Debian,
					Ubuntu Server and CentOS. Most of these servers were running a standard LAMP <
					span className="abbrev">(Linux + Apache + MariaDB + PHP)</span> stack,
					with others running custom-built applications, internal tooling, and e-mail
					services.</li>
			</ul>
		</Experience>
		<Experience
			title="Node.js Developer"
			company="CloudRanger"
			type="Full-time, college internship"
			location="Letterkenny, Ireland"
			start={new Date(2016, 2, 1)}
			end={new Date(2017, 5, 1)}
			technologies={[
				TECHNOLOGIES.NODE_JS,
				TECHNOLOGIES.EXPRESS_JS,
				TECHNOLOGIES.DYNAMODB]}
		>
			<p>Development of an API service using Node.js, Express, and DynamoDB as the database.
				This API was consumed by an AngularJS frontend as well as a Scala agent responsible
				for interfacing with external services and hardware devices, and (aside from the
				database) used Amazon S3 as a storage backend.</p>
			<p><small>CloudRanger later got acquired by Druva.</small></p>
		</Experience>
		<Experience
			title="Web Developer"
			type="Part-time, during high school & college"
			company="Heuvel-Folie-Serres"
			location="Sint-Lenaarts, Belgium"
			start={new Date(2010, 7, 1)}
			end={new Date(2015, 11, 1)}
			technologies={[
				TECHNOLOGIES.PHP,
				TECHNOLOGIES.LARAVEL,
				TECHNOLOGIES.MARIADB]}
		>
			<p>Development of several websites for the company, with custom-built CMS systems where
				needed.</p>
			<p>Functionality includes ability for employees of the company to manage websites’
				contents including uploading pictures, after which pictures will be processed by
				the CMS (resize, compress, apply watermark, …).</p>
			<p>Every website functions as a standalone web application, but limited (as desired)
				integration between websites was implemented.</p>
			<p>This was my part-time job throughout my high school and college education.</p>
		</Experience>
	</div>
	<div className="cv-projects">
		<h3>Personal Projects</h3>
		<Projects />
	</div>
	<div className="cv-volunteering">
		<h3>Volunteering Experience</h3>
		<Experience
			title="System administrator & developer"
			company="Student Information Network (SIN)"
			location="Geel, Belgium"
			start={new Date(2013, 8, 1)}
			end={new Date(2016, 7, 31)}
		>
			<p>Volunteering as a system administrator and web developer for a student organisation
				offering web hosting, tech support, and other web services (including cloud storage)
				to students of the college.</p>
			<p>Because of my volunteering I learnt a lot about Linux system administration and
				virtualisation as well as gained more experience in PHP development and integration
				with other services.</p>
		</Experience>
		<Experience
			title="Coach"
			company="CoderDojo Belgium"
			location="Geel, Belgium"
			start={new Date(2015, 0, 1)}
			end={new Date(2016, 5, 1)}
		>
			<p>Guiding children between the ages of 7 and 18 years old in learning basic programming
				principles in a playful environment.</p>
			<p>The CoderDojo for which I volunteered offered a multitude of trajectories for the
				kids to follow, including Scratch, Python, Arduino, HTML/CSS and C#.</p>
		</Experience>
		<Experience
			title="Mentor"
			company="CoderDojo Letterkenny"
			location="Letterkenny, Ireland"
			start={new Date(2015, 8, 1)}
			end={new Date(2016, 1, 1)}
		>
			<p>Guiding children between the ages of 7 and 18 years old in learning basic programming
				principles in a playful environment.</p>
			<p>This CoderDojo mainly focused on teaching kids basic programming logic with
				Scratch.</p>
		</Experience>
		<Experience
			title="Mentor"
			company="Teen-Turn"
			location="Dublin, Ireland"
			start={new Date(2019, 8, 1)}
			end={new Date(2019, 11, 1)}
		>
			<p>Teen-Turn aims to provide teen girls the opportunity to gain hands-on technology
				experience so that they can visualise themselves in those kinds of careers and
				therefore make third level course choices accordingly.</p>
			<p>Winner <em>EU Digital Impact Organisation of the Year</em></p>
		</Experience>
	</div>
	<div className="cv-languages">
		<h3>(Non-Programming) Languages</h3>
		<ul>
			<li>Dutch: Native Speaker</li>
			<li>English: Bilingual Proficiency
				(<em title="Common European Framework of Reference for Languages">CEFR</em
				> level <em title="This is the highest attainable level">C2</em>)</li>
			<li>French: Notions</li>
		</ul>
	</div>
	<div className="cv-education">
		<h3>Education</h3>
		<Experience
			title="Applied Computing"
			company="Letterkenny Institute of Technology"
			location="Letterkenny, Ireland"
			start={new Date(2015, 8, 1)}
			end={new Date(2016, 1, 1)}
		>
			<ul>
				<li>"Semester" abroad (that was {YEARS_IN_IRELAND} years ago, so... a very long
					semester?)</li>
				<li>4th year Honours Degree Applied Computing</li>
				<li>Special Purpose Award in Social/Civic Engagement</li>
			</ul>
		</Experience>
		<Experience
			title="Applied Computer Science"
			company="Thomas More University of Applied Sciences"
			location="Geel, Belgium"
			start={new Date(2013, 8, 1)}
			end={new Date(2016, 5, 1)}
		>
			<ul>
				<li>Bachelor Applied Computer Science with a semester abroad at Letterkenny
					Institute of Technology and an internship abroad at CloudRanger (Druva).</li>
			</ul>
		</Experience>
		<Experience
			title="Industrial Sciences & Applied Computing"
			company="SO-Zenit"
			location="Turnhout, Belgium"
			start={new Date(2007, 8, 1)}
			end={new Date(2013, 5, 1)}
		>
			<ul>
				<li>High school education</li>
			</ul>
		</Experience>
	</div>
</div>);

export default CV;
