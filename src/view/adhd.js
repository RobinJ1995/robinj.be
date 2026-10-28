import {PAGES} from '../constants';

// "ADHD mode", while the adhd kernel module is loaded: the desktop drives itself.
// The website and editor are clicked through while dragged about, then settle in
// the same places. Meanwhile music plays a track at a time, and Wikipedia is read
// from article to linked article. Whatever it opens or clicks in comes to the front.

// Each from where it gets going. The music starts with one of these...
const OPENING_TRACKS = [
	{youtube: '9Yz0mbKtTe0', start: 75, title: 'Andromedik - Oblivion'},
	{youtube: 'x6MsDjLnXzE', start: 42, title: 'I like it - SLESS & Loboski'},
	{youtube: 'gkcio2-NSE4', start: 66, title: 'Don\'t Let Go'},
	{youtube: 'umD2HqMrKTE', start: 55, title: 'Devotion'},
	{youtube: '5Y7a0v7NRkc', start: 76, title: 'Sound of You'},
	{youtube: 'Zk7nPFV-35Q', start: 49, title: 'Helemaal Lijp'},
	{youtube: 'fvki3Q4QTEA', start: 44, title: 'On Lock'},
	{youtube: 'L78h9d1rL6k', start: 94, title: 'Reach the Stars'},
	{youtube: 'f0HVslUBbyo', start: 134, title: 'Trip to Ireland'},
	{youtube: 'yfi2E0X9_8o', start: 90, title: 'Da Tweekaz - Forever'},
	{youtube: 'hlr0dKBU-Gs', start: 139, title: 'Sub Zero Project - HALO'},
	{youtube: 'Nf0or6BXr60', start: 67, title: 'Full Send (Pirapus Remix)'},
	{youtube: 'hJ49bFXwLPc', start: 56, title: 'wHERE the rhythm goes'},
];
// ...and these come up only once it's going.
const LATER_TRACKS = [
	{youtube: '2yJgwwDcgV8', start: 3, title: 'Nyan Cat! [Official]'},
	{youtube: '6-8E4Nirh9s', start: 51, title: 'Caramella Girls - Caramelldansen'},
	{youtube: 'HnLEFJjYitg', start: 30, title: 'ADHD'},
	{youtube: 'rkWTZ-86T6o', start: 61, title: 'Now Or Never'},
	{youtube: 'U5L9adxYYRE', start: 34, title: 'Turtles'},
	{youtube: 'el7mxGc5Ju0', start: 62, title: 'Jan Klaassen De Trompetter'},
];
const TRACKS = [...OPENING_TRACKS, ...LATER_TRACKS];
const WIKIPEDIA = 'https://en.wikipedia.org/wiki/';
const FIRST_ARTICLE = 'Linux';
const ARTICLE_API = 'https://en.wikipedia.org/w/api.php?action=parse&prop=links%7Csections&format=json&formatversion=2&origin=*&redirects=1&page=';
// Where an article's appendices begin: from there on, it's all at the bottom.
const APPENDIX = /^(see also|notes|footnotes|references|citations|sources|bibliography|works cited|further reading|external links|notes and references)$/i;
const NEW_WINDOW_CHANCE = 0.15;
// The windows it opens or resizes are no more oblong than 3:2, either way.
const RATIO = 1.5;
const BACK_CHANCE = 0.15;
// How long into it the music starts, Wikipedia soon after.
const SECOND_STAGE_MS = 5000;
// The video player's share of the screen's width.
const VIDEO_WIDTH = [0.34, 0.42];
const KEYS = ['x', 'y', 'width', 'height'];
const FRAME_MS = 16;

class Stopped extends Error {}

const between = (min, max) => min + Math.random() * (max - min);
const pickOne = items => items[Math.floor(Math.random() * items.length)];

const wait = (ms, signal) => new Promise((resolve, reject) => {
	const timer = setTimeout(resolve, ms);
	signal.addEventListener('abort', () => {
		clearTimeout(timer);
		reject(new Stopped());
	}, {once: true});
});

// A restless hand's pause: mostly a moment, now and then a while.
const restlessly = signal => wait(Math.random() < 0.7 ? between(120, 350) : between(700, 1400), signal);

