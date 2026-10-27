import React, {useState, useEffect, useLayoutEffect, useRef} from 'react';

const ORDER = ['site', 'source'];
const WIDE = '(min-width: 900px)';
const SITE = {title: 'Robin Jacobs', url: 'https://robinj.be/'};
// Matches the dt-close animation in _Desktop.scss.
const CLOSE_MS = 180;

const BrowserIcon = () => (
	<svg viewBox="0 0 48 48" aria-hidden="true">
		<circle cx="24" cy="24" r="20" fill="#3a7cc2" />
		<circle cx="18" cy="16" r="12" fill="#5d9ad6" opacity=".55" />
		<g fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2">
			<circle cx="24" cy="24" r="19" />
			<ellipse cx="24" cy="24" rx="8" ry="19" />
			<path d="M5 24h38M8 14.5h32M8 33.5h32" />
		</g>
	</svg>
);

const EditorIcon = () => (
	<svg viewBox="0 0 48 48" aria-hidden="true">
		<rect x="8" y="4" width="32" height="40" rx="5" fill="#f6f5f4" />
		<rect x="8.5" y="4.5" width="31" height="39" rx="4.5" fill="none" stroke="#000" strokeOpacity=".15" />
		<g strokeWidth="3" strokeLinecap="round">
			<path d="M14 13h10" stroke="#3584e4" />
			<path d="M18 19.5h14" stroke="#2ec27e" />
			<path d="M18 26h9" stroke="#e66100" />
			<path d="M14 32.5h16" stroke="#9141ac" />
			<path d="M18 39h7" stroke="#3584e4" />
		</g>
	</svg>
);

const LockIcon = () => (
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
		<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
	</svg>
);

const CloseIcon = () => (
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

const PowerIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
		<path d="M8 1.5v6" />
		<path d="M4.6 3.8a5.5 5.5 0 1 0 6.8 0" />
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

const APPS = {
	site: {name: 'Website', Icon: BrowserIcon},
	source: {name: 'Editor', Icon: EditorIcon},
};

const THEMES = [
	{value: 'light', label: 'Light', Icon: LightIcon},
	{value: 'auto', label: 'Auto', Icon: AutoIcon},
	{value: 'dark', label: 'Dark', Icon: DarkIcon},
];

// GNOME's accent colours; the swatches themselves are in _Desktop.scss.
const ACCENTS = ['blue', 'green', 'yellow', 'red', 'purple'];

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

// Theme and accent are explicit choices on <html data-*>, applied early by
// index.html; the fallback (auto, green) is the absence of one. Client-only:
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

	return (
		<div ref={ref} className="dt-quick-settings" role="dialog" aria-label="System menu">
			<Switch label="Style" value={theme} onChange={chooseTheme}
				options={THEMES.map(({value, label, Icon}) => ({value, label, content: <><Icon /><span>{label}</span></>}))} />
			<Switch label="Accent colour" className="dt-accent-switch" value={accent} onChange={chooseAccent}
				options={ACCENTS.map(value => ({value, label: capitalise(value), title: capitalise(value)}))} />
		</div>
	);
};

const TopBar = ({overview, onActivities}) => {
	const [menuOpen, setMenuOpen] = useState(false);
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
		<div className="dt-topbar">
			<button type="button" className="dt-panel-button dt-workspaces" aria-label="Activities" aria-pressed={overview} onClick={onActivities}>
				<span className="dt-workspace-dot is-active" />
				<span className="dt-workspace-dot" />
			</button>
			<Clock />
			<button ref={buttonRef} type="button" className="dt-panel-button dt-status" aria-label="System menu" aria-expanded={menuOpen}
				onClick={() => setMenuOpen(o => !o)}>
				<WiredIcon />
				<PowerIcon />
			</button>
			{menuOpen && <QuickSettings ref={menuRef} />}
		</div>
	);
};

const BrowserBar = ({address, onClose}) => {
	// Decided after mount, so the prerendered HTML doesn't depend on the browser.
	const [canShare, setCanShare] = useState(false);

	useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

	// The site as a whole, not the page being looked at.
	const share = () => navigator.share(SITE).catch(() => {
		/* Dismissed, or sharing isn't allowed here. */
	});

	return (
		<div className="dt-headerbar">
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

const Window = ({ref, win, focused, closing, overview, fit, animate, header, onActivate, children}) => {
	// Only windows opened after hydration animate in; the prerendered ones are just there.
	const [opening] = useState(animate);
	const {name} = APPS[win];
	const interactive = focused && !overview && !closing;
	const classes = ['dt-window', focused && 'is-focused', opening && 'is-opening', closing && 'is-closing'];
	const style = overview && fit
		? {transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, '--ov-scale': fit.scale}
		: undefined;

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
			const {name, Icon} = APPS[win];

			return (
				<a key={win} href={hrefs[win]} className={`dt-dock-item${open[win] ? ' is-running' : ''}`}
					aria-label={name} data-label={name} onClick={e => onShow(win, e)}>
					<Icon />
				</a>
			);
		})}
	</div>
);

