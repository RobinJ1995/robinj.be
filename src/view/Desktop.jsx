import React, {useState, useEffect, useLayoutEffect, useRef, useMemo} from 'react';
import {flushSync} from 'react-dom';
import Window, {CloseIcon, fitGeometry, refitGeometry, dockOverlap} from './Window';
import {runAdhd} from './adhd';

const ORDER = ['site', 'source', 'console', 'video'];
// Always in the dock; other apps only while they run.
const FAVOURITES = ['site', 'source', 'console'];
// The apps that show the page; the others have no URL of their own.
const URL_WINDOWS = ['site', 'source'];
// What the website and the editor show unless told otherwise: the portfolio.
const PORTFOLIO = {portfolio: true};
// As small as each app can be and still work comfortably.
const MIN_SIZES = {
	site: {width: 360, height: 360},
	source: {width: 360, height: 360},
	console: {width: 420, height: 260},
	video: {width: 360, height: 294},
};
// Where windows are maximised, as in _Desktop.scss.
const SMALL = '(width < 900px), (height < 600px)';
const SITE = {title: 'Robin Jacobs', url: 'https://robinj.be/'};
// Matches the dt-close animation in _Desktop.scss.
const CLOSE_MS = 180;
// The windows as the terminal's processes, and back.
const PROCESSES = {site: 'web', source: 'editor', console: 'terminal', video: 'video-player'};
const WINDOWS = {web: 'site', editor: 'source', terminal: 'console', 'video-player': 'video'};
const DESKTOP_PID = 1337;
const FIRST_PID = 2000;
// How long the screen stays black after powering off, before the power button.
const OFF_MS = 3000;
const RESTART_MS = 1200;
// How long an empty desktop waits before suggesting a way back; less on a phone.
const LOST_MS = 4000;
const LOST_SMALL_MS = 3000;
// Unloading adhd closes the windows this far apart.
const UNLOAD_CLOSE_MS = 100;
// A pause this long ends a change of the screen's size.
const RESIZE_SETTLE_MS = 500;
// Minimising a window to its dock icon, or restoring it, on a small screen.
const MINIMISE = {duration: 300, easing: 'cubic-bezier(.25, .46, .45, .94)'};
// A panic stays on screen this long, then the machine is off as after a shutdown.
const PANIC_MS = 4000;
const PANIC_OFF_MS = 2000;
// With this many browser windows open, there's nothing left for anything else.
const BROWSER_LIMIT = 10;

const LockIcon = () => (
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
		<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
	</svg>
);

const WiredIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
		<rect x="6" y="1" width="4" height="4" rx="1" />
		<rect x="7.25" y="5" width="1.5" height="2.5" />
		<rect x="3.25" y="7" width="9.5" height="1.5" />
		<rect x="3.25" y="7" width="1.5" height="3" />
		<rect x="11.25" y="7" width="1.5" height="3" />
		<rect x="2" y="10" width="4" height="4" rx="1" />
		<rect x="10" y="10" width="4" height="4" rx="1" />
	</svg>
);

// GNOME's battery: a level that fills up, with a bolt while charging.
const BatteryIcon = ({level, charging}) => {
	const height = Math.max(level, 0.08) * 8.5;

	return (
		<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
			<rect x="6" y="1" width="4" height="1.75" rx=".5" fill="currentColor" />
			<rect x="4.25" y="2.75" width="7.5" height="12" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
			<rect x="5.75" y={4.25 + 8.5 - height} width="4.5" height={height} rx=".5" fill="currentColor" />
			{charging && <path d="M8.9 4.6 6.1 9.3h2l-.6 3.4 2.8-4.7h-2z" fill="currentColor" stroke="#000" strokeWidth=".8" strokeLinejoin="round" />}
		</svg>
	);
};

const PowerIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
		<path d="M8 1.5v6" />
		<path d="M4.6 3.8a5.5 5.5 0 1 0 6.8 0" />
	</svg>
);

// GNOME's Caffeine extension shows a cup in the top bar; this one steams.
const CaffeineIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<g className="dt-steam" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
			<path d="M5 4.5c-.8-.9.8-1.6 0-2.5" />
			<path d="M8 4.5c-.8-.9.8-1.6 0-2.5" />
		</g>
		<path d="M2.5 6.5h8v4a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" fill="currentColor" />
		<path d="M10.5 7.5h1a1.75 1.75 0 0 1 0 3.5h-1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
	</svg>
);

const LightIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<circle cx="8" cy="8" r="3" fill="currentColor" />
		<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"
			stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
	</svg>
);

const AutoIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
		<path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
	</svg>
);

const ShareIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<g fill="currentColor">
			<circle cx="12" cy="3.5" r="2.25" />
			<circle cx="4" cy="8" r="2.25" />
			<circle cx="12" cy="12.5" r="2.25" />
		</g>
		<path d="M12 3.5L4 8l8 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
	</svg>
);

const DarkIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor" />
	</svg>
);

// GNOME's own app icons (see public/img/icons/attribution.md).
const APPS = {
	site: {name: 'Website', icon: '/img/icons/org.gnome.Epiphany.svg'},
	source: {name: 'Editor', icon: '/img/icons/org.gnome.TextEditor.svg'},
	console: {name: 'Terminal', icon: '/img/icons/org.gnome.Console.svg'},
	video: {name: 'Video Player', icon: '/img/icons/org.gnome.Showtime.svg'},
};

const THEMES = [
	{value: 'light', label: 'Light', Icon: LightIcon},
	{value: 'auto', label: 'Auto', Icon: AutoIcon},
	{value: 'dark', label: 'Dark', Icon: DarkIcon},
];

// GNOME's accent colours; the swatches themselves are in _Desktop.scss.
const ACCENTS = ['blue', 'green', 'yellow', 'red', 'purple'];

