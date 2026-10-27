// Route/page registry. Both views (editorial + terminal) render from CONTENT
// (src/content); the source-view toggle now switches between the two *designs* rather
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
	SideQuests: {
		name: 'side-quests',
		url: '/side-quests',
		title: 'Side Quests',
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
