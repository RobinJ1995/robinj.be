import React, {useState, useEffect, useLayoutEffect, useRef, useMemo} from 'react';

const ORDER = ['site', 'source', 'console'];
// The windows the URL can point at; the terminal has no URL of its own.
const URL_WINDOWS = ['site', 'source'];
// Where windows are maximised, as in _Desktop.scss.
const SMALL = '(width < 900px), (height < 600px)';
const SITE = {title: 'Robin Jacobs', url: 'https://robinj.be/'};
// Matches the dt-close animation in _Desktop.scss.
const CLOSE_MS = 180;
// The windows as the terminal's processes, and back.
const PROCESSES = {site: 'web', source: 'editor', console: 'terminal'};
const WINDOWS = {web: 'site', editor: 'source', terminal: 'console'};
const DESKTOP_PID = 1337;
const FIRST_PID = 2000;
// How long the screen stays black after powering off, before the power button.
const OFF_MS = 3000;
const RESTART_MS = 1200;
// How long an empty desktop waits before suggesting a way back; less on a phone.
const LOST_MS = 5000;
const LOST_SMALL_MS = 3000;
// Minimising a window to its dock icon, or restoring it, on a small screen.
const MINIMISE = {duration: 300, easing: 'cubic-bezier(.25, .46, .45, .94)'};
// A panic stays on screen this long, then the machine is off as after a shutdown.
const PANIC_MS = 4000;
const PANIC_OFF_MS = 2000;

const LockIcon = () => (
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
		<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
	</svg>
);

export const CloseIcon = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

