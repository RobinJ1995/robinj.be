import React from 'react';
import EmailAddress from '../component/EmailAddress';
import {ROBIN_AT_ROBINJ_DOT_BE} from '../constants';

const Contact = () => (
	<div>
		<p>My CV and a page describing some of the projects I have worked on can be accessed from
			the menu. If you wish to contact me, you can do so either via e-mail or on LinkedIn.</p>
		<ul>
			<li>
				{ /* To annoy the spam bots */ }
				E-mail: <EmailAddress>{ROBIN_AT_ROBINJ_DOT_BE}</EmailAddress>
			</li>
			<li>
				LinkedIn: <a
					href="https://linkedin.com/in/robin-jacobs"
					>linkedin.com/in/robin-jacobs</a>
			</li>
		</ul>
	</div>
);

export default Contact;
