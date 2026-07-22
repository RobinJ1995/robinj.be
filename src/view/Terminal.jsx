import React, {useState, useEffect} from 'react';
import {CONTENT} from '../constants';
import EmailAddress from '../component/EmailAddress';

// Direction B — Terminal / IDE.
// CV-as-terminal-session. Window chrome, monospace, file browser on left.
// Colours come from CSS custom properties (--tm-*) in style/App.scss, swapped by
// prefers-color-scheme, so this view is theme-aware with no JS.

const FILES = [
	{id: 'whoami', name: 'whoami.txt', kind: 'txt'},
	{id: 'cv', name: 'cv.md', kind: 'md'},
	{id: 'projects', name: 'projects.yml', kind: 'yml'},
	{id: 'contact', name: 'contact.yml', kind: 'yml'},
];

// The terminal prompt/title show `robin@robinj.be` as a user@host string. It's
// purely decorative (not a contact link), but rendering it split across spans
// keeps the literal address out of the static HTML — same spam-harvester defence
// as the EmailAddress component, while staying pixel-identical with no JS.
const Host = () => (
	<>{CONTENT.email.split(/(@|\.)/).map((part, i) => <span key={i}>{part}</span>)}</>
);

const kindGlyph = k => ({md: 'M', json: '{}', yml: 'Y', txt: 'T'}[k] || '·');
const kindColor = k => ({md: 'var(--tm-accent2)', json: 'var(--tm-num)', yml: 'var(--tm-str)', txt: 'var(--tm-dim)'}[k] || 'var(--tm-dim)');
const kindLang = k => ({md: 'Markdown', json: 'JSON', yml: 'YAML', txt: 'Plain Text'}[k] || '');

const TerminalApp = ({page, onNavigate, onToggleView}) => (
	<div className="terminal" style={{
		width: '100%', height: '100%', background: 'var(--tm-bg)',
		fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
		color: 'var(--tm-text)', fontSize: 13.5, display: 'flex', flexDirection: 'column',
	}}>
		<TerminalChrome page={page} onToggleView={onToggleView} />
		<div style={{flex: 1, display: 'flex', minHeight: 0}}>
			<TerminalSidebar page={page} onNavigate={onNavigate} />
			<div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
				<TerminalTabs page={page} onNavigate={onNavigate} />
				<div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
					{page === 'whoami' && <TerminalWhoami />}
					{page === 'cv' && <TerminalCV />}
					{page === 'projects' && <TerminalProjects />}
					{page === 'contact' && <TerminalContact />}
				</div>
				<TerminalStatusbar page={page} />
			</div>
		</div>
	</div>
);

const TerminalChrome = ({page, onToggleView}) => (
	<div style={{
		height: 38, background: 'var(--tm-chrome)', borderBottom: '1px solid var(--tm-rule)',
		display: 'flex', alignItems: 'center', padding: '0 10px 0 14px', gap: 14, flexShrink: 0,
	}}>
		<div style={{width: 150, display: 'flex'}}>
			<a href={`/${page === 'whoami' ? 'cv' : page}`} onClick={onToggleView}
				title="View rendered site" className="tm-toggle"
				style={{
					display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 6,
					border: '1px solid var(--tm-rule)', background: 'var(--tm-toggle-bg)',
					color: 'var(--tm-dim)', fontSize: 11, textDecoration: 'none',
				}}>
				<span style={{color: 'var(--tm-accent)'}}>▤</span> rendered
			</a>
		</div>
		<div style={{flex: 1, textAlign: 'center', color: 'var(--tm-dim)', fontSize: 12, letterSpacing: '0.04em'}}>
			<Host /> — ~/portfolio — 132×42
		</div>
		<div style={{display: 'flex', width: 150, justifyContent: 'flex-end'}}>
			<span style={{
				width: 26, height: 26, borderRadius: '50%', background: 'var(--tm-close-bg)',
				color: 'var(--tm-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
			}}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			</span>
		</div>
	</div>
);

// The git block reflects the real GitHub repository. It renders design-time
// placeholders during SSR / before the fetch resolves, then updates on mount —
// so no data lands in the static HTML and there is no hydration mismatch.
const GIT_REPO = 'RobinJ1995/robinj.be';

const relativeTime = iso => {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) {
		return null;
	}
	const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
	const units = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]];
	for (const [label, size] of units) {
		if (secs >= size) {
			return `${Math.floor(secs / size)}${label} ago`;
		}
	}
	return 'just now';
};

