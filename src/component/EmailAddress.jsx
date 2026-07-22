import React, {useState, useEffect} from 'react';
import {v4 as uuid} from 'uuid';

const random = max => Math.floor(Math.random() * (max + 1));
const randomSpan = () => {
	const length = random(2);

	if (length === 0) {
		return null;
	}

	return <span style={{display: 'none'}}>{uuid().substring(0, length)}</span>;
};

const PLACEHOLDER = '───';

const EmailAddress = ({children}) => {
	const [mounted, setMounted] = useState(false);
	const [hover, setHover] = useState(false);

	useEffect(() => setMounted(true), []);

	const email = children.trim();

	// The server and first client render show only the placeholder: the address
	// stays out of the static HTML (bots get nothing) and hydration stays clean.
	// It's revealed after mount, still randomly obfuscated — the randomness is
	// deliberate, so don't make it deterministic.
	if (!mounted) {
		return <a href="https://robinj.be/">{PLACEHOLDER}</a>;
	}

	const html = email.split('').map(c => <span
		key={uuid()}>{randomSpan()}{c}{randomSpan()}</span>);
	const link = hover ? `mailto:${email}` : 'https://robinj.be/';

	return (<a
		onMouseOver={() => setHover(true)}
		href={link}
	>{html}</a>);
};

export default EmailAddress;
