import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {runAdhd} from './adhd';

// A desktop that records what it's asked to do; its windows stay open until
// closed, and where they were last put.
const fakeDesktop = ({movable = true} = {}) => {
	let opened = 0;
	const closed = new Set();
	const placed = {};
	return {
		showPage: vi.fn(app => app),
		frontmost: app => app,
		show: vi.fn(),
		isOpen: win => !closed.has(win),
		navigate: vi.fn(),
		movable: () => movable,
		geometry: win => placed[win] ?? {x: 0, y: 0, width: 500, height: 400},
		defaultGeometry: win => (win === 'site' ? {x: 112, y: 24, width: 800, height: 600} : {x: 300, y: 72, width: 600, height: 500}),
		stage: () => ({width: 1000, height: 700}),
		minSize: () => ({width: 360, height: 294}),
		place: vi.fn((win, at) => {
			placed[win] = at;
		}),
		open: vi.fn(app => `${app}-${++opened}`),
		update: vi.fn(win => !closed.has(win)),
		close: vi.fn(win => closed.add(win)),
	};
};

// Wikipedia's API: each article has a History section and then its appendices, and
// links to the next in `chain`, besides a help page and an article yet to be written.
// Unix-like redirects to Unix.
const REDIRECTS = {'Unix-like': 'Unix'};
const wikipedia = (...chain) => vi.fn(async url => {
	const asked = decodeURIComponent(url.split('&page=')[1]);
	const title = REDIRECTS[asked] ?? asked;
	const next = chain[(chain.indexOf(title) + 1) % chain.length];
	return {
		json: async () => ({parse: {
			title,
			sections: [{line: 'History', anchor: 'History'}, {line: 'References', anchor: 'References'}, {line: 'Citations', anchor: 'Citations'}],
			links: [{ns: 4, title: 'Wikipedia:Citation needed', exists: true}, {ns: 0, title: 'Nowhere yet', exists: false}, {ns: 0, title: next, exists: true}],
		}}),
	};
});

const article = title => `https://en.wikipedia.org/wiki/${title}`;
const wikipediaUpdates = desktop => desktop.update.mock.calls.filter(([, content]) => content.url);
const browsersOpened = desktop => desktop.open.mock.calls.filter(([app]) => app === 'site');

let random;