// The website, editor and terminal's font; see the font tokens in App.scss.
const FONTS = [{value: 'default', label: 'Default Font'}, {value: 'dyslexic', label: 'Dyslexic Font'}];

const capitalise = word => word[0].toUpperCase() + word.slice(1);

// False until mounted, so the server and the first client render agree.
const useMedia = query => {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		if (typeof window.matchMedia !== 'function') {
			return undefined;
		}

		const list = window.matchMedia(query);
		const update = () => setMatches(list.matches);
		update();
		list.addEventListener('change', update);

		return () => list.removeEventListener('change', update);
	}, [query]);

	return matches;
};

// iOS lays its on-screen keyboard over the page instead of shrinking it (as
// interactive-widget in index.html does elsewhere), so the desktop fits itself
// above it. Scale 1 rules out pinch-zoom, which also shrinks the viewport.
const useKeyboardFit = () => {
	const [fit, setFit] = useState(null);

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) {
			return undefined;
		}

		const update = () => {
			const covered = viewport.scale === 1 && viewport.height < document.documentElement.clientHeight - 1;
			setFit(covered ? {height: viewport.height, top: viewport.offsetTop} : null);
		};
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);

		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
		};
	}, []);

	return fit;
};

let restyleTimer = null;

// Colours ease to the new style instead of snapping (see .is-restyling). Unlike a
// view transition this keeps the page clickable, so quick changes just retarget.
const withEasedColours = change => {
	if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
		const root = document.documentElement;
		root.classList.add('is-restyling');
		clearTimeout(restyleTimer);
		restyleTimer = setTimeout(() => root.classList.remove('is-restyling'), 450);
	}
	change();
};

// Theme, accent and font are explicit choices on <html data-*>, applied early by
// index.html; the fallback (auto, green, default) is the absence of one. Client-only:
// the menu only renders once it's opened.
const usePreference = (key, fallback) => {
	const [value, setValue] = useState(() => document.documentElement.dataset[key] ?? fallback);

	const choose = next => {
		setValue(next);
		withEasedColours(() => {
			const root = document.documentElement;
			try {
				if (next === fallback) {
					delete root.dataset[key];
					localStorage.removeItem(key);
				} else {
					root.dataset[key] = next;
					localStorage.setItem(key, next);
				}
			} catch {
				/* Storage blocked: the choice lasts until the page is closed. */
			}
		});
	};

	return [value, choose];
};

// The device's own battery, where the browser shares it (Chromium does); null otherwise.
const useBattery = () => {
	const [battery, setBattery] = useState(null);

	useEffect(() => {
		if (typeof navigator.getBattery !== 'function') {
			return undefined;
		}

		let manager = null;
		let stopped = false;
		const update = () => setBattery({level: manager.level, charging: manager.charging});
		navigator.getBattery().then(result => {
			if (stopped) {
				return;
			}
			manager = result;
			update();
			manager.addEventListener('levelchange', update);
			manager.addEventListener('chargingchange', update);
		}).catch(() => {
			/* Not allowed here: no indicator. */
		});

		return () => {
			stopped = true;
			manager?.removeEventListener('levelchange', update);
			manager?.removeEventListener('chargingchange', update);
		};
	}, []);

	return battery;
};

const formatDate = date => date.toLocaleDateString('en-IE', {day: 'numeric', month: 'short'});
const formatTime = date => date.toLocaleTimeString('en-IE', {hour: '2-digit', minute: '2-digit'});

// Client-only, so the prerendered HTML never holds a stale time.
const Clock = () => {
	const [now, setNow] = useState(null);

	useEffect(() => {
		const tick = () => setNow(new Date());
		tick();
		const timer = setInterval(tick, 10_000);

		return () => clearInterval(timer);
	}, []);

	return (
		<time className="dt-clock" dateTime={now?.toISOString()}>
			{now && <><span>{formatDate(now)}</span><span>{formatTime(now)}</span></>}
		</time>
	);
};

// A libadwaita-style toggle group whose highlight glides to the chosen option.
const Switch = ({label, options, value, onChange, className = ''}) => (
	<div className={`dt-switch ${className}`} role="radiogroup" aria-label={label}
		style={{'--count': options.length, '--selected': options.findIndex(option => option.value === value)}}>
		<span className="dt-switch-indicator" aria-hidden="true" />
		{options.map(option => (
			<button key={option.value} type="button" role="radio" aria-checked={option.value === value}
				aria-label={option.label} title={option.title} data-value={option.value} onClick={() => onChange(option.value)}>
				{option.content}
			</button>
		))}
	</div>
);

const QuickSettings = ({ref}) => {
	const [theme, chooseTheme] = usePreference('theme', 'auto');
	const [accent, chooseAccent] = usePreference('accent', 'green');
	const [font, chooseFont] = usePreference('font', 'default');

	return (
		<div ref={ref} className="dt-quick-settings" role="dialog" aria-label="System menu">
			<Switch label="Style" value={theme} onChange={chooseTheme}
				options={THEMES.map(({value, label, Icon}) => ({value, label, content: <><Icon /><span>{label}</span></>}))} />
			<Switch label="Accent colour" className="dt-accent-switch" value={accent} onChange={chooseAccent}
				options={ACCENTS.map(value => ({value, label: capitalise(value), title: capitalise(value)}))} />
			<Switch label="Font" value={font} onChange={chooseFont}
				options={FONTS.map(({value, label}) => ({value, label, content: <span>{label}</span>}))} />
		</div>
	);
};