const towards = (from, to, t) => Object.fromEntries(KEYS.map(key => [key, from[key] + (to[key] - from[key]) * t]));
// Slow to start and to stop, so that even a sudden turn is smooth.
const ease = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// Somewhere else on the stage, at some other size for `app`, no more oblong than
// `ratio` either way.
const anywhere = (desktop, app, ratio = Infinity) => {
	const stage = desktop.stage();
	const min = desktop.minSize(app);
	const most = {width: stage.width * 0.8, height: stage.height * 0.8};
	const narrowest = Math.max(min.width, min.height / ratio);
	const width = between(narrowest, Math.max(narrowest, Math.min(most.width, most.height * ratio)));
	const shortest = Math.max(min.height, width / ratio);
	const height = between(shortest, Math.max(shortest, Math.min(most.height, width * ratio)));
	return {x: between(0, stage.width - width), y: between(0, stage.height - height), width, height};
};

// A drag as a restless hand makes it: by way of somewhere it wasn't heading,
// past the mark and back, now quick, now hesitating, each stretch of it smooth.
const drag = async (desktop, win, to, signal) => {
	let from = desktop.geometry(win);
	if (!from) {
		return;
	}

	// In proportion: no more oblong than where it starts or ends.
	const stage = desktop.stage();
	const halfway = towards(from, to, between(0.3, 0.7));
	const swell = between(0.85, 1.15);
	const detour = {
		x: halfway.x + between(-0.15, 0.15) * stage.width,
		y: halfway.y + between(-0.15, 0.15) * stage.height,
		width: halfway.width * swell,
		height: halfway.height * swell,
	};
	const past = towards(from, to, between(1.06, 1.18));
	const overshoot = {...past, height: to.height * past.width / to.width};
	for (const stop of [detour, overshoot, to]) {
		const frames = Math.round(between(120, 320) / FRAME_MS);
		for (let frame = 1; frame <= frames; frame++) {
			desktop.place(win, towards(from, stop, ease(frame / frames)));
			await wait(FRAME_MS, signal);
		}
		from = stop;
		if (Math.random() < 0.3) {
			await wait(between(80, 200), signal);
		}
	}
};

const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y
	&& inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

// Where the video player lands: anywhere, at about the same size every time, but
// not all of it behind the browser in front. If it would be, it goes past one of
// that browser's edges instead, unless the browser covers the whole stage.
const videoPlace = desktop => {
	const stage = desktop.stage();
	const width = Math.max(desktop.minSize('video').width, stage.width * between(...VIDEO_WIDTH));
	const height = width * 9 / 16 + 46;
	const place = {x: between(0, stage.width - width), y: between(0, stage.height - height), width, height};
	const browser = desktop.geometry(desktop.frontmost('site'));
	if (!browser || !inside(place, browser)) {
		return place;
	}

	const out = [
		browser.x > 0 && {x: between(0, Math.min(browser.x, stage.width - width))},
		browser.x + browser.width < stage.width && {x: between(Math.max(0, browser.x + browser.width - width), stage.width - width)},
		browser.y > 0 && {y: between(0, Math.min(browser.y, stage.height - height))},
		browser.y + browser.height < stage.height && {y: between(Math.max(0, browser.y + browser.height - height), stage.height - height)},
	].filter(Boolean);
	return {...place, ...pickOne(out)};
};

const appendices = sections => {
	const first = sections.findIndex(section => APPENDIX.test(section.line));
	return first < 0 ? sections.length : first;
};

const articleUrl = title => WIKIPEDIA + encodeURIComponent(title.replace(/ /g, '_'));

