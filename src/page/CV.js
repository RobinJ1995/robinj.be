import React from 'react';
import Experience from '../component/Experience';
import {TECHNOLOGIES} from '../constants';
import Projects from './Projects';

const CV = () => (<div className="cv">
	<div className="cv-experience">
		<h2>Work experience</h2>
		<Experience
			title="Software Engineer II"
			company="Rapid7"
			location="Dublin, Ireland"
			start={new Date(2017, 6, 24)}
			technologies={[
				TECHNOLOGIES.JAVA,
				TECHNOLOGIES.PYTHON,
				TECHNOLOGIES.DOCKER]}
		>
			<p>Work on the company’s logging product, including the log search engine, alerting, REST APIs and integrations with several AWS services.</p>
			<p>Using mostly Java and Python, employing TDD/BDD development practices.</p>
		</Experience>
		<Experience
			title="PHP Developer & Sysadmin"
			company="Webtown"
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
			<p>Development of custom CMS (with e-commerce functionality) with the Laravel PHP framework, variety of WordPress & WooCommerce plugins, and control panel to manage and perform maintenance tasks on websites, as well as other backend development and Linux sysadmin tasks.</p>
		</Experience>
		<Experience
			title="Node.js API Developer (internship)"
			company="CloudRanger"
			location="Letterkenny, Ireland"
			start={new Date(2016, 2, 1)}
			end={new Date(2017, 5, 1)}
			technologies={[
				TECHNOLOGIES.NODE_JS,
				TECHNOLOGIES.EXPRESS_JS,
				TECHNOLOGIES.DYNAMODB]}
		>
			<p>API development using Node.js, Express, and DynamoDB as the database. Integration with AngularJS frontend as well as a Scala application for interfacing with external services, and several parts of Amazon Web Services (AWS) including S3.</p>
			<p>This was a 3 month internship as part of my education.</p>
		</Experience>
		<Experience
			title="Web Developer"
			company="Heuvel-Folie-Serres"
			location="Sint-Lenaarts, Belgium"
			technologies={[
				TECHNOLOGIES.PHP,
				TECHNOLOGIES.LARAVEL,
				TECHNOLOGIES.MARIADB]}
		>
			<p>Development of several websites for the company, with custom-built CMS systems where needed.</p>
			<p>Functionality includes ability for employees of the company to manage websites’ contents including uploading pictures, after which pictures will be processed by the CMS (resize, compress, apply watermark, …).</p>
			<p>Every website functions as a standalone web application, but limited (as desired) integration between websites was implemented.</p>
			<p>This was my part-time job throughout my high school and college education.</p>
		</Experience>
	</div>
	<div className="cv-projects">
		<h2>Personal projects</h2>
		<Projects />
	</div>
	<div className="cv-volunteering">
		<h2>Volunteering experience</h2>
		<Experience
			title="System administrator & developer"
			company="Student Information Network (SIN)"
			location="Geel, Belgium"
			start={new Date(2013, 8, 1)}
			end={new Date(2016, 7, 31)}
		>
			<p>Volunteering as a system administrator and web developer for a student organisation offering web hosting, tech support, and other web services (including cloud storage) to students of the college.</p>
			<p>Because of my volunteering I learnt a lot about Linux system administration and virtualisation as well as gained more experience in PHP development and integration with other services.</p>
		</Experience>
		<Experience
			title="Coach"
			company="CoderDojo Belgium"
			location="Geel, Belgium"
			start={new Date(2015, 0, 1)}
			end={new Date(2016, 5, 1)}
		>
			<p>Guiding children between the ages of 7 and 18 years old in learning basic programming principles in a playful environment.</p>
			<p>The CoderDojo for which I volunteered offered a multitude of trajectories for the kids to follow, including Scratch, Python, Arduino, HTML/CSS and C#.</p>
		</Experience>
		<Experience
			title="Mentor"
			company="CoderDojo Letterkenny"
			location="Letterkenny, Ireland"
			start={new Date(2015, 8, 1)}
			end={new Date(2016, 1, 1)}
		>
			<p>Guiding children between the ages of 7 and 18 years old in learning basic programming principles in a playful environment.</p>
			<p>This CoderDojo mainly focused on teaching kids basic programming logic with Scratch.</p>
		</Experience>
		<Experience
			title="Mentor"
			company="Teen-Turn"
			location="Dublin, Ireland"
			start={new Date(2019, 8, 1)}
			end={new Date(2019, 11, 1)}
		>
			<p>Teen-Turn aims to provide teen girls the opportunity to gain hands-on technology experience so that they can visualise themselves in those kinds of careers and therefore make third level course choices accordingly.</p>
			<p>Winner <em>EU Digital Impact Organisation of the Year</em></p>
		</Experience>
	</div>
	<div className="cv-languages">
		<h2>(Non-Programming) Languages</h2>
		<ul>
			<li>Dutch: Native Speaker</li>
			<li>English: Bilingual Proficiency (<em title="Common European Framework of Reference for Languages">CEFR</em> level <em title="This is the highest attainable level">C2</em>)</li>
			<li>French: Notions</li>
		</ul>
	</div>
	<div className="cv-education">
		<h2>Education</h2>
		<Experience
			title="Applied Computing"
			company="Letterkenny Institute of Technology"
			location="Letterkenny, Ireland"
			start={new Date(2015, 8, 1)}
			end={new Date(2016, 1, 1)}
		>
			<ul>
				<li>"Semester" abroad (how I ended up in Ireland)</li>
				<li>4th year Honours Degree Applied Computing</li>
				<li>Special Purpose Award in Social/Civic Engagement</li>
			</ul>
		</Experience>
		<Experience
			title="Applied Computer Science"
			company="Thomas More"
			location="Geel, Belgium"
			start={new Date(2013, 8, 1)}
			end={new Date(2016, 5, 1)}
		>
			<ul>
				<li>Bachelor Applied Computer Science</li>
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