const TopBar = ({overview, onActivities, menuOpen, setMenuOpen, caffeinated, inert}) => {
	const battery = useBattery();
	const menuRef = useRef(null);
	const buttonRef = useRef(null);

	useEffect(() => {
		if (!menuOpen) {
			return undefined;
		}

		const onPointer = e => {
			if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) {
				setMenuOpen(false);
			}
		};
		const onKey = e => {
			if (e.key === 'Escape') {
				setMenuOpen(false);
			}
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);

		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	return (
		<div className="dt-topbar" inert={inert}>
			<button type="button" className="dt-panel-button dt-workspaces" aria-label="Activities" aria-pressed={overview} onClick={onActivities}>
				<span className="dt-workspace-dot is-active" />
				<span className="dt-workspace-dot" />
			</button>
			<Clock />
			<button ref={buttonRef} type="button" className="dt-panel-button dt-status" aria-label="System menu" aria-expanded={menuOpen}
				onClick={() => setMenuOpen(o => !o)}>
				{caffeinated && (
					<span role="img" title="Caffeine" aria-label="Caffeine loaded">
						<CaffeineIcon />
					</span>
				)}
				<WiredIcon />
				{battery && (
					<span role="img" title={`${Math.round(battery.level * 100)}%`}
						aria-label={`Battery ${Math.round(battery.level * 100)}%${battery.charging ? ', charging' : ''}`}>
						<BatteryIcon {...battery} />
					</span>
				)}
				<PowerIcon />
			</button>
			{menuOpen && <QuickSettings ref={menuRef} />}
		</div>
	);
};

// How far the page scrolls one way before the browser's header bar follows.
const SCROLL_AWAY_PX = 8;

// Hides the browser's header bar as the page scrolls down, shows it as it scrolls
// up. It only reads the scroll position, so scrolling itself is left alone.
const useScrollAway = (ref, enabled) => {
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		setHidden(false);
		const frame = ref.current?.parentElement;
		if (!enabled || !frame) {
			return undefined;
		}

		const positions = new WeakMap();
		// How far the page has gone in the direction it's going.
		let travel = 0;
		const onScroll = ({target}) => {
			// Rubber-banding past either end isn't scrolling.
			const top = Math.min(Math.max(target.scrollTop, 0), target.scrollHeight - target.clientHeight);
			const before = positions.get(target) ?? {top: 0, height: target.scrollHeight};
			positions.set(target, {top, height: target.scrollHeight});
			// When the page changes height (as fonts load, say), the browser moves it to
			// keep what's in view in place. That isn't the reader scrolling.
			if (target.scrollHeight !== before.height) {
				return;
			}

			const delta = top - before.top;
			travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;

			if (top < ref.current.offsetHeight || travel < -SCROLL_AWAY_PX) {
				setHidden(false);
			} else if (travel > SCROLL_AWAY_PX) {
				setHidden(true);
			}
		};
		frame.addEventListener('scroll', onScroll, {capture: true, passive: true});

		return () => frame.removeEventListener('scroll', onScroll, {capture: true});
	}, [enabled]);

	return hidden;
};

// The address bar shows `url`; only the website itself can be shared from it.
const BrowserBar = ({url, shareable, scrollAway, onClose}) => {
	const {host, pathname, search, hash} = new URL(url);
	const ref = useRef(null);
	const hidden = useScrollAway(ref, scrollAway);
	// Decided after mount, so the prerendered HTML doesn't depend on the browser.
	const [canShare, setCanShare] = useState(false);

	useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

	// The site as a whole, not the page being looked at.
	const share = () => navigator.share(SITE).catch(() => {
		/* Dismissed, or sharing isn't allowed here. */
	});

	return (
		<div ref={ref} className={`dt-headerbar${hidden ? ' is-hidden' : ''}`} data-titlebar>
			<span />
			<div className="dt-address-group">
				<div className="dt-address">
					<LockIcon />
					<span><b>{host}</b>{pathname + search + hash}</span>
				</div>
				{shareable && canShare && (
					<button type="button" className="dt-headerbar-button" title="Share" aria-label="Share this website" onClick={share}>
						<ShareIcon />
					</button>
				)}
			</div>
			<button type="button" className="dt-close" title="Close window" aria-label="Close the website window" onClick={onClose}>
				<CloseIcon />
			</button>
		</div>
	);
};

// An icon per app: the favourites, and any other while it has windows.
const Dock = ({docked, running, hrefs, onPick}) => (
	<div className="dt-dock" aria-label="Dock">
		{ORDER.filter(win => FAVOURITES.includes(win) || docked.has(win)).map(win => {
			const {name, icon} = APPS[win];

			const props = {
				className: `dt-dock-item${running.has(win) ? ' is-running' : ''}`,
				'aria-label': name,
				'data-label': name,
				'data-win': win,
				onClick: e => onPick(win, e),
				// A click shouldn't pull keyboard focus away from the window being raised.
				onMouseDown: e => e.preventDefault(),
			};

			const image = <img src={icon} alt="" draggable={false} />;

			return hrefs[win]
				? <a key={win} href={hrefs[win]} {...props}>{image}</a>
				: <button key={win} type="button" {...props}>{image}</button>;
		})}
	</div>
);

// Activities, as in GNOME Shell: the workspace, wallpaper and all, shrinks into a
// card clear of the top bar and dock, with the next workspace peeking in beside it.
const TOP_BAR = 32;
const INACTIVE_WORKSPACE_SCALE = 0.94;

// The room the dock takes along the screen's left or bottom edge.
const dockSize = desktop => {
	const css = getComputedStyle(desktop);
	return {left: parseFloat(css.getPropertyValue('--dt-dock-left')) || 0, bottom: parseFloat(css.getPropertyValue('--dt-dock-bottom')) || 0};
};

