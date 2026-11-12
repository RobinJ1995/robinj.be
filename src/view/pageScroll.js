import {useState, useEffect, useLayoutEffect, useRef} from 'react';

// The website's page scrolls in its window or, on a phone, as the document, so that
// the phone's browser hides its bars. _Desktop.scss lays out both.
const SCROLLING_DOCUMENT = 'is-scrolling-document';
const PAGE = '.dt-window-content > .editorial';
// How far the page scrolls one way before the browser's header bar follows.
const SCROLL_AWAY_PX = 8;
// Handing over a page that's being scrolled would cut the scrolling short.
const IDLE_MS = 150;

const state = {
	// Whether the document scrolls the page.
	document: false,
	// Which page was last scrolled, and to where.
	page: null,
	top: 0,
	touching: false,
	scrolledAt: -Infinity,
	// Where each scroller last was.
	positions: new WeakMap(),
};

// Null unless `target` is what scrolls the page now.
const scrolled = target => {
	if (state.document !== (target === document)) {
		return null;
	}

	const el = target === document ? document.documentElement : target;
	const end = el.scrollHeight - (target === document ? window.innerHeight : el.clientHeight);
	// Rubber-banding past either end isn't scrolling.
	const top = Math.min(Math.max(el.scrollTop, 0), end);
	if (target === document) {
		state.top = top;
	}
	return {top, end, height: el.scrollHeight};
};

// As laid out now: _Desktop.scss decides.
const documentScrolls = page => document.documentElement.classList.contains(SCROLLING_DOCUMENT)
	&& getComputedStyle(page.closest('.desktop')).getPropertyValue('--dt-document-scrolls').trim() === '1';
// The page itself in one column, its main in two.
const windowScroller = page => (getComputedStyle(page).overflowY === 'visible' ? page.querySelector('.ed-main') ?? page : page);

// Puts the page at `top` in whatever scrolls it now, and has the bars follow.
const place = (page, top) => {
	state.document = documentScrolls(page);
	const target = state.document ? document : windowScroller(page);
	const el = state.document ? document.documentElement : target;
	if (el.scrollTop !== top) {
		el.scrollTop = top;
	}
	state.page = page;
	state.top = el.scrollTop;
	state.positions.set(target, {top: state.top});
	target.dispatchEvent(new Event('scroll'));
};

const toDocument = page => {
	// Its last scroller may be gone with the layout.
	const top = (state.page === page && state.top) || windowScroller(page).scrollTop;
	document.documentElement.classList.add(SCROLLING_DOCUMENT);
	place(page, top);
};

const toWindow = (page, top) => {
	document.documentElement.classList.remove(SCROLLING_DOCUMENT);
	if (state.document) {
		place(page, top);
	}
};

// The layout may scroll it another way now.
const afterResize = page => {
	const same = documentScrolls(page) === state.document;
	place(page, same ? (state.document ? document.documentElement : windowScroller(page)).scrollTop : state.page === page ? state.top : 0);
};

const finiteAnimations = el => (el.getAnimations?.({subtree: true}) ?? []).filter(a => a.playState !== 'finished' && Number.isFinite(a.effect?.getComputedTiming().endTime));

// Calls `done` once nothing on `screen` is moving and the page is left alone. Returns a way to call it off.
const whenAtRest = (screen, done) => {
	let waiting = true;
	let timer = null;
	const check = () => {
		const moving = waiting ? finiteAnimations(screen) : [];
		const idleIn = state.touching ? IDLE_MS : state.scrolledAt + IDLE_MS - performance.now();
		if (moving.length > 0) {
			Promise.allSettled(moving.map(a => a.finished)).then(check);
		} else if (waiting && idleIn > 0) {
			timer = setTimeout(check, idleIn);
		} else if (waiting) {
			waiting = false;
			done();
		}
	};
	check();

	return () => {
		waiting = false;
		clearTimeout(timer);
	};
};