const useGitStats = () => {
	const [stats, setStats] = useState({branch: 'main', lastCommit: '…', commitCount: null});

	useEffect(() => {
		const ctrl = new AbortController();
		// Never leave the request hanging on a slow/unreachable network.
		const timer = setTimeout(() => ctrl.abort(), 6000);

		(async () => {
			try {
				const repo = await fetch(`https://api.github.com/repos/${GIT_REPO}`, {signal: ctrl.signal})
					.then(r => (r.ok ? r.json() : Promise.reject(new Error('repo'))));
				const branch = repo.default_branch || 'main';
				const next = {branch, lastCommit: relativeTime(repo.pushed_at) || '…', commitCount: null};

				const res = await fetch(`https://api.github.com/repos/${GIT_REPO}/commits?per_page=1&sha=${branch}`, {signal: ctrl.signal});
				if (res.ok) {
					const link = res.headers.get('Link');
					const match = link && link.match(/[?&]page=(\d+)>;\s*rel="last"/);
					if (match) {
						next.commitCount = Number(match[1]);
					}
				}

				setStats(prev => ({...prev, ...next}));
			} catch {
				/* Offline / rate-limited — keep the placeholders. */
			} finally {
				clearTimeout(timer);
			}
		})();

		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	}, []);

	return stats;
};