const workspaceCard = desktop => {
	const width = desktop.clientWidth;
	const height = desktop.clientHeight;
	const dock = dockSize(desktop);
	const area = {
		x: dock.left + width * 0.06,
		y: TOP_BAR + height * 0.05,
		width: width - dock.left - width * 0.12,
		height: height - TOP_BAR - dock.bottom - height * 0.1,
	};
	const scale = Math.min(area.width / width, area.height / height);
	const x = area.x + (area.width - width * scale) / 2;
	const y = area.y + (area.height - height * scale) / 2;
	const peekScale = scale * INACTIVE_WORKSPACE_SCALE;

	return {
		x, y, scale, width: width * scale, height: height * scale,
		peekX: x + width * scale + width * 0.03,
		peekY: y + (height * scale - height * peekScale) / 2,
		peekScale,
	};
};

// Each window in its own slot inside the card, never bigger than the card would make it.
const fitWindows = (windows, card) => {
	if (!card || windows.length === 0) {
		return {};
	}

	const padX = card.width * 0.05;
	const padY = card.height * 0.08;
	const gap = card.width * 0.03;
	const top = card.y - TOP_BAR + padY;
	const left = card.x + padX;
	const slotHeight = card.height - padY * 2;
	const slotWidth = (card.width - padX * 2 - gap * (windows.length - 1)) / windows.length;

	return Object.fromEntries(windows.map(([win, el], i) => {
		const scale = Math.min(slotWidth / el.offsetWidth, slotHeight / el.offsetHeight, card.scale);
		const x = left + i * (slotWidth + gap) + slotWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
		const y = top + slotHeight / 2 - (el.offsetTop + el.offsetHeight / 2);

		return [win, {x, y, scale}];
	}));
};

// The console behind the desktop: shutting down, booting, or a kernel panic.
// Lines come from the terminal, which knows what to say; `onDone` when they've played.
const PowerScreen = ({power, onDone, onPowerOn}) => {
	const [lines, setLines] = useState([]);

	useEffect(() => {
		if (!power.lines) {
			setLines([]);
			return undefined;
		} else if (power.mode === 'panic') {
			setLines(power.lines);
			return undefined;
		}

		let shown = [];
		let i = 0;
		let timer;
		const step = () => {
			const line = power.lines[i++];
			shown = line.replace ? [...shown.slice(0, -1), line.text] : [...shown, line.text];
			setLines(shown);
			timer = i < power.lines.length ? setTimeout(step, power.lines[i].delay) : setTimeout(onDone, 800);
		};
		setLines([]);
		timer = setTimeout(step, power.lines[0]?.delay ?? 0);

		return () => clearTimeout(timer);
	}, [power]);

	return (
		<div className="dt-power" role="log" aria-label="System console">
			<div className="dt-tty">
				<pre>
					{lines.map((line, i) => {
						const status = line.match(/^\[( {2}OK {2}|FAILED|[ *]{6})\](.*)$/);
						const welcome = line.match(/^Welcome to (.+)!$/);
						if (status) {
							const kind = status[1] === '  OK  ' ? 'ok' : 'failed';
							return <span key={i}>[<b className={`dt-tty-${kind}`}>{status[1]}</b>]{status[2]}{'\n'}</span>;
						} else if (welcome) {
							return <span key={i}>Welcome to <b className="dt-tty-welcome">{welcome[1]}</b>!{'\n'}</span>;
						}
						return <span key={i}>{line}{'\n'}</span>;
					})}
				</pre>
			</div>
			{power.mode === 'button' && (
				<button type="button" className="dt-power-button" aria-label="Power on" onClick={onPowerOn}>
					<PowerIcon />
				</button>
			)}
		</div>
	);
};

