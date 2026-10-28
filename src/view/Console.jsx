import React, {useState, useEffect, useRef} from 'react';
import {CONTENT} from '../content';
import EmailAddress from '../component/EmailAddress';
import {TitleBar} from './Window';

// The terminal app. xterm.js and the shell load the first time it's opened, so
// they cost nothing until then.
const Console = ({focused, system, onClose, onOpenFile}) => {
	const screenRef = useRef(null);
	const sessionRef = useRef(null);
	const handlers = useRef({onClose, onOpenFile});
	const [cwd, setCwd] = useState('~/portfolio');
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		handlers.current = {onClose, onOpenFile};
	});

	useEffect(() => {
		let cancelled = false;

		import('../console/session')
			.then(({startSession}) => {
				if (!cancelled) {
					sessionRef.current = startSession({
						element: screenRef.current,
						system,
						onExit: () => handlers.current.onClose(),
						onOpenFile: page => handlers.current.onOpenFile(page),
						onCwd: setCwd,
					});
				}
			})
			.catch(() => setFailed(true));

		return () => {
			cancelled = true;
			sessionRef.current?.stop();
			sessionRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (focused) {
			sessionRef.current?.focus();
		}
	}, [focused]);

	return (
		<div className="console">
			<TitleBar title={<><EmailAddress asText>{CONTENT.email}</EmailAddress>: {cwd}</>} closeLabel="Close the terminal" onClose={onClose} />
			<div ref={screenRef} className="console-screen" />
			{failed && <p className="console-failed">The terminal couldn't be loaded.</p>}
		</div>
	);
};

export default Console;
