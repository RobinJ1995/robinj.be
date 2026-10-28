import React, {useEffect, useRef, useState} from 'react';

// Somewhere on the one page it was opened on. Moving it along in place, rather
// than by its src, adds nothing to the tab's history.
const Frame = ({url}) => {
	const frame = useRef(null);
	const [src] = useState(url);
	const shown = useRef(url);

	useEffect(() => {
		if (url !== shown.current) {
			shown.current = url;
			frame.current.contentWindow.location.replace(url);
		}
	}, [url]);

	return <iframe ref={frame} className="dt-web-page" src={src} title={url} referrerPolicy="no-referrer" />;
};

// A site other than this one, in the browser: which one is the desktop's to say.
// Each page gets a frame of its own, whose first load adds nothing to the tab's
// history either.
const WebPage = ({url}) => <Frame key={url.split('#')[0]} url={url} />;

export default WebPage;