// What `title` is called where it redirects, the anchors of its sections up to its
// appendices, and the articles it links to; none of either if Wikipedia can't say.
const lookUp = async (title, signal) => {
	try {
		const response = await fetch(ARTICLE_API + encodeURIComponent(title), {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
		const {parse} = await response.json();
		return {
			title: parse.title,
			anchors: parse.sections.slice(0, appendices(parse.sections)).map(section => section.anchor),
			links: parse.links.filter(link => link.ns === 0 && link.exists).map(link => link.title),
		};
	} catch {
		return {title, anchors: [], links: []};
	} finally {
		if (signal.aborted) {
			throw new Stopped();
		}
	}
};

// Opened and in front: at `geometry` where windows aren't maximised.
const openInFront = (desktop, app, content, geometry) => {
	const win = desktop.open(app, content, desktop.movable() ? geometry : null);
	desktop.show(win);
	return win;
};

const clickAbout = async (desktop, signal) => {
	const pages = Object.values(PAGES).filter(page => page.menu || page.source).map(page => page.name);

	desktop.showPage('site');
	for (let i = 0; i < 8; i++) {
		await restlessly(signal);
		desktop.showPage('site');
		desktop.navigate(pickOne(pages));
	}

	desktop.showPage('source');
	for (let i = 0; i < 8; i++) {
		await restlessly(signal);
		desktop.showPage('source');
		desktop.navigate(`${pickOne(pages)}/source`);
	}

	for (let i = 0; i < 8; i++) {
		await restlessly(signal);
		desktop.showPage(pickOne(['site', 'source']));
	}
};

const dragAbout = async (desktop, signal) => {
	for (let i = 0; i < 4; i++) {
		await restlessly(signal);
		const app = pickOne(['site', 'source']);
		await drag(desktop, desktop.showPage(app), anywhere(desktop, app, RATIO), signal);
	}
};

// A track, then a break, then another, never the same twice running.
const playMusic = async (desktop, signal) => {
	let track = null;
	for (;;) {
		track = pickOne(track ? TRACKS.filter(other => other !== track) : OPENING_TRACKS);
		const player = openInFront(desktop, 'video', {video: track}, videoPlace(desktop));
		await wait(between(10_000, 25_000), signal);
		desktop.close(player);
		await wait(between(0, 4000), signal);
	}
};

const readWikipedia = async (desktop, signal) => {
	let browser = openInFront(desktop, 'site', {url: `${WIKIPEDIA}Main_Page`}, anywhere(desktop, 'site', RATIO));
	// Wherever it goes, the window going there comes to the front.
	const go = (win, url) => {
		desktop.show(win);
		return desktop.update(win, {url});
	};
	await wait(between(2000, 4000), signal);
	let title = FIRST_ARTICLE;
	go(browser, articleUrl(title));
	// The article each Wikipedia window shows.
	const read = new Map([[browser, title]]);

	for (;;) {
		// About halfway to the next article, down to somewhere in this one. Wikipedia
		// gives a redirect's page its article's name, so it's skimmed by that.
		const {anchors, links, ...article} = await lookUp(title, signal);
		title = article.title;
		read.set(browser, title);
		const dwell = between(1500, 4000);
		const skim = dwell * between(0.4, 0.6);
		await wait(skim, signal);
		if (anchors.length) {
			go(browser, `${articleUrl(title)}#${pickOne(anchors)}`);
		}
		await wait(dwell - skim, signal);

		const earlier = [...read.keys()].filter(win => win !== browser && desktop.isOpen(win));
		if (earlier.length && Math.random() < BACK_CHANCE) {
			browser = pickOne(earlier);
			title = read.get(browser);
			desktop.show(browser);
			continue;
		}

		const next = pickOne(links);
		if (!next) {
			continue;
		}

		title = next;
		// Closed meanwhile, or on a whim: in a new window from here on.
		if (Math.random() < NEW_WINDOW_CHANCE || !go(browser, articleUrl(title))) {
			browser = openInFront(desktop, 'site', {url: articleUrl(title)}, anywhere(desktop, 'site', RATIO));
		}
		read.set(browser, title);
	}
};

// Windows only move where they aren't maximised. They settle in the same places
// every time: the website in its own, the editor over it and a little smaller.
const firstStage = async (desktop, signal) => {
	await Promise.all([clickAbout(desktop, signal), desktop.movable() && dragAbout(desktop, signal)]);
	if (desktop.movable()) {
		await restlessly(signal);
		const site = desktop.showPage('site');
		await drag(desktop, site, desktop.defaultGeometry(site), signal);
		desktop.place(site, null);
		await restlessly(signal);
		const source = desktop.showPage('source');
		const editor = desktop.defaultGeometry(source);
		await drag(desktop, source, {
			x: editor.x + editor.width * 0.12, y: editor.y + editor.height * 0.06, width: editor.width * 0.88, height: editor.height * 0.88,
		}, signal);
	}
};

const secondStage = async (desktop, signal) => {
	await wait(SECOND_STAGE_MS, signal);
	await Promise.all([playMusic(desktop, signal), wait(between(3000, 5000), signal).then(() => readWikipedia(desktop, signal))]);
};

const run = (desktop, signal) => Promise.all([firstStage(desktop, signal), secondStage(desktop, signal)]);

// Runs until `signal` aborts.
export const runAdhd = (desktop, signal) => run(desktop, signal).catch(e => {
	if (!(e instanceof Stopped)) {
		throw e;
	}
});
