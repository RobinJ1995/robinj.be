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

// Shown in the prerendered HTML and during the client's first (hydration) render,
// so the email address never appears in the static markup — harder for scraping
// bots to grab.
const PLACEHOLDER = '───';

const EmailAddress = ({children}) => {
	const [mounted, setMounted] = useState(false);
	const [hover, setHover] = useState(false);

	useEffect(() => setMounted(true), []);

	const email = children.trim();

	// Server render and the first client render must match for clean hydration, and
	// neither should contain the address. Only after mounting do we reveal the real,
	// randomly obfuscated e-mail (the randomness is intentional — it defeats bots
	// that pattern-match on the markup).
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
