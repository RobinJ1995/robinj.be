import React, {useState} from 'react';
import {v4 as uuid} from 'uuid';

const random = max => Math.floor(Math.random() * (max + 1));
const randomSpan = () => {
	const length = random(2);

	if (length === 0) {
		return null;
	}

	return <span style={{display: 'none'}}>{uuid().substring(0, length)}</span>;
};

const EmailAddress = ({children}) => {
	const [hover, setHover] = useState(false);

	const email = children.trim();

	const html = email.split('').map(c => <span
		key={uuid()}>{randomSpan()}{c}{randomSpan()}</span>);
	const link = hover ? `mailto:${email}` : 'https://robinj.be/';

	return (<a
		onMouseOver={() => setHover(true)}
		href={link}
	>{html}</a>);
};

export default EmailAddress;