// Activities: each window scaled into its own slot, side by side, clear of the dock.
const fitWindows = (stage, windows) => {
	const width = stage?.clientWidth;
	const height = stage?.clientHeight;
	if (!width || !height || windows.length === 0) {
		return {};
	}

	const insets = getComputedStyle(stage);
	const dockLeft = parseFloat(insets.getPropertyValue('--dt-dock-left')) || 0;
	const dockBottom = parseFloat(insets.getPropertyValue('--dt-dock-bottom')) || 0;
	const top = height * 0.08;
	const slotHeight = height - top - Math.max(height * 0.16, dockBottom + 48);
	const side = width * 0.05;
	const gap = width * 0.04;
	const left = dockLeft + side;
	const slotWidth = (width - left - side - gap * (windows.length - 1)) / windows.length;

	return Object.fromEntries(windows.map(([win, el], i) => {
		const scale = Math.min(slotWidth / el.offsetWidth, slotHeight / el.offsetHeight, 0.7);
		const x = left + i * (slotWidth + gap) + slotWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
		const y = top + slotHeight / 2 - (el.offsetTop + el.offsetHeight / 2);

		return [win, {x, y, scale}];
	}));
};

// A GNOME-style desktop around the two views. The focused window follows the URL
// (`/x` vs `/x/source`); which windows are open is local to the visit.
const Desktop = ({focused, hrefs, address, homeHref, onShow, onHome, renderWindow}) => {
	const [open, setOpen] = useState({site: true, source: true});
	const [closing, setClosing] = useState({});
	const [overview, setOverview] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	const [fits, setFits] = useState({});
	const wide = useMedia(WIDE);
	const reduceMotion = useMedia('(prefers-reduced-motion: reduce)');
	const stageRef = useRef(null);
	const windowEls = useRef({});
	const closeTimers = useRef({});
	const animate = wide && !reduceMotion;

	useEffect(() => setHydrated(true), []);

	useEffect(() => {
		const timers = closeTimers.current;

		return () => Object.values(timers).forEach(clearTimeout);
	}, []);

	// However a window got focus (in-page toggle, back button), it's open now.
	useEffect(() => {
		setOpen(o => (o[focused] ? o : {...o, [focused]: true}));
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

	const openWindows = ORDER.filter(win => open[win]);
	const isUp = win => open[win] && !closing[win];

	useLayoutEffect(() => {
		if (!overview) {
			return undefined;
		}

		const layout = () => setFits(fitWindows(stageRef.current, ORDER.filter(isUp).map(win => [win, windowEls.current[win]])));
		layout();
		window.addEventListener('resize', layout);

		return () => window.removeEventListener('resize', layout);
	}, [overview, open.site, open.source, closing.site, closing.source]);

	const show = (win, e = null) => {
		e?.preventDefault();
		clearTimeout(closeTimers.current[win]);
		setClosing(c => ({...c, [win]: false}));
		setOverview(false);
		setOpen(o => ({...o, [win]: true}));
		if (win !== focused) {
			onShow(win);
		}
	};

	const finishClosing = win => {
		setOpen(o => ({...o, [win]: false}));
		setClosing(c => ({...c, [win]: false}));
	};

	const close = win => {
		if (closing[win]) {
			return;
		}

		const [other] = ORDER.filter(w => w !== win && isUp(w));
		if (other && win === focused) {
			onShow(other);
		}

		if (animate) {
			setClosing(c => ({...c, [win]: true}));
			closeTimers.current[win] = setTimeout(() => finishClosing(win), CLOSE_MS);
		} else {
			finishClosing(win);
		}
	};

	const goHome = e => {
		clearTimeout(closeTimers.current.site);
		setClosing(c => ({...c, site: false}));
		setOverview(false);
		setOpen(o => ({...o, site: true}));
		onHome(e);
	};

	// Clicking the bare desktop leaves Activities or, with no windows open, enters it.
	const onDesktopClick = e => {
		const onDesktop = e.target === e.currentTarget;
		if (onDesktop && overview) {
			setOverview(false);
		} else if (onDesktop && openWindows.length === 0) {
			setOverview(true);
		}
	};

	// On a desktop the window behind is visible too; on a phone only the focused one is.
	const hasContent = win => win === focused || overview || wide;

	return (
		<div className={`desktop${overview ? ' is-overview' : ''}`}>
			<div className="dt-wallpaper" aria-hidden="true" />
			<TopBar overview={overview} onActivities={() => setOverview(o => !o)} />

			<div ref={stageRef} className="dt-stage" onClick={onDesktopClick}>
				{openWindows.map(win => (
					<Window key={win} ref={el => {
						windowEls.current[win] = el;
					}} win={win} focused={win === focused} closing={!!closing[win]} overview={overview}
						fit={fits[win]} animate={hydrated && animate}
						header={win === 'site' && <BrowserBar address={address} onClose={() => close('site')} />}
						onActivate={() => show(win)}>
						{hasContent(win) && renderWindow(win, () => close(win))}
					</Window>
				))}
				<Dock open={open} hrefs={hrefs} onShow={show} />
				{overview && openWindows.length === 0 && (
					<div className="dt-dialog" role="alertdialog" aria-labelledby="dt-lost">
						<p id="dt-lost">You look like you might be lost.</p>
						<a href={homeHref} className="dt-dialog-button" onClick={goHome}>Back to my CV?</a>
					</div>
				)}
			</div>
		</div>
	);
};

export default Desktop;