// Hides the browser's header bar as the page scrolls down, shows it as it scrolls
// up. It only reads the scroll position, so scrolling itself is left alone.
export const useScrollAway = (ref, enabled) => {
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		setHidden(false);
		const frame = ref.current?.parentElement;
		if (!enabled || !frame) {
			return undefined;
		}

		// Start from where the page is.
		for (const el of frame.querySelectorAll('*')) {
			if (el.scrollTop > 0) {
				state.positions.set(el, {top: el.scrollTop});
			}
		}
		state.positions.set(document, {top: window.scrollY});
		// How far the page has gone in the direction it's going.
		let travel = 0;
		const onScroll = ({target}) => {
			const now = scrolled(target);
			// Gone, when its window closes at once.
			if (!now || !ref.current) {
				return;
			}

			const {top, height} = now;
			const before = {top: 0, height, ...state.positions.get(target)};
			state.positions.set(target, {top, height});

			// At the top it shows, however it got there: to another page, say.
			if (top < ref.current.offsetHeight) {
				travel = 0;
				setHidden(false);
			// When the page changes height (as fonts load, say), the browser moves it to
			// keep what's in view in place. That isn't the reader scrolling.
			} else if (height === before.height) {
				const delta = top - before.top;
				travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;

				if (travel < -SCROLL_AWAY_PX) {
					setHidden(false);
				} else if (travel > SCROLL_AWAY_PX) {
					setHidden(true);
				}
			}
		};
		frame.addEventListener('scroll', onScroll, {capture: true, passive: true});
		document.addEventListener('scroll', onScroll, {passive: true});

		return () => {
			frame.removeEventListener('scroll', onScroll, {capture: true});
			document.removeEventListener('scroll', onScroll);
		};
	}, [enabled]);

	return hidden;
};

// How far into the page from either end, up to the dock's height.
export const useUnderDock = (ref, enabled) => {
	useEffect(() => {
		const win = ref.current?.closest('.dt-window');
		const desktop = win?.closest('.desktop');
		if (!enabled || !desktop) {
			return undefined;
		}

		const onScroll = ({target}) => {
			const now = scrolled(target);
			if (now) {
				const dock = parseFloat(getComputedStyle(desktop).getPropertyValue('--dt-dock-bottom')) || 0;
				desktop.style.setProperty('--dt-under-dock', `${Math.max(0, Math.min(dock, now.top, now.end - now.top))}px`);
			}
		};
		win.addEventListener('scroll', onScroll, {capture: true, passive: true});
		document.addEventListener('scroll', onScroll, {passive: true});

		return () => {
			win.removeEventListener('scroll', onScroll, {capture: true});
			document.removeEventListener('scroll', onScroll);
			desktop.style.removeProperty('--dt-under-dock');
		};
	}, [enabled]);
};

// Has the document scroll the page of window `win` (of `windowEls`, on the stage),
// once all is at rest, for as long as `win` is given. `address` is the page's.
export const useDocumentScroll = (win, windowEls, stageRef, address) => {
	// Read before the effects run: rendering may move it.
	const scrolledTo = useRef(0);
	scrolledTo.current = typeof window === 'undefined' ? 0 : window.scrollY;

	useLayoutEffect(() => {
		const page = win && windowEls.current[win]?.querySelector(PAGE);
		if (!page) {
			return undefined;
		}

		const onResize = () => afterResize(page);
		const callOff = whenAtRest(stageRef.current.parentElement, () => {
			toDocument(page);
			window.addEventListener('resize', onResize);
		});

		return () => {
			callOff();
			window.removeEventListener('resize', onResize);
			toWindow(page, scrolledTo.current);
		};
	}, [win]);

	// Where the page is in its window, on any screen, and whether it's being scrolled.
	useEffect(() => {
		const stage = stageRef.current;
		const onScroll = ({target}) => {
			if (!state.document && target.matches?.(`[data-win="site"] ${PAGE}, [data-win="site"] .ed-main`)) {
				state.page = target.closest('.editorial');
				state.top = target.scrollTop;
				state.scrolledAt = performance.now();
			}
		};
		const onTouch = e => {
			state.touching = e.touches.length > 0;
		};
		const touches = ['touchstart', 'touchend', 'touchcancel'];
		stage.addEventListener('scroll', onScroll, {capture: true, passive: true});
		touches.forEach(type => window.addEventListener(type, onTouch, {passive: true}));
		window.history.scrollRestoration = 'manual';

		return () => {
			stage.removeEventListener('scroll', onScroll, {capture: true});
			touches.forEach(type => window.removeEventListener(type, onTouch));
		};
	}, []);

	// A new page starts at its top.
	useLayoutEffect(() => {
		if (state.document && window.scrollY > 0) {
			window.scrollTo({top: 0, behavior: 'instant'});
		}
	}, [address]);
};