// A GNOME-style desktop around the website, the editor and other apps. Each window
// is an instance of an app, {app, content}: the first of each is named after the
// app, later ones numbered. Those showing the website or its source share the one
// page App keeps; App says which of the two apps is in front (`focused`), and hears
// whether any window shows the page (`onPageOpen`) and whether the desktop drives
// itself (`onDistracted`). `controls` gets the desktop's own controls, for opening
// windows on other content.
const Desktop = ({focused, hrefs, address, homeHref, onShow, onHome, onNavigate, onPageOpen, onDistracted, renderWindow, controls}) => {
	const [open, setOpen] = useState({site: {app: 'site', content: PORTFOLIO}, source: {app: 'source', content: PORTFOLIO}});
	const [active, setActive] = useState(focused);
	// Back to front.
	const [stack, setStack] = useState(() => [...URL_WINDOWS.filter(win => win !== focused), focused]);
	const [closing, setClosing] = useState({});
	// Activities: true, or an app's name to show only its windows.
	const [overview, setOverview] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	// The "might be lost" notification: shown once nothing has been open for a while,
	// and, once dismissed, kept away until a window or the system menu is opened.
	const [lost, setLost] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	const [fits, setFits] = useState({});
	const [card, setCard] = useState(null);
	// Powered on (null), or which console screen shows instead.
	const [power, setPower] = useState(null);
	// Just booted: the desktop zooms in, as GNOME's does after logging in.
	const [starting, setStarting] = useState(false);
	const [caffeinated, setCaffeinated] = useState(false);
	const [distracted, setDistracted] = useState(false);
	// Where windows were moved or resized to; the others keep their default place.
	const [placed, setPlaced] = useState({});
	const [stage, setStage] = useState(null);
	const [printing, setPrinting] = useState(false);
	const placedNow = useRef(placed);
	placedNow.current = placed;
	// As they are now, ahead of the next render: one call may follow another before it.
	const openNow = useRef(open);
	openNow.current = open;
	const closingNow = useRef(closing);
	closingNow.current = closing;
	const activeNow = useRef(active);
	activeNow.current = active;
	// While the screen changes size: where the windows were before it began, so
	// that they're back there if it grows again.
	const resizing = useRef(null);
	const keyboard = useKeyboardFit();
	const small = useMedia(SMALL);
	const reduceMotion = useMedia('(prefers-reduced-motion: reduce)');
	const stageRef = useRef(null);
	const windowEls = useRef({});
	const closeTimers = useRef({});
	const pids = useRef({site: 1402, source: 1417});
	const started = useRef({});
	const nextPid = useRef(FIRST_PID);
	// How many windows of each app have been numbered.
	const numbered = useRef({});
	const bootedAt = useRef(null);
	const powerTimer = useRef(null);
	const animate = !reduceMotion;

	useEffect(() => {
		setHydrated(true);
		bootedAt.current = new Date();

		// A phone starts with just the website, unless the URL asks for the editor.
		if (window.matchMedia?.(SMALL).matches && focused !== 'source') {
			delete pids.current.source;
			setOpen(({source, ...rest}) => rest);
		}
	}, []);

	useEffect(() => {
		const timers = closeTimers.current;

		return () => {
			Object.values(timers).forEach(clearTimeout);
			clearTimeout(powerTimer.current);
		};
	}, []);

	// Each time a window opens it's a new process.
	const spawn = win => {
		if (!pids.current[win]) {
			pids.current[win] = nextPid.current++;
			started.current[win] = new Date();
		}
	};

	const isUp = win => !!open[win] && !closing[win];
	// By app, then in the order they were numbered.
	const ids = Object.keys(open).sort((a, b) => ORDER.indexOf(open[a].app) - ORDER.indexOf(open[b].app) || a.length - b.length || a.localeCompare(b));
	const upIds = ids.filter(isUp);
	const showsPage = win => URL_WINDOWS.includes(openNow.current[win]?.app) && !!openNow.current[win].content.portfolio;
	// The front-most open window of `app`, of those `which` accepts, counting any
	// opened since the last render.
	const topmost = (app, which = () => true) => {
		const windows = Object.keys(openNow.current).filter(win => openNow.current[win].app === app && !closingNow.current[win] && which(win));
		return [...stack].reverse().find(win => windows.includes(win)) ?? windows.at(-1);
	};

	// A new window of `app`, at `geometry` if given, otherwise a little below and to
	// the right of the last one of it.
	const openWindow = (app, content, geometry = null) => {
		const taken = openNow.current;
		numbered.current[app] ??= 1;
		const win = taken[app] ? `${app}-${++numbered.current[app]}` : app;
		const previous = windowEls.current[topmost(app)];
		if (geometry) {
			setPlaced(p => ({...p, [win]: geometry}));
		} else if (previous && !small && stage) {
			const geometry = {x: previous.offsetLeft + 32, y: previous.offsetTop + 32, width: previous.offsetWidth, height: previous.offsetHeight};
			setPlaced(p => ({...p, [win]: fitGeometry(geometry, stage, MIN_SIZES[app])}));
		}
		openNow.current = {...taken, [win]: {app, content}};
		setOpen(o => ({...o, [win]: {app, content}}));
		// At the back until it's raised.
		setStack(s => [win, ...s.filter(other => other !== win)]);
		spawn(win);
		return win;
	};

	// Brings a window to the front, without touching the URL.
	const raise = win => {
		spawn(win);
		clearTimeout(closeTimers.current[win]);
		closingNow.current = {...closingNow.current, [win]: false};
		setClosing(c => ({...c, [win]: false}));
		setOverview(false);
		activeNow.current = win;
		setActive(win);
		setStack(s => [...s.filter(other => other !== win), win]);
	};

	const show = (win, e = null) => {
		e?.preventDefault();
		if (!openNow.current[win]) {
			return;
		}
		raise(win);
		const {app, content} = openNow.current[win];
		if (URL_WINDOWS.includes(app) && content.portfolio && app !== focused) {
			onShow(app);
		}
	};

	// The page in the website or the editor, in front: the front-most such window, or a new one.
	const showPage = (app, e = null) => {
		const win = topmost(app, showsPage) ?? openWindow(app, PORTFOLIO);
		show(win, e);
		return win;
	};

	// However `focused` changed (a link to the source, the back button), a window
	// showing the page in that app comes to the front, unless one already is.
	useEffect(() => {
		if (open[active]?.app !== focused || !showsPage(active) || !isUp(active)) {
			const win = topmost(focused, showsPage) ?? openWindow(focused, PORTFOLIO);
			raise(win);
		}
	}, [focused]);


	useEffect(() => {
		if (!overview) {
			return undefined;
		}

		const onKey = e => {
			if (e.key === 'Escape') {
				setOverview(false);
			}
		};
		document.addEventListener('keydown', onKey);

		return () => document.removeEventListener('keydown', onKey);
	}, [overview]);

	const anyUp = upIds.length > 0;

	// Closing the last window opens Activities once it has gone, so that its own
	// closing isn't cut short; shutting down, which closes them all, doesn't.
	const anyOpen = ids.length > 0;
	const wasOpen = useRef(anyOpen);
	useEffect(() => {
		if (wasOpen.current && !anyOpen && !power) {
			setOverview(true);
		}
		wasOpen.current = anyOpen;
	}, [anyOpen]);
	useEffect(() => {
		if (anyUp) {
			setLost(false);
		}
		if (anyUp || menuOpen) {
			setDismissed(false);
		}
	}, [anyUp, menuOpen]);

	const idle = !anyUp && !menuOpen && !power;
	useEffect(() => {
		if (!idle || lost || dismissed) {
			return undefined;
		}

		const timer = setTimeout(() => setLost(true), small ? LOST_SMALL_MS : LOST_MS);
		return () => clearTimeout(timer);
	}, [idle, lost, dismissed, small]);

	const dismissLost = () => {
		setLost(false);
		setDismissed(true);
	};

	// Too many browser windows and the kernel panics; what it says is loaded only
	// then, as the terminal is.
	const browsers = upIds.filter(win => open[win].app === 'site');
	const exhausted = browsers.length >= BROWSER_LIMIT;
	useEffect(() => {
		if (exhausted) {
			const uptime = (Date.now() - bootedAt.current) / 1000;
			const pid = pids.current[browsers.at(-1)];
			import('../console/power').then(({exhaustedText, bootSequence}) => {
				latest.current.halt({mode: 'panic', lines: exhaustedText({uptime, pid}), boot: bootSequence()});
			});
		}
	}, [exhausted]);

	const pageOpen = ids.some(showsPage);
	useEffect(() => {
		onPageOpen?.(pageOpen);
	}, [pageOpen]);

	// Printing gives just the website's page (see @media print in _Desktop.scss), from
	// a copy laid out for the occasion. It has to be in place before the browser lays
	// out the printout, hence flushSync.
	useEffect(() => {
		const start = () => flushSync(() => setPrinting(true));
		const end = () => setPrinting(false);
		window.addEventListener('beforeprint', start);
		window.addEventListener('afterprint', end);

		return () => {
			window.removeEventListener('beforeprint', start);
			window.removeEventListener('afterprint', end);
		};
	}, []);

	// Measured ahead of time, so the zoom into Activities starts from where things are.
	useLayoutEffect(() => {
		const measure = () => {
			const size = {width: stageRef.current.clientWidth, height: stageRef.current.clientHeight};
			setCard(workspaceCard(stageRef.current.parentElement));
			setStage(size);
			return size;
		};
		let size = measure();

		const onResize = () => {
			const before = size;
			size = measure();
			if (window.matchMedia?.(SMALL).matches) {
				return;
			}

			const dock = dockSize(stageRef.current.parentElement);
			resizing.current ??= {
				from: placedNow.current,
				overlaps: Object.fromEntries(Object.entries(placedNow.current).map(([win, geometry]) => [win, dockOverlap(geometry, before, dock)])),
			};
			clearTimeout(resizing.current.timer);
			resizing.current.timer = setTimeout(() => {
				resizing.current = null;
			}, RESIZE_SETTLE_MS);
			const {from, overlaps} = resizing.current;
			setPlaced(now => Object.fromEntries(Object.entries(now).map(([win, geometry]) => [
				win,
				from[win] ? refitGeometry(from[win], size, MIN_SIZES[openNow.current[win].app], dock, overlaps[win]) : geometry,
			])));
		};
		window.addEventListener('resize', onResize);

		return () => {
			window.removeEventListener('resize', onResize);
			clearTimeout(resizing.current?.timer);
		};
	}, []);

	// Small screens: switching, or closing with another window open, minimises the
	// window to its dock icon and restores the next from its own.
	const visible = isUp(active) ? active : null;
	const shown = useRef({visible, overview});
	useLayoutEffect(() => {
		const before = shown.current;
		shown.current = {visible, overview};
		if (!small || !animate || overview || before.overview || !visible || before.visible === visible) {
			return;
		}

		const stage = stageRef.current.getBoundingClientRect();
		const minimised = win => {
			const el = windowEls.current[win];
			const icon = stageRef.current.querySelector(`.dt-dock-item[data-win='${open[win].app}']`).getBoundingClientRect();
			const x = icon.x + icon.width / 2 - (stage.x + el.offsetLeft + el.offsetWidth / 2);
			const y = icon.y + icon.height / 2 - (stage.y + el.offsetTop + el.offsetHeight / 2);

			return {'visibility': 'visible', '--dt-fade': 0, 'transform': `translate(${x}px, ${y}px) scale(${icon.width / el.offsetWidth})`};
		};
		const restored = {'visibility': 'visible', '--dt-fade': 1, 'transform': 'none'};

		// The one minimising shrinks away over the one being restored.
		if (before.visible && windowEls.current[before.visible] && open[before.visible]) {
			windowEls.current[before.visible].animate?.([{...restored, zIndex: 10}, {...minimised(before.visible), zIndex: 10}], MINIMISE);
		}
		windowEls.current[visible].animate?.([minimised(visible), restored], MINIMISE);
	}, [visible, overview]);

	// In Activities for one app, the others' windows stand aside.
	const leftOut = win => typeof overview === 'string' && open[win].app !== overview;
	useLayoutEffect(() => {
		if (overview) {
			setFits(fitWindows(upIds.filter(win => !leftOut(win)).map(win => [win, windowEls.current[win]]), card));
		}
	}, [overview, card, upIds.join()]);

	// A dock icon: the app's one window, Activities with its windows if it has
	// several, or a new one if it has none.
	const pick = (app, e) => {
		e.preventDefault();
		const windows = upIds.filter(win => open[win].app === app);
		if (windows.length > 1) {
			setOverview(app);
		} else if (windows.length === 1) {
			show(windows[0]);
		} else {
			show(openWindow(app, URL_WINDOWS.includes(app) ? PORTFOLIO : {}));
		}
	};

	// Closed, it's forgotten where it was put: it opens in its default place.
	const finishClosing = win => {
		delete pids.current[win];
		const {[win]: _, ...stillOpen} = openNow.current;
		openNow.current = stillOpen;
		setOpen(({[win]: _, ...rest}) => rest);
		setClosing(({[win]: _, ...rest}) => rest);
		setPlaced(({[win]: _, ...rest}) => rest);
	};

	// The window behind the one being closed comes to the front.
	const close = win => {
		if (closingNow.current[win] || !openNow.current[win]) {
			return;
		}

		const inFront = win === activeNow.current;
		closingNow.current = {...closingNow.current, [win]: true};
		const next = [...stack].reverse().find(w => w !== win && openNow.current[w] && !closingNow.current[w]);
		if (inFront && next) {
			show(next);
		}

		if (animate) {
			setClosing(c => ({...c, [win]: true}));
			// Minimising (above) takes longer than closing in place.
			const ms = small && inFront && next ? MINIMISE.duration : CLOSE_MS;
			closeTimers.current[win] = setTimeout(() => finishClosing(win), ms);
		} else {
			finishClosing(win);
		}
	};

	const goHome = e => {
		showPage('site');
		onHome(e);
	};

	// Clicking the bare desktop leaves Activities.
	const onDesktopClick = e => {
		if (e.target === e.currentTarget && overview) {
			setOverview(false);
		}
	};

	// The prerendered page holds the focused window's content; the rest follows on the client.
	const hasContent = win => win === active || !!overview || hydrated;

	// Everything closes when the machine goes down, out of sight behind the console.
	const closeAll = () => {
		setCaffeinated(false);
		setDistracted(false);
		setLost(false);
		setDismissed(false);
		Object.values(closeTimers.current).forEach(clearTimeout);
		pids.current = {};
		openNow.current = {};
		setOpen({});
		setPlaced({});
		setClosing({});
		setOverview(false);
	};

	// Like GNOME, the session starts in Activities; it settles behind the boot text,
	// so the desktop zooms in with the overview already in place.
	const powerOn = boot => {
		setOverview(true);
		setPower({mode: 'boot', lines: boot});
	};

	// Black for a while, then the power button.
	const switchOff = (boot, ms) => {
		setPower({mode: 'off'});
		powerTimer.current = setTimeout(() => setPower({mode: 'button', boot}), ms);
	};

	const halt = ({mode, lines, shutdown, boot}) => {
		clearTimeout(powerTimer.current);
		if (mode === 'panic') {
			setCaffeinated(false);
			setDistracted(false);
			setPower({mode, lines});
			powerTimer.current = setTimeout(() => {
				closeAll();
				switchOff(boot, PANIC_OFF_MS);
			}, PANIC_MS);
			return;
		}

		closeAll();
		setPower({mode: 'shutdown', lines: shutdown, boot, reboot: mode === 'reboot'});
	};

	const onPowerDone = () => {
		if (power.mode === 'boot') {
			bootedAt.current = new Date();
			setPower(null);
			setStarting(true);
		} else if (power.reboot) {
			setPower({mode: 'off'});
			powerTimer.current = setTimeout(() => powerOn(power.boot), RESTART_MS);
		} else {
			switchOff(power.boot, OFF_MS);
		}
	};

	// The windows the desktop starts with: the website in front of the editor, or on
	// a phone the website alone, on the home page.
	const startOver = () => {
		if (!small) {
			raise(openWindow('source', PORTFOLIO));
		}
		show(openWindow('site', PORTFOLIO));
		onHome();
	};

	const latest = useRef(null);
	latest.current = {open, closing, stack, stage, small, show, showPage, openWindow, close, halt, startOver, caffeinated, distracted, topmost, onNavigate};

	// What the terminal sees of the system: the windows are its processes.
	const system = useMemo(() => ({
		pid: () => nextPid.current++,
		get bootedAt() {
			return bootedAt.current ?? new Date();
		},
		processes: () => [
			{pid: DESKTOP_PID, name: 'desktop', started: bootedAt.current ?? new Date()},
			...Object.entries(latest.current.open).filter(([win]) => !latest.current.closing[win] && pids.current[win])
				.map(([win, {app}]) => ({pid: pids.current[win], name: PROCESSES[app], started: started.current[win] ?? bootedAt.current ?? new Date()})),
		],
		kill: pid => {
			const win = Object.keys(latest.current.open).find(w => pids.current[w] === pid);
			if (!win) {
				return 'missing';
			}
			latest.current.close(win);
			return 'ok';
		},
		// An app's window in front, opening one if it has none.
		launch: name => {
			const app = WINDOWS[name];
			const {topmost, show, showPage, openWindow} = latest.current;
			if (URL_WINDOWS.includes(app)) {
				showPage(app);
			} else {
				show(topmost(app) ?? openWindow(app, {}));
			}
		},
		// A tab in the visitor's own browser; false if the browser wouldn't open one.
		openUrl: url => {
			const tab = window.open(url, '_blank');
			if (tab) {
				tab.opener = null;
			}
			return !!tab;
		},
		halt: sequence => latest.current.halt(sequence),
		// The caffeine kernel module: the desktop gets the jitters while it's loaded.
		get caffeinated() {
			return latest.current.caffeinated;
		},
		caffeinate: setCaffeinated,
		// The adhd kernel module: the desktop drives itself while it's loaded.
		get distracted() {
			return latest.current.distracted;
		},
		distract: setDistracted,
	}), []);

	// Each terminal is told its own window's pid.
	const systems = useRef({});
	const systemFor = win => {
		systems.current[win] ??= Object.create(system, {terminalPid: {get: () => pids.current[win]}});
		return systems.current[win];
	};

	// The desktop as a program drives it: windows on any content, and where they are.
	const desktop = useMemo(() => ({
		open: (app, content, geometry) => latest.current.openWindow(app, content, geometry),
		// What a window shows; false if it has closed.
		update: (win, content) => {
			if (!latest.current.open[win]) {
				return false;
			}
			setOpen(o => (o[win] ? {...o, [win]: {...o[win], content}} : o));
			return true;
		},
		show: win => latest.current.show(win),
		isOpen: win => !!openNow.current[win] && !closingNow.current[win],
		frontmost: app => latest.current.topmost(app),
		showPage: app => latest.current.showPage(app),
		navigate: name => latest.current.onNavigate(name),
		close: win => latest.current.close(win),
		// Where a window is, and putting it elsewhere: only where windows can move.
		movable: () => !latest.current.small,
		geometry: win => {
			const el = windowEls.current[win];
			return el && {x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight};
		},
		stage: () => latest.current.stage,
		minSize: app => MIN_SIZES[app],
		// No geometry puts it back in its default place.
		place: (win, geometry) => setPlaced(({[win]: _, ...rest}) => (geometry ? {...rest, [win]: geometry} : rest)),
		// Where a window would be if it hadn't been put anywhere.
		defaultGeometry: win => {
			const el = windowEls.current[win];
			const placement = ['left', 'top', 'right', 'bottom', 'width', 'height'];
			const kept = placement.map(name => el.style[name]);
			placement.forEach(name => {
				el.style[name] = '';
			});
			const geometry = {x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight};
			placement.forEach((name, i) => {
				el.style[name] = kept[i];
			});
			return geometry;
		},
	}), []);

	useEffect(() => {
		if (controls) {
			controls.current = desktop;
		}
	}, []);

	// While the adhd module is loaded.
	useEffect(() => {
		if (!distracted || power) {
			return undefined;
		}

		const stop = new AbortController();
		runAdhd(desktop, stop.signal);
		return () => stop.abort();
	}, [distracted, power]);

	// Unloading it tidies up: the windows close one after another, front first, and
	// the desktop starts over as it was. Going down, it all closes anyway.
	const wasDistracted = useRef(distracted);
	useEffect(() => {
		onDistracted?.(distracted);
		const unloaded = wasDistracted.current && !distracted && !power;
		wasDistracted.current = distracted;
		if (!unloaded) {
			return undefined;
		}

		const windows = [...stack].reverse().filter(isUp);
		const timers = windows.map((win, i) => setTimeout(() => latest.current.close(win), i * UNLOAD_CLOSE_MS));
		timers.push(setTimeout(() => latest.current.startOver(), windows.length * UNLOAD_CLOSE_MS + MINIMISE.duration));
		return () => timers.forEach(clearTimeout);
	}, [distracted]);

	const running = new Set(upIds.map(win => open[win].app));
	// An icon stays while its app's windows close, for them to minimise to.
	const docked = new Set(ids.map(win => open[win].app));

	return (
		<div className={`desktop${overview ? ' is-overview' : ''}${anyUp ? ' has-windows' : ''}${caffeinated ? ' is-caffeinated' : ''}`} style={card || keyboard ? {
			...card && {
				'--ov-x': `${card.x}px`, '--ov-y': `${card.y}px`, '--ov-scale': card.scale,
				'--ov-peek-x': `${card.peekX}px`, '--ov-peek-y': `${card.peekY}px`, '--ov-peek-scale': card.peekScale,
			},
			...keyboard && {height: keyboard.height, transform: `translateY(${keyboard.top}px)`},
		} : undefined}>
			<div className={`dt-screen${starting ? ' is-starting' : ''}`} onAnimationEnd={e => e.target === e.currentTarget && setStarting(false)}>
				<div className="dt-wallpaper" aria-hidden="true" />
				<div className="dt-workspace-peek" aria-hidden="true" />
				<TopBar overview={!!overview} onActivities={() => setOverview(o => !o)} menuOpen={menuOpen} setMenuOpen={setMenuOpen} caffeinated={caffeinated} inert={!!power} />

				<div ref={stageRef} className="dt-stage" onClick={onDesktopClick} inert={!!power}>
					{ids.map(win => {
						const {app, content} = open[win];
						return (
							<Window key={win} ref={el => {
								windowEls.current[win] = el;
							}} win={app} name={APPS[app].name} focused={win === active} closing={!!closing[win]} overview={!!overview}
								leftOut={leftOut(win)} layer={stack.indexOf(win) + 1} fit={fits[win]} animate={hydrated && animate}
								geometry={!small && placed[win] && stage ? fitGeometry(placed[win], stage, MIN_SIZES[app]) : null}
								movable={!small && !overview && !closing[win]} minSize={MIN_SIZES[app]}
								onPlace={geometry => {
									resizing.current = null;
									setPlaced(p => ({...p, [win]: geometry}));
								}}
								header={app === 'site' && (
									<BrowserBar url={content.portfolio ? `${SITE.url.slice(0, -1)}${address}` : content.url} shareable={!!content.portfolio}
										scrollAway={small} onClose={() => close(win)} />
								)}
								onActivate={() => show(win)}>
								{hasContent(win) && renderWindow({app, content}, {
									close: () => close(win), showPage, focused: win === active && !overview && !power, system: systemFor(win),
								})}
							</Window>
						);
					})}
					<Dock docked={docked} running={running} hrefs={hrefs} onPick={pick} />
				</div>
				{printing && <div className="dt-print">{renderWindow({app: 'site', content: PORTFOLIO}, {focused: false, system})}</div>}
				{lost && (
					<div className="dt-notification" role="status">
						<div className="dt-notification-header">
							<img src={APPS.site.icon} alt="" />
							<span>{APPS.site.name}</span>
							<button type="button" className="dt-notification-close" aria-label="Dismiss notification" onClick={dismissLost}>
								<CloseIcon />
							</button>
						</div>
						<p>You look like you might be lost.</p>
						<a href={homeHref} className="dt-notification-action" onClick={goHome}>Back to my CV?</a>
					</div>
				)}
			</div>
			{power && <PowerScreen power={power} onDone={onPowerDone} onPowerOn={() => powerOn(power.boot)} />}
		</div>
	);
};

export default Desktop;