const TerminalSidebar = ({page, onNavigate}) => {
	const git = useGitStats();

	return (
		<aside style={{
			width: 260, flexShrink: 0, background: 'var(--tm-sidebar)',
			borderRight: '1px solid var(--tm-rule)', padding: '18px 0',
			display: 'flex', flexDirection: 'column',
		}}>
			<div style={{padding: '0 18px 14px', display: 'flex', alignItems: 'center', gap: 12}}>
				<div style={{width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--tm-rule)'}}>
					<img src="/img/me.webp" alt={CONTENT.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
				</div>
				<div style={{minWidth: 0}}>
					<div style={{fontSize: 13, fontWeight: 600, color: 'var(--tm-text)'}}>{CONTENT.name}</div>
					<div style={{fontSize: 11, color: 'var(--tm-dim)'}}>{CONTENT.location}</div>
				</div>
			</div>

			<div style={{
				padding: '6px 18px', color: 'var(--tm-dim)', fontSize: 10, letterSpacing: '0.1em',
				textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
			}}>
				<span>▾</span><span>portfolio</span>
			</div>

			<nav style={{display: 'flex', flexDirection: 'column'}}>
				{FILES.map(f => {
					const active = page === f.id;
					return (
						<a key={f.id} href={`/${f.id}/source`} aria-label={f.name}
							aria-current={active ? 'page' : undefined}
							onClick={e => onNavigate(`${f.id}/source`, e)}
							className="tm-file"
							style={{
								textAlign: 'left', padding: '7px 18px 7px 32px', fontSize: 13, textDecoration: 'none',
								color: active ? 'var(--tm-text)' : 'var(--tm-dim)',
								background: active ? 'var(--tm-surface)' : 'transparent',
								borderLeft: `2px solid ${active ? 'var(--tm-accent)' : 'transparent'}`,
								display: 'flex', alignItems: 'center', gap: 10,
							}}>
							<span style={{color: kindColor(f.kind)}}>{kindGlyph(f.kind)}</span>
							<span>{f.name}</span>
						</a>
					);
				})}
			</nav>

			<div style={{marginTop: 18, padding: '0 18px'}}>
				<div style={{color: 'var(--tm-dim)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8}}>▾ git</div>
				<div style={{fontSize: 11.5, color: 'var(--tm-dim)', lineHeight: 1.6, paddingLeft: 14}}>
					<div><span style={{color: 'var(--tm-accent)'}}>●</span> branch: <span style={{color: 'var(--tm-text)'}}>{git.branch}</span></div>
					<div><span style={{color: 'var(--tm-accent2)'}}>●</span> last commit: {git.lastCommit}</div>
					<div><span style={{color: 'var(--tm-num)'}}>●</span> {git.commitCount != null ? `${git.commitCount} commits` : '… commits'}</div>
				</div>
			</div>

			<div style={{marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--tm-rule)', fontSize: 11, color: 'var(--tm-dim)', lineHeight: 1.6}}>
				<div><EmailAddress>{CONTENT.email}</EmailAddress></div>
				<div>{CONTENT.github}</div>
			</div>
		</aside>
	);
};

const TerminalTabs = ({page, onNavigate}) => (
	<div style={{
		display: 'flex', borderBottom: '1px solid var(--tm-rule)', background: 'var(--tm-chrome)',
		flexShrink: 0, paddingTop: 4, paddingLeft: 4,
	}}>
		{FILES.map(f => {
			const active = page === f.id;
			return (
				<a key={f.id} href={`/${f.id}/source`} aria-label={f.name}
					onClick={e => onNavigate(`${f.id}/source`, e)}
					className="tm-tab"
					style={{
						padding: '8px 16px 9px', fontSize: 12, textDecoration: 'none',
						color: active ? 'var(--tm-text)' : 'var(--tm-dim)',
						background: active ? 'var(--tm-surface)' : 'transparent',
						borderTop: `1px solid ${active ? 'var(--tm-rule)' : 'transparent'}`,
						borderLeft: `1px solid ${active ? 'var(--tm-rule)' : 'transparent'}`,
						borderRight: `1px solid ${active ? 'var(--tm-rule)' : 'transparent'}`,
						borderRadius: '6px 6px 0 0', marginRight: 1, position: 'relative', top: 1,
						display: 'flex', alignItems: 'center', gap: 7,
					}}>
					<span style={{color: kindColor(f.kind), fontSize: 10}}>{kindGlyph(f.kind)}</span>
					{f.name}
					<span style={{marginLeft: 4, color: 'var(--tm-dim)', fontSize: 14, lineHeight: 1}}>×</span>
				</a>
			);
		})}
	</div>
);

const TerminalStatusbar = ({page}) => {
	const f = FILES.find(x => x.id === page);
	return (
		<div style={{
			height: 24, flexShrink: 0, background: 'var(--tm-statusbar-bg)',
			borderTop: '1px solid var(--tm-rule)', display: 'flex', alignItems: 'center',
			padding: '0 14px', fontSize: 11, color: 'var(--tm-dim)', gap: 16,
		}}>
			<span><span style={{color: 'var(--tm-accent)'}}>●</span> ready</span>
			<span>main</span>
			<span>UTF-8</span>
			<span>LF</span>
			<span>{kindLang(f?.kind)}</span>
			<span style={{marginLeft: 'auto'}}>Robin Jacobs · v0.20.26</span>
		</div>
	);
};

// ─── Content viewers (rendered like the file types they represent) ─────────

// A logical line is either a ReactNode, or { node, hang } where `hang` is the
// number of monospace columns to indent wrapped continuation lines by. Each
// logical line gets exactly one gutter number and grows downward when it wraps.
const CodePane = ({lines}) => (
	<div style={{height: '100%', overflowY: 'auto', background: 'var(--tm-surface)', padding: '18px 0', fontSize: 13, lineHeight: 1.7}}>
		{lines.map((l, i) => {
			const obj = l && typeof l === 'object' && 'node' in l;
			const node = obj ? l.node : l;
			const hang = obj ? l.hang : 0;
			return (
				<div key={i} style={{display: 'flex', alignItems: 'flex-start'}}>
					<div style={{
						color: 'var(--tm-com)', textAlign: 'right', userSelect: 'none',
						paddingRight: 14, marginRight: 18, minWidth: 36, flexShrink: 0,
						borderRight: '1px solid var(--tm-rule)', alignSelf: 'stretch',
						fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
					}}>{i + 1}</div>
					<div style={{
						flex: 1, paddingRight: 32, minWidth: 0,
						whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
						paddingLeft: hang ? `${hang}ch` : 0,
					}}>{node === '' ? '​' : node}</div>
				</div>
			);
		})}
	</div>
);

const H = s => <span style={{color: 'var(--tm-kw)', fontWeight: 600}}>{s}</span>;
const Sub = s => <span style={{color: 'var(--tm-accent2)', fontWeight: 600}}>{s}</span>;
const Str = s => <span style={{color: 'var(--tm-str)'}}>{s}</span>;
const Com = s => <span style={{color: 'var(--tm-com)', fontStyle: 'italic'}}>{s}</span>;
const Tag = s => <span style={{color: 'var(--tm-num)'}}>{s}</span>;
const Key = s => <span style={{color: 'var(--tm-kw)'}}>{s}</span>;

const TerminalWhoami = () => {
	const prompt = (
		<span>
			<span style={{color: 'var(--tm-accent)'}}><Host /></span>
			<span style={{color: 'var(--tm-dim)'}}>:</span>
			<span style={{color: 'var(--tm-accent2)'}}>~</span>
			<span style={{color: 'var(--tm-dim)'}}>$ </span>
		</span>
	);
	return (
		<div style={{height: '100%', overflowY: 'auto', background: 'var(--tm-surface)', padding: '24px 28px', lineHeight: 1.7}}>
			<div>{prompt}<span>whoami</span></div>
			<div style={{color: 'var(--tm-text)', marginBottom: 14}}>{CONTENT.name}</div>

			<div>{prompt}<span>cat ~/.profile</span></div>
			<pre style={{margin: '4px 0 16px', fontFamily: 'inherit', whiteSpace: 'pre-wrap', color: 'var(--tm-text)'}}>
{`# ─────────────────────────────
# ${CONTENT.name}
# ${CONTENT.tagline}
# ─────────────────────────────
export ROLE="Senior Software Engineer"
export CURRENT_COMPANY="Beeline"
export LOCATION="${CONTENT.location}"
`}
			</pre>

			<div>{prompt}<span>fortune --about-me</span></div>
			<div style={{color: 'var(--tm-text)', maxWidth: 700, marginBottom: 6}}>{CONTENT.bio[0]}</div>
			<div style={{color: 'var(--tm-text)', maxWidth: 700, marginBottom: 18}}>{CONTENT.bio[1]}</div>

			<div>{prompt}<span>ls -la ./contact</span></div>
			<div style={{margin: '4px 0 16px', color: 'var(--tm-text)', whiteSpace: 'pre-wrap'}}>
				<div>-rw-r--r--  robin  e-mail     <EmailAddress>{CONTENT.email}</EmailAddress></div>
				<div>{`-rw-r--r--  robin  linkedin   ${CONTENT.linkedin}`}</div>
				<div>{`-rw-r--r--  robin  github     ${CONTENT.github}`}</div>
			</div>

			<div>{prompt}<span className="tm-cursor">&nbsp;</span></div>
		</div>
	);
};

const TerminalCV = () => {
	const lines = [];
	lines.push(<>{H('#')} CV</>);
	lines.push(<>{Com('> ' + CONTENT.bio[0])}</>);
	lines.push('');
	lines.push(<>{H('##')} Work Experience</>);
	CONTENT.work.forEach(w => {
		lines.push('');
		lines.push(<>{Sub('###')} {w.title} {Com('@')} <b>{w.company}</b> {Tag(`[${w.start} → ${w.end}]`)}</>);
		lines.push(<>{Com(`  ${w.location} · ${w.type}${w.promoted ? ' · promoted' : ''}`)}</>);
		lines.push({hang: 2, node: <>{w.summary}</>});
		if (w.bullets) {
			w.bullets.forEach(b => lines.push({hang: 2, node: <>{H('-')} {b}</>}));
		}
		if (w.tech) {
			lines.push(<>  {Tag('tech:')} {w.tech.map((t, i) => <React.Fragment key={i}>{i ? ', ' : ''}{Str(`"${t}"`)}</React.Fragment>)}</>);
		}
	});
	lines.push('');
	lines.push(<>{H('##')} Education</>);
	CONTENT.education.forEach(e => {
		lines.push('');
		lines.push(<>{Sub('###')} {e.degree} {Com('@')} <b>{e.school}</b> {Tag(`[${e.start} → ${e.end}]`)}</>);
		lines.push(<>{Com(`  ${e.location}${e.note ? ` // ${e.note}` : ''}`)}</>);
	});
	lines.push('');
	lines.push(<>{H('##')} Volunteering</>);
	CONTENT.volunteering.forEach(v => {
		lines.push(<>  {H('-')} <b>{v.title}</b> {Com('@')} {v.org} {Tag(`[${v.start} → ${v.end}]`)} {Com(v.location)}</>);
		if (v.note) {
			lines.push(<>     {Str(`"${v.note}"`)}</>);
		}
	});
	lines.push('');
	lines.push(<>{H('##')} Languages</>);
	CONTENT.languages.forEach(l => {
		lines.push(<>  {H('-')} <b>{l.name}</b>: {l.level}</>);
	});

	return <CodePane lines={lines} />;
};

const TerminalProjects = () => {
	const Dash = <span style={{color: 'var(--tm-dim)'}}>-</span>;
	const lines = [];
	CONTENT.projects.forEach((p, i) => {
		if (i) {
			lines.push('');
		}
		lines.push(<>{Dash} {Key('name')}: {Str(p.name)}</>);
		lines.push(<>  {Key('url')}: {Str(`https://${p.url}`)}</>);
		lines.push(<>  {Key('description')}: {Str('>')}</>);
		lines.push({hang: 4, node: <><span style={{color: 'var(--tm-text)'}}>{p.blurb}</span></>});
		lines.push(<>  {Key('stack')}: {p.tech.map((t, j) => <React.Fragment key={j}>{j ? ', ' : '['}{Str(t)}</React.Fragment>)}]</>);
	});

	return <CodePane lines={lines} />;
};

const TerminalContact = () => {
	const lines = [
		<>{Com('# Hi! The fastest ways to reach me:')}</>,
		<>{Key('name')}: {Str(CONTENT.name)}</>,
		<>{Key('location')}: {Str(CONTENT.location)}</>,
		<>{Key('channels')}:</>,
		<>  {Key('- email')}: <span style={{color: 'var(--tm-str)'}}><EmailAddress>{CONTENT.email}</EmailAddress></span></>,
		<>  {Key('- linkedin')}: {Str(`https://${CONTENT.linkedin}`)}</>,
		<>  {Key('- github')}: {Str(`https://${CONTENT.github}`)}</>,
	];
	return <CodePane lines={lines} />;
};

export default TerminalApp;