beforeEach(() => {
	vi.useFakeTimers();
	random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('ADHD mode', () => {
	it('clicks through the website and the editor while dragging them about, then settles them in the same places', async () => {
		const desktop = fakeDesktop();
		const stop = new AbortController();
		runAdhd(desktop, stop.signal);

		await vi.advanceTimersByTimeAsync(3000);
		// Both at once.
		expect(desktop.navigate).toHaveBeenCalled();
		expect(desktop.place).toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(10_000);
		const pages = desktop.navigate.mock.calls.map(([name]) => name);
		expect(desktop.showPage).toHaveBeenNthCalledWith(1, 'site');
		expect(pages.slice(0, 8).every(name => !name.endsWith('/source'))).toBe(true);
		expect(pages.slice(8, 16).every(name => name.endsWith('/source'))).toBe(true);
		// Smoothly, past the mark and back, ending up the same every time: the website
		// in its default place, the editor over it and a little smaller.
		for (const dragged of ['site', 'source']) {
			const steps = desktop.place.mock.calls.filter(([win, at]) => win === dragged && at).map(([, at]) => at);
			expect(Math.max(...steps.slice(1).map((at, i) => Math.hypot(at.x - steps[i].x, at.y - steps[i].y)))).toBeLessThan(100);
		}
		expect(desktop.place.mock.calls.some(([win, at]) => win === 'site' && at?.width > 800)).toBe(true);
		expect(desktop.place).toHaveBeenCalledWith('site', null);
		expect(desktop.place.mock.calls.at(-1)).toEqual(['source', {x: 372, y: 102, width: 528, height: 440}]);
		// Never more oblong than 3:2 on the way.
		const shapes = desktop.place.mock.calls.filter(([, at]) => at).map(([, at]) => at.width / at.height);
		expect(Math.max(...shapes.map(shape => Math.max(shape, 1 / shape)))).toBeLessThanOrEqual(1.5);
		stop.abort();
	});

	it('leaves the windows where they are where they can\'t move', async () => {
		const desktop = fakeDesktop({movable: false});
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(30_000);

		expect(desktop.place).not.toHaveBeenCalled();
		expect(desktop.open).toHaveBeenCalledWith('video', expect.anything(), null);
		expect(desktop.open).toHaveBeenCalledWith('site', expect.anything(), null);
	});

	it('pauses now and then between the stretches of a drag', async () => {
		const desktop = fakeDesktop();
		const times = [];
		desktop.place.mockImplementation(() => times.push(Date.now()));
		random.mockReturnValue(0.05);
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(5000);

		const gaps = times.slice(1).map((time, i) => time - times[i]);
		expect(Math.min(...gaps)).toBe(16);
		expect(Math.max(...gaps)).toBeGreaterThanOrEqual(80);
	});

	it('dwells on a page now and then before clicking on', async () => {
		const desktop = fakeDesktop();
		const times = [];
		desktop.navigate.mockImplementation(() => times.push(Date.now()));
		random.mockReturnValue(0.8);
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(5000);

		const gaps = times.slice(1).map((time, i) => time - times[i]);
		expect(gaps.length).toBeGreaterThan(1);
		expect(new Set(gaps)).toEqual(new Set([1260]));
	});

	it('starts the music and Wikipedia five seconds in, while still clicking about, which brings each window to the front', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux'));
		const desktop = fakeDesktop();
		const opened = {};
		desktop.open.mockImplementation(app => {
			opened[app] ??= Date.now();
			return app;
		});
		// The longer pauses, so that the clicking takes a while.
		random.mockReturnValue(0.8);
		const started = Date.now();
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(12_000);

		expect(opened.video - started).toBe(5000);
		expect(opened.site - started).toBe(9600);
		const clicked = desktop.navigate.mock.invocationCallOrder;
		expect(clicked.filter(order => order > desktop.open.mock.invocationCallOrder[0]).length).toBeGreaterThan(0);
		// Each click on a page in its window, raised just before.
		const raised = desktop.showPage.mock.invocationCallOrder.map((order, i) => [order, desktop.showPage.mock.calls[i][0]]);
		expect(clicked.every((order, i) => raised.filter(([before]) => before < order).at(-1)[1] === (i < 8 ? 'site' : 'source'))).toBe(true);
		expect(clicked.every((order, i) => raised.some(([before]) => before < order && before > (clicked[i - 1] ?? 0)))).toBe(true);
	});

	it('plays one track after another, in front, with a break between', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux'));
		const desktop = fakeDesktop();
		const times = {};
		desktop.open.mockImplementation((app, content) => {
			(times[app] ??= []).push(Date.now());
			return content.video ? `video-${times.video.length}` : app;
		});
		desktop.close.mockImplementation(win => {
			times[win] = Date.now();
		});
		runAdhd(desktop, new AbortController().signal);
		const tracks = () => desktop.open.mock.calls.filter(([app]) => app === 'video');

		while (tracks().length < 2) {
			await vi.advanceTimersByTimeAsync(100);
		}

		const [[, first], [, second]] = tracks();
		expect(first.video).toEqual({youtube: 'fvki3Q4QTEA', start: 44, title: 'On Lock'});
		expect(second.video.title).toBe('Sub Zero Project - HALO');
		expect(desktop.show).toHaveBeenCalledWith('video-1');
		expect(times['video-1'] - times.video[0]).toBe(17_500);
		expect(times.video[1] - times['video-1']).toBe(2000);
	});

	it('starts the music with one of the opening tracks, the others coming up only later', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux'));
		random.mockReturnValue(0.999);
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);
		const tracks = () => desktop.open.mock.calls.filter(([app]) => app === 'video').map(([, {video}]) => video.title);

		while (tracks().length < 2) {
			await vi.advanceTimersByTimeAsync(100);
		}

		expect(tracks()).toEqual(['wHERE the rhythm goes', 'Jan Klaassen De Trompetter']);
	});

	it('opens Wikipedia\'s windows no more oblong than 3:2, either way', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux'));
		for (const value of [0, 0.2, 0.5, 0.8, 0.999]) {
			random.mockReturnValue(value);
			const desktop = fakeDesktop();
			const stop = new AbortController();
			runAdhd(desktop, stop.signal);
			while (!desktop.open.mock.calls.some(([app]) => app === 'site')) {
				await vi.advanceTimersByTimeAsync(100);
			}
			const [, , place] = desktop.open.mock.calls.find(([app]) => app === 'site');
			stop.abort();

			expect(Math.max(place.width / place.height, place.height / place.width)).toBeLessThanOrEqual(1.5);
			expect(place.width).toBeGreaterThanOrEqual(360);
			expect(place.height).toBeGreaterThanOrEqual(294);
			expect(place.x + place.width).toBeLessThanOrEqual(1000);
			expect(place.y + place.height).toBeLessThanOrEqual(700);
		}
	});

	it('puts the video player anywhere at about the same size, never all of it behind the browser in front', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux'));
		const playerAt = async (value, browser) => {
			random.mockReturnValue(value);
			const base = fakeDesktop();
			const desktop = {...base, frontmost: () => 'browser', geometry: win => (win === 'browser' ? browser : base.geometry(win))};
			const stop = new AbortController();
			runAdhd(desktop, stop.signal);
			await vi.advanceTimersByTimeAsync(5000);
			stop.abort();
			return desktop.open.mock.calls.find(([app]) => app === 'video')[2];
		};
		const browser = {x: 100, y: 50, width: 800, height: 600};
		const behind = at => at.x >= browser.x && at.y >= browser.y
			&& at.x + at.width <= browser.x + browser.width && at.y + at.height <= browser.y + browser.height;

		// Where it happens to land, if that's not all behind it...
		expect(await playerAt(0, browser)).toEqual({x: 0, y: 0, width: 360, height: 248.5});
		expect((await playerAt(0.999, browser)).width).toBeCloseTo(420, 0);
		// ...otherwise past one of its edges.
		for (const [value, at] of [[0.2, {x: 20}], [0.3, {x: 566}], [0.5, {y: 25}], [0.8, {y: 416.75}]]) {
			const place = await playerAt(value, browser);
			expect(place).toMatchObject(at);
			expect(behind(place)).toBe(false);
		}
		// And where there's no getting out from behind it, wherever it landed.
		expect(await playerAt(0.5, {x: 0, y: 0, width: 1000, height: 700})).toEqual({x: 310, y: 220.125, width: 380, height: 259.75});
		// Or with no browser at all.
		expect(await playerAt(0.5, undefined)).toEqual({x: 310, y: 220.125, width: 380, height: 259.75});
	});

	it('reads Wikipedia from article to linked article, skimming to a section of each halfway', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux', 'Unix'));
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(40_000);

		const [[browser, main, place]] = browsersOpened(desktop).map(call => [desktop.open.mock.results[desktop.open.mock.calls.indexOf(call)].value, ...call.slice(1)]);
		expect(main).toEqual({url: article('Main_Page')});
		expect(place.width).toBeGreaterThanOrEqual(360);
		expect(desktop.show).toHaveBeenCalledWith(browser);
		expect(fetch).toHaveBeenCalledWith(
			'https://en.wikipedia.org/w/api.php?action=parse&prop=links%7Csections&format=json&formatversion=2&origin=*&redirects=1&page=Linux',
			expect.objectContaining({credentials: 'omit', referrerPolicy: 'no-referrer'}),
		);
		expect(wikipediaUpdates(desktop).slice(0, 4).map(([win, {url}]) => [win, url])).toEqual([
			[browser, article('Linux')],
			[browser, `${article('Linux')}#History`],
			[browser, article('Unix')],
			[browser, `${article('Unix')}#History`],
		]);
		// Each time in front, and no more than four seconds on an article.
		const raised = desktop.show.mock.invocationCallOrder;
		expect(desktop.update.mock.invocationCallOrder.every(order => raised.includes(order - 1))).toBe(true);
		const times = [];
		desktop.update.mockImplementation(() => times.push(Date.now()));
		await vi.advanceTimersByTimeAsync(20_000);
		const articles = times.filter((_, i) => i % 2 === 0);
		expect(Math.max(...articles.slice(1).map((time, i) => time - articles[i]))).toBeLessThanOrEqual(4000);
	});

	it('skims an article it was redirected to by the article\'s own name, and carries on from it', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux', 'Unix-like'));
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(60_000);

		expect(wikipediaUpdates(desktop).slice(0, 5).map(([, {url}]) => url)).toEqual([
			article('Linux'),
			`${article('Linux')}#History`,
			article('Unix-like'),
			`${article('Unix')}#History`,
			article('Linux'),
		]);
	});

	it('carries on in a new window now and then, somewhere usable, or when its window has been closed', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux', 'Unix', 'GNU'));
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(40_000);
		// Until it next opens a browser.
		const nextBrowser = async () => {
			const opened = browsersOpened(desktop).length;
			while (browsersOpened(desktop).length === opened) {
				await vi.advanceTimersByTimeAsync(100);
			}
			return browsersOpened(desktop).at(-1);
		};

		random.mockReturnValue(0.14);
		const [, {url}, place] = await nextBrowser();
		random.mockReturnValue(0.5);
		expect(url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/(Linux|Unix|GNU)$/);
		expect(place.width).toBeGreaterThanOrEqual(360);
		expect(place.x + place.width).toBeLessThanOrEqual(1000);
		expect(place.y + place.height).toBeLessThanOrEqual(700);

		desktop.close(desktop.show.mock.calls.at(-1)[0]);
		const [, reopened] = await nextBrowser();
		expect(reopened.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
	});

	it('goes back to an earlier window now and then, and carries on from its article', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux', 'Unix', 'GNU'));
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(40_000);
		const [first] = wikipediaUpdates(desktop)[0];
		random.mockReturnValue(0.07);
		while (browsersOpened(desktop).length < 2) {
			await vi.advanceTimersByTimeAsync(100);
		}

		random.mockReturnValue(0.14);
		while (desktop.show.mock.calls.at(-1)[0] !== first) {
			await vi.advanceTimersByTimeAsync(100);
		}
		random.mockReturnValue(0.5);
		const before = wikipediaUpdates(desktop).length;
		while (wikipediaUpdates(desktop).length < before + 2) {
			await vi.advanceTimersByTimeAsync(100);
		}

		expect(wikipediaUpdates(desktop).slice(before).every(([win]) => win === first)).toBe(true);
	});

	it('stays on its article while Wikipedia has nothing to say', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new Error('offline');
		}));
		const desktop = fakeDesktop();
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(60_000);

		expect(wikipediaUpdates(desktop)).toHaveLength(1);
		expect(browsersOpened(desktop)).toHaveLength(1);
	});

	it('stops when told while Wikipedia is still answering, going nowhere once it does', async () => {
		let answer;
		vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
			answer = () => resolve({json: async () => ({parse: {title: 'Linux', sections: [], links: [{ns: 0, title: 'Unix', exists: true}]}})});
		})));
		const desktop = fakeDesktop();
		const stop = new AbortController();
		const running = runAdhd(desktop, stop.signal);
		await vi.advanceTimersByTimeAsync(40_000);
		expect(fetch).toHaveBeenCalledTimes(1);

		stop.abort();
		answer();

		await expect(running).resolves.toBeUndefined();
		expect(wikipediaUpdates(desktop)).toHaveLength(1);
	});

	it('stops when told, whatever it was doing', async () => {
		vi.stubGlobal('fetch', wikipedia('Linux', 'Unix'));
		const desktop = fakeDesktop();
		const stop = new AbortController();
		runAdhd(desktop, stop.signal);
		await vi.advanceTimersByTimeAsync(40_000);
		const calls = () => desktop.update.mock.calls.length + desktop.navigate.mock.calls.length + desktop.open.mock.calls.length + desktop.close.mock.calls.length;
		const before = calls();

		stop.abort();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(calls()).toBe(before);
	});

	it('leaves alone a window that has gone by the time it would be dragged', async () => {
		const desktop = {...fakeDesktop(), geometry: () => undefined};
		runAdhd(desktop, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(30_000);

		expect(desktop.place.mock.calls.filter(([, at]) => at)).toEqual([]);
		expect(desktop.open).toHaveBeenCalledWith('video', expect.anything(), expect.anything());
	});

	it('passes on what goes wrong otherwise', async () => {
		const desktop = {...fakeDesktop(), showPage: () => {
			throw new Error('broken');
		}};

		await expect(runAdhd(desktop, new AbortController().signal)).rejects.toThrow('broken');
	});
});