// GNOME's own app icons (see public/img/icons/README.md).
const APPS = {
	site: {name: 'Website', icon: '/img/icons/org.gnome.Epiphany.svg'},
	source: {name: 'Editor', icon: '/img/icons/org.gnome.TextEditor.svg'},
	console: {name: 'Terminal', icon: '/img/icons/org.gnome.Console.svg'},
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

const BrowserBar = ({address, scrollAway, onClose}) => {
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
		<div ref={ref} className={`dt-headerbar${hidden ? ' is-hidden' : ''}`}>
			<span />
			<div className="dt-address-group">
				<div className="dt-address">
					<LockIcon />
					<span><b>robinj.be</b>{address}</span>
				</div>
				{canShare && (
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

const Window = ({ref, win, focused, closing, overview, layer, fit, animate, header, onActivate, children}) => {
	// Only windows opened after hydration animate in; the prerendered ones are just there.
	const [opening] = useState(animate);
	const {name} = APPS[win];
	const interactive = focused && !overview && !closing;
	const classes = ['dt-window', focused && 'is-focused', opening && 'is-opening', closing && 'is-closing'];
	const style = overview && fit
		? {'--z': layer, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, '--ov-scale': fit.scale}
		: {'--z': layer};

	return (
		<section ref={ref} className={classes.filter(Boolean).join(' ')} data-win={win} style={style} aria-label={name} inert={closing}>
			<div className="dt-window-frame">
				{header}
				<div className="dt-window-content" inert={!interactive}>{children}</div>
			</div>
			{!interactive && (
				<button type="button" className="dt-window-activate" aria-label={`Switch to ${name}`} onClick={onActivate} />
			)}
		</section>
	);
};

const Dock = ({open, hrefs, onShow}) => (
	<div className="dt-dock" aria-label="Dock">
		{ORDER.map(win => {
			const {name, icon} = APPS[win];

			const props = {
				className: `dt-dock-item${open[win] ? ' is-running' : ''}`,
				'aria-label': name,
				'data-label': name,
				'data-win': win,
				onClick: e => onShow(win, e),
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

const workspaceCard = desktop => {
	const width = desktop.clientWidth;
	const height = desktop.clientHeight;
	const css = getComputedStyle(desktop);
	const dockLeft = parseFloat(css.getPropertyValue('--dt-dock-left')) || 0;
	const dockBottom = parseFloat(css.getPropertyValue('--dt-dock-bottom')) || 0;
	const area = {
		x: dockLeft + width * 0.06,
		y: TOP_BAR + height * 0.05,
		width: width - dockLeft - width * 0.12,
		height: height - TOP_BAR - dockBottom - height * 0.1,
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

// A GNOME-style desktop around the website, the editor and a terminal. The website
// or editor in front follows the URL (`/x` vs `/x/source`); the terminal, and which
// windows are open, are local to the visit.
const Desktop = ({focused, hrefs, address, homeHref, onShow, onHome, renderWindow}) => {
	const [open, setOpen] = useState({site: true, source: true, console: false});
	// The terminal, when it's in front of whatever the URL points at.
	const [front, setFront] = useState(null);
	// Back to front.
	const [stack, setStack] = useState(() => [...URL_WINDOWS.filter(win => win !== focused), focused]);
	const [closing, setClosing] = useState({});
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
	const keyboard = useKeyboardFit();
	const small = useMedia(SMALL);
	const reduceMotion = useMedia('(prefers-reduced-motion: reduce)');
	const stageRef = useRef(null);
	const windowEls = useRef({});
	const closeTimers = useRef({});
	const pids = useRef({site: 1402, source: 1417});
	const started = useRef({});
	const nextPid = useRef(FIRST_PID);
	const bootedAt = useRef(null);
	const powerTimer = useRef(null);
	const animate = !reduceMotion;
	const active = front ?? focused;

	useEffect(() => {
		setHydrated(true);
		bootedAt.current = new Date();

		// A phone starts with just the website, unless the URL asks for the editor.
		if (window.matchMedia?.(SMALL).matches && focused !== 'source') {
			delete pids.current.source;
			setOpen(o => ({...o, source: false}));
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

	// However the URL changed (in-page toggle, back button), its window comes to the front.
	useEffect(() => {
		spawn(focused);
		setOpen(o => (o[focused] ? o : {...o, [focused]: true}));
		setFront(null);
	}, [focused]);

	useEffect(() => {
		setStack(s => (s[s.length - 1] === active ? s : [...s.filter(win => win !== active), active]));
	}, [active]);

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

	const openWindows = ORDER.filter(win => open[win]);
	const isUp = win => open[win] && !closing[win];

	const anyUp = ORDER.some(isUp);
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

	// Measured ahead of time, so the zoom into Activities starts from where things are.
	useLayoutEffect(() => {
		const measure = () => setCard(workspaceCard(stageRef.current.parentElement));
		measure();
		window.addEventListener('resize', measure);

		return () => window.removeEventListener('resize', measure);
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
			const icon = stageRef.current.querySelector(`.dt-dock-item[data-win='${win}']`).getBoundingClientRect();
			const x = icon.x + icon.width / 2 - (stage.x + el.offsetLeft + el.offsetWidth / 2);
			const y = icon.y + icon.height / 2 - (stage.y + el.offsetTop + el.offsetHeight / 2);

			return {'visibility': 'visible', '--dt-fade': 0, 'transform': `translate(${x}px, ${y}px) scale(${icon.width / el.offsetWidth})`};
		};
		const restored = {'visibility': 'visible', '--dt-fade': 1, 'transform': 'none'};

		// The one minimising shrinks away over the one being restored.
		if (before.visible && windowEls.current[before.visible]) {
			windowEls.current[before.visible].animate?.([{...restored, zIndex: 10}, {...minimised(before.visible), zIndex: 10}], MINIMISE);
		}
		windowEls.current[visible].animate?.([minimised(visible), restored], MINIMISE);
	}, [visible, overview]);

	useLayoutEffect(() => {
		if (overview) {
			setFits(fitWindows(ORDER.filter(isUp).map(win => [win, windowEls.current[win]]), card));
		}
	}, [overview, card, open.site, open.source, open.console, closing.site, closing.source, closing.console]);

	// Opens a window and brings it to the front, without touching the URL.
	const raise = win => {
		spawn(win);
		clearTimeout(closeTimers.current[win]);
		setClosing(c => ({...c, [win]: false}));
		setOverview(false);
		setOpen(o => ({...o, [win]: true}));
		setFront(win === 'console' ? win : null);
	};

	const show = (win, e = null) => {
		e?.preventDefault();
		raise(win);
		if (win !== 'console' && win !== focused) {
			onShow(win);
		}
	};

	const finishClosing = win => {
		delete pids.current[win];
		setOpen(o => ({...o, [win]: false}));
		setClosing(c => ({...c, [win]: false}));
		setFront(f => (f === win ? null : f));
	};

	// The window behind the one being closed comes to the front.
	const close = win => {
		if (closing[win]) {
			return;
		}

		const next = [...stack].reverse().find(w => w !== win && isUp(w));
		if (win === active && next) {
			show(next);
		}

		if (animate) {
			setClosing(c => ({...c, [win]: true}));
			// Minimising (above) takes longer than closing in place.
			const ms = small && win === active && next ? MINIMISE.duration : CLOSE_MS;
			closeTimers.current[win] = setTimeout(() => finishClosing(win), ms);
		} else {
			finishClosing(win);
		}
	};

	const goHome = e => {
		spawn('site');
		clearTimeout(closeTimers.current.site);
		setClosing(c => ({...c, site: false}));
		setOverview(false);
		setOpen(o => ({...o, site: true}));
		onHome(e);
	};

	// Clicking the bare desktop leaves Activities.
	const onDesktopClick = e => {
		if (e.target === e.currentTarget && overview) {
			setOverview(false);
		}
	};

	// The prerendered page holds the focused window's content; the rest follows on the client.
	const hasContent = win => win === active || overview || hydrated;

	// Everything closes when the machine goes down, out of sight behind the console.
	const closeAll = () => {
		setCaffeinated(false);
		setLost(false);
		setDismissed(false);
		Object.values(closeTimers.current).forEach(clearTimeout);
		pids.current = {};
		setOpen({site: false, source: false, console: false});
		setClosing({});
		setFront(null);
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

	// What the terminal sees of the system: the windows are its processes.
	const latest = useRef(null);
	latest.current = {open, closing, show, close, halt, caffeinated};
	const system = useMemo(() => ({
		pid: () => nextPid.current++,
		get terminalPid() {
			return pids.current.console;
		},
		get bootedAt() {
			return bootedAt.current ?? new Date();
		},
		processes: () => [
			{pid: DESKTOP_PID, name: 'desktop', started: bootedAt.current ?? new Date()},
			...ORDER.filter(win => latest.current.open[win] && !latest.current.closing[win] && pids.current[win])
				.map(win => ({pid: pids.current[win], name: PROCESSES[win], started: started.current[win] ?? bootedAt.current ?? new Date()})),
		],
		kill: pid => {
			const win = ORDER.find(w => pids.current[w] === pid && latest.current.open[w]);
			if (!win) {
				return 'missing';
			}
			latest.current.close(win);
			return 'ok';
		},
		launch: app => latest.current.show(WINDOWS[app]),
		halt: sequence => latest.current.halt(sequence),
		// The caffeine kernel module: the desktop gets the jitters while it's loaded.
		get caffeinated() {
			return latest.current.caffeinated;
		},
		caffeinate: setCaffeinated,
	}), []);

	return (
		<div className={`desktop${overview ? ' is-overview' : ''}${caffeinated ? ' is-caffeinated' : ''}`} style={card || keyboard ? {
			...card && {
				'--ov-x': `${card.x}px`, '--ov-y': `${card.y}px`, '--ov-scale': card.scale,
				'--ov-peek-x': `${card.peekX}px`, '--ov-peek-y': `${card.peekY}px`, '--ov-peek-scale': card.peekScale,
			},
			...keyboard && {height: keyboard.height, transform: `translateY(${keyboard.top}px)`},
		} : undefined}>
			<div className={`dt-screen${starting ? ' is-starting' : ''}`} onAnimationEnd={e => e.target === e.currentTarget && setStarting(false)}>
				<div className="dt-wallpaper" aria-hidden="true" />
				<div className="dt-workspace-peek" aria-hidden="true" />
				<TopBar overview={overview} onActivities={() => setOverview(o => !o)} menuOpen={menuOpen} setMenuOpen={setMenuOpen} caffeinated={caffeinated} inert={!!power} />

				<div ref={stageRef} className="dt-stage" onClick={onDesktopClick} inert={!!power}>
					{openWindows.map(win => (
						<Window key={win} ref={el => {
							windowEls.current[win] = el;
						}} win={win} focused={win === active} closing={!!closing[win]} overview={overview}
							layer={stack.indexOf(win) + 1} fit={fits[win]} animate={hydrated && animate}
							header={win === 'site' && <BrowserBar address={address} scrollAway={small} onClose={() => close('site')} />}
							onActivate={() => show(win)}>
							{hasContent(win) && renderWindow(win, {close: () => close(win), raise, focused: win === active && !overview && !power, system})}
						</Window>
					))}
					<Dock open={open} hrefs={hrefs} onShow={show} />
				</div>
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
