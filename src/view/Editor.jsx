import React, {useState, useEffect, useRef} from 'react';
import {CONTENT} from '../content';
import {parseMarkdown, inlineToText} from '../markdown';
import EmailAddress from '../component/EmailAddress';

const FILES = [
	{id: 'whoami', name: 'whoami.txt', kind: 'txt'},
	{id: 'cv', name: 'cv.md', kind: 'md'},
	{id: 'side-quests', name: 'side-quests.yml', kind: 'yml'},
	{id: 'contact', name: 'contact.yml', kind: 'yml'},
];

// Decorative user@host; EmailAddress keeps it out of the static HTML.
const Host = () => <EmailAddress asText>{CONTENT.email}</EmailAddress>;

const RunIcon = () => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
		<path d="M4 2.6v10.8a.9.9 0 0 0 1.37.77l8.6-5.4a.9.9 0 0 0 0-1.54l-8.6-5.4A.9.9 0 0 0 4 2.6z" fill="currentColor" />
	</svg>
);

// A caret that moves around (mouse, arrow keys) while nothing changes: like the
// rest of the system, the files are read-only. Input can be cancelled, except
// an IME's; after one, the view is rebuilt (`key`) as it was.
const useReadOnlyText = label => {
	const ref = useRef(null);
	const [version, setVersion] = useState(0);

	useEffect(() => {
		const el = ref.current;
		const refuse = e => e.preventDefault();
		const restore = () => setVersion(v => v + 1);
		el.addEventListener('beforeinput', refuse);
		el.addEventListener('compositionend', restore);

		return () => {
			el.removeEventListener('beforeinput', refuse);
			el.removeEventListener('compositionend', restore);
		};
	}, [version]);

	return [version, {
		ref,
		className: 'editor-text',
		contentEditable: true,
		suppressContentEditableWarning: true,
		spellCheck: false,
		role: 'textbox',
		'aria-label': label,
		'aria-multiline': true,
		'aria-readonly': true,
	}];
};

const kindGlyph = k => ({md: 'M', json: '{}', yml: 'Y', txt: 'T'}[k] || '·');
const kindColor = k => ({md: 'var(--editor-accent2)', json: 'var(--editor-num)', yml: 'var(--editor-str)', txt: 'var(--editor-dim)'}[k] || 'var(--editor-dim)');
const kindLang = k => ({md: 'Markdown', json: 'JSON', yml: 'YAML', txt: 'Plain Text'}[k] || '');

const EditorApp = ({page, onNavigate, onToggleView, onClose = null}) => {
	const git = useGitStats();
	// A tab for each file viewed in this editor; closing one doesn't change the page.
	const [tabs, setTabs] = useState([page]);
	const file = tabs.includes(page) ? page : null;

	useEffect(() => {
		setTabs(t => (t.includes(page) ? t : [...t, page]));
	}, [page]);

	const openFile = (id, e) => {
		setTabs(t => (t.includes(id) ? t : [...t, id]));
		if (id === page) {
			e.preventDefault();
		} else {
			onNavigate(`${id}/source`, e);
		}
	};

	const closeTab = (id, e) => {
		e.preventDefault();
		const rest = tabs.filter(t => t !== id);
		setTabs(rest);
		if (id === page && rest.length > 0) {
			onNavigate(`${rest[Math.min(tabs.indexOf(id), rest.length - 1)]}/source`);
		}
	};

	return (
		<div className="editor" style={{
			width: '100%', height: '100%', background: 'var(--editor-bg)',
			fontFamily: 'var(--editor-font)',
			color: 'var(--editor-text)', fontSize: 13.5, display: 'flex', flexDirection: 'column',
		}}>
			<EditorChrome page={page} onToggleView={onToggleView} onClose={onClose} />
			<div style={{flex: 1, display: 'flex', minHeight: 0}}>
				<EditorSidebar page={file} git={git} onOpen={openFile} />
				<div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
					<EditorTabs tabs={tabs} page={file} onNavigate={onNavigate} onCloseTab={closeTab} />
					<div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
						{file === 'whoami' && <EditorWhoami />}
						{file === 'cv' && <EditorCV />}
						{file === 'side-quests' && <EditorProjects />}
						{file === 'contact' && <EditorContact />}
						{file === null && (
							<div style={{
								height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
								background: 'var(--editor-surface)', color: 'var(--editor-dim)', fontSize: 13,
							}}>No open files</div>
						)}
					</div>
					<EditorStatusbar page={file} git={git} />
				</div>
			</div>
		</div>
	);
};

const EditorChrome = ({page, onToggleView, onClose}) => {
	const renderedHref = `/${page}`;
	const close = onClose
		? e => {
			e.preventDefault();
			onClose();
		}
		: onToggleView;

	return (
		<div className="editor-chrome" style={{
			height: 38, background: 'var(--editor-chrome)', borderBottom: '1px solid var(--editor-rule)',
			display: 'flex', alignItems: 'center', padding: '0 10px 0 14px', gap: 14, flexShrink: 0,
		}}>
			<div style={{width: 150, display: 'flex'}}>
				<a href={renderedHref} onClick={onToggleView} title="Run" aria-label="Run" className="editor-run">
					<RunIcon />
				</a>
			</div>
			<div className="editor-title" style={{flex: 1, textAlign: 'center', color: 'var(--editor-dim)', fontSize: 12, letterSpacing: '0.04em'}}>
				~/portfolio
			</div>
			<div style={{display: 'flex', width: 150, justifyContent: 'flex-end'}}>
				<a href={renderedHref} onClick={close}
					title="Close" aria-label="Close the source view" className="editor-close"
					style={{
						width: 26, height: 26, borderRadius: '50%', background: 'var(--editor-close-bg)',
						color: 'var(--editor-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
					}}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
				</a>
			</div>
		</div>
	);
};

// Fetched on mount, so SSR and hydration both render the placeholders.
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
	const [stats, setStats] = useState({branch: 'master', lastCommit: '…', commitCount: null, head: null});

	useEffect(() => {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 6000);

		(async () => {
			try {
				const repo = await fetch(`https://api.github.com/repos/${GIT_REPO}`, {signal: ctrl.signal})
					.then(r => (r.ok ? r.json() : Promise.reject(new Error('repo'))));
				const branch = repo.default_branch || 'master';
				const next = {branch, lastCommit: relativeTime(repo.pushed_at) || '…'};

				const res = await fetch(`https://api.github.com/repos/${GIT_REPO}/commits?per_page=1&sha=${branch}`, {signal: ctrl.signal});
				if (res.ok) {
					const link = res.headers.get('Link');
					const match = link && link.match(/[?&]page=(\d+)>;\s*rel="last"/);
					if (match) {
						next.commitCount = Number(match[1]);
					}
					const [latest] = await res.json();
					next.head = latest?.sha?.slice(0, 7) ?? null;
				}

				setStats(prev => ({...prev, ...next}));
			} catch {
				/* Offline or rate-limited: keep the placeholders. */
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

const EditorSidebar = ({page, git, onOpen}) => {
	return (
		<aside style={{
			width: 260, flexShrink: 0, background: 'var(--editor-sidebar)',
			borderRight: '1px solid var(--editor-rule)', padding: '18px 0',
			display: 'flex', flexDirection: 'column',
		}}>
			<div style={{padding: '0 18px 14px', display: 'flex', alignItems: 'center', gap: 12}}>
				<div style={{width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--editor-rule)'}}>
					<img src="/img/me.webp" alt={CONTENT.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
				</div>
				<div style={{minWidth: 0}}>
					<div style={{fontSize: 13, fontWeight: 600, color: 'var(--editor-text)'}}>{CONTENT.name}</div>
					<div style={{fontSize: 11, color: 'var(--editor-dim)'}}>{CONTENT.location}</div>
				</div>
			</div>

			<div style={{
				padding: '6px 18px', color: 'var(--editor-dim)', fontSize: 10, letterSpacing: '0.1em',
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
							onClick={e => onOpen(f.id, e)}
							className="editor-file"
							style={{
								textAlign: 'left', padding: '7px 18px 7px 32px', fontSize: 13, textDecoration: 'none',
								color: active ? 'var(--editor-text)' : 'var(--editor-dim)',
								background: active ? 'var(--editor-surface)' : 'transparent',
								borderLeft: `2px solid ${active ? 'var(--editor-accent)' : 'transparent'}`,
								display: 'flex', alignItems: 'center', gap: 10,
							}}>
							<span style={{color: kindColor(f.kind)}}>{kindGlyph(f.kind)}</span>
							<span>{f.name}</span>
						</a>
					);
				})}
			</nav>

			<div style={{marginTop: 18, padding: '0 18px'}}>
				<div style={{color: 'var(--editor-dim)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8}}>▾ git</div>
				<div style={{fontSize: 11.5, color: 'var(--editor-dim)', lineHeight: 1.6, paddingLeft: 14}}>
					<div><span style={{color: 'var(--editor-accent)'}}>●</span> branch: <span style={{color: 'var(--editor-text)'}}>{git.branch}</span></div>
					<div><span style={{color: 'var(--editor-accent2)'}}>●</span> last commit: {git.lastCommit}</div>
					<div><span style={{color: 'var(--editor-num)'}}>●</span> {git.commitCount != null ? `${git.commitCount} commits` : '… commits'}</div>
				</div>
			</div>

			<div style={{marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--editor-rule)', fontSize: 11, color: 'var(--editor-dim)', lineHeight: 1.6}}>
				<div><EmailAddress>{CONTENT.email}</EmailAddress></div>
				<div>{CONTENT.github}</div>
			</div>
		</aside>
	);
};

const EditorTabs = ({tabs, page, onNavigate, onCloseTab}) => (
	<div style={{
		display: 'flex', borderBottom: '1px solid var(--editor-rule)', background: 'var(--editor-chrome)',
		flexShrink: 0, paddingTop: 4, paddingLeft: 4, minHeight: 38,
	}}>
		{tabs.map(id => {
			const f = FILES.find(x => x.id === id);
			const active = page === id;
			return (
				<div key={id} className="editor-tab" style={{
					fontSize: 12,
					color: active ? 'var(--editor-text)' : 'var(--editor-dim)',
					background: active ? 'var(--editor-surface)' : 'transparent',
					borderTop: `1px solid ${active ? 'var(--editor-rule)' : 'transparent'}`,
					borderLeft: `1px solid ${active ? 'var(--editor-rule)' : 'transparent'}`,
					borderRight: `1px solid ${active ? 'var(--editor-rule)' : 'transparent'}`,
					borderRadius: '6px 6px 0 0', marginRight: 1, position: 'relative', top: 1,
					display: 'flex', alignItems: 'center',
				}}>
					<a href={`/${id}/source`} aria-label={f.name} onClick={e => onNavigate(`${id}/source`, e)} style={{
						padding: '8px 0 9px 16px', color: 'inherit', textDecoration: 'none',
						display: 'flex', alignItems: 'center', gap: 7,
					}}>
						<span style={{color: kindColor(f.kind), fontSize: 10}}>{kindGlyph(f.kind)}</span>
						{f.name}
					</a>
					<button type="button" className="editor-tab-close" aria-label={`Close ${f.name}`} onClick={e => onCloseTab(id, e)} style={{
						padding: '8px 12px 9px 8px', border: 0, background: 'transparent',
						color: 'var(--editor-dim)', fontFamily: 'inherit', fontSize: 14, lineHeight: 1,
					}}>×</button>
				</div>
			);
		})}
	</div>
);

const EditorStatusbar = ({page, git}) => {
	const f = FILES.find(x => x.id === page);
	return (
		<div style={{
			height: 24, flexShrink: 0, background: 'var(--editor-statusbar-bg)',
			borderTop: '1px solid var(--editor-rule)', display: 'flex', alignItems: 'center',
			padding: '0 14px', fontSize: 11, color: 'var(--editor-dim)', gap: 16,
		}}>
			<span><span style={{color: 'var(--editor-accent)'}}>●</span> ready</span>
			<span>{git.branch}</span>
			<span>UTF-8</span>
			<span>LF</span>
			<span>{kindLang(f?.kind)}</span>
			<span style={{marginLeft: 'auto'}}>Robin Jacobs · {git.head ?? '…'}</span>
		</div>
	);
};

// ─── Content viewers ─────────────────────────────────────────────────────────

// A line is a node, or {node, hang} to indent it by `hang` columns. One gutter number per line, however it wraps.
const CodePane = ({name, lines}) => {
	const [version, text] = useReadOnlyText(name);

	return (
		<div key={version} {...text} style={{height: '100%', overflowY: 'auto', background: 'var(--editor-surface)', padding: '18px 0', fontSize: 13, lineHeight: 1.7}}>
			{lines.map((l, i) => {
				const obj = l && typeof l === 'object' && 'node' in l;
				const node = obj ? l.node : l;
				const hang = obj ? l.hang : 0;
				return (
					<div key={i} style={{display: 'flex', alignItems: 'flex-start'}}>
						<div contentEditable={false} style={{
							color: 'var(--editor-com)', textAlign: 'right', userSelect: 'none', cursor: 'default',
							paddingRight: 14, marginRight: 18, minWidth: 36, flexShrink: 0,
							borderRight: '1px solid var(--editor-rule)', alignSelf: 'stretch',
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
};

const H = s => <span style={{color: 'var(--editor-kw)', fontWeight: 600}}>{s}</span>;
const Sub = s => <span style={{color: 'var(--editor-accent2)', fontWeight: 600}}>{s}</span>;
const Str = s => <span style={{color: 'var(--editor-str)'}}>{s}</span>;
const Com = s => <span style={{color: 'var(--editor-com)', fontStyle: 'italic'}}>{s}</span>;
const Tag = s => <span style={{color: 'var(--editor-num)'}}>{s}</span>;
const Key = s => <span style={{color: 'var(--editor-kw)'}}>{s}</span>;

const EditorWhoami = () => {
	const [version, text] = useReadOnlyText('whoami.txt');
	const prompt = (
		<span>
			<span style={{color: 'var(--editor-accent)'}}><Host /></span>
			<span style={{color: 'var(--editor-dim)'}}>:</span>
			<span style={{color: 'var(--editor-accent2)'}}>~</span>
			<span style={{color: 'var(--editor-dim)'}}>$ </span>
		</span>
	);
	return (
		<div key={version} {...text} style={{height: '100%', overflowY: 'auto', background: 'var(--editor-surface)', padding: '24px 28px', lineHeight: 1.7}}>
			<div>{prompt}<span>whoami</span></div>
			<div style={{color: 'var(--editor-text)', marginBottom: 14}}>{CONTENT.name}</div>

			<div>{prompt}<span>cat ~/.profile</span></div>
			<pre style={{margin: '4px 0 16px', fontFamily: 'inherit', whiteSpace: 'pre-wrap', color: 'var(--editor-text)'}}>
{`# ─────────────────────────────
# ${CONTENT.name}
# ${CONTENT.tagline}
# ─────────────────────────────
export ROLE="${CONTENT.role}"
export LOCATION="${CONTENT.location}"
`}
			</pre>

			<div>{prompt}<span>fortune --about-me</span></div>
			<div style={{color: 'var(--editor-text)', maxWidth: 700, marginBottom: 6}}>{CONTENT.bio[0]}</div>
			<div style={{color: 'var(--editor-text)', maxWidth: 700, marginBottom: 18}}>{CONTENT.bio[1]}</div>

			<div>{prompt}<span>ls -la ./contact</span></div>
			<div style={{margin: '4px 0 16px', color: 'var(--editor-text)', whiteSpace: 'pre-wrap'}}>
				<div>-rw-r--r--  robin  e-mail     <EmailAddress>{CONTENT.email}</EmailAddress></div>
				<div>{`-rw-r--r--  robin  linkedin   ${CONTENT.linkedin}`}</div>
				<div>{`-rw-r--r--  robin  github     ${CONTENT.github}`}</div>
			</div>

			<div>{prompt}<span className="editor-cursor">&nbsp;</span></div>
		</div>
	);
};

// Prints the Markdown as written, one line per paragraph or bullet.
const markdownBody = (markdown, hang = 2) => parseMarkdown(markdown).flatMap((block, i) => [
	...(i ? [''] : []),
	...(block.type === 'ul'
		? block.items.map(item => ({hang, node: <>{H('-')} {inlineToText(item)}</>}))
		: [{hang, node: <>{inlineToText(block.inline)}</>}]),
]);

const EditorCV = () => {
	const lines = [];
	lines.push(<>{H('#')} CV</>);
	lines.push(<>{Com('> ' + CONTENT.bio[0])}</>);
	lines.push('');
	lines.push(<>{H('##')} Work Experience</>);
	CONTENT.work.forEach(w => {
		lines.push('');
		lines.push(<>{Sub('###')} {w.title} {Com('@')} <b>{w.company}</b> {Tag(`[${w.start} → ${w.end}]`)}</>);
		lines.push(<>{Com(`  ${w.location} · ${w.type}`)}</>);
		markdownBody(w.description).forEach(line => lines.push(line));
		if (w.tech) {
			lines.push(<>  {Tag('tech:')} {w.tech.map((t, i) => <React.Fragment key={i}>{i ? ', ' : ''}{Str(`"${t}"`)}</React.Fragment>)}</>);
		}
	});
	lines.push('');
	lines.push(<>{H('##')} Education</>);
	CONTENT.education.forEach(e => {
		lines.push('');
		lines.push(<>{Sub('###')} {e.degree} {Com('@')} <b>{e.school}</b> {Tag(`[${e.start} → ${e.end}]`)}</>);
		lines.push(<>{Com(`  ${e.location}`)}</>);
		markdownBody(e.description).forEach(line => lines.push(line));
	});
	lines.push('');
	lines.push(<>{H('##')} Volunteering</>);
	CONTENT.volunteering.forEach(v => {
		lines.push(<>  {H('-')} <b>{v.title}</b> {Com('@')} {v.org} {Tag(`[${v.start} → ${v.end}]`)} {Com(v.location)}</>);
		markdownBody(v.description, 4).forEach(line => lines.push(line));
	});
	lines.push('');
	lines.push(<>{H('##')} (Non-Programming) Languages</>);
	CONTENT.languages.forEach(l => {
		lines.push(<>  {H('-')} <b>{l.name}</b>: {l.level}</>);
	});

	return <CodePane name="cv.md" lines={lines} />;
};

// The description as a YAML folded block (`>`), one line per paragraph or bullet.
const foldedBlock = markdown => parseMarkdown(markdown).flatMap((block, i) => [
	...(i ? [''] : []),
	...(block.type === 'ul'
		? block.items.map(item => ({
			hang: 4, node: <span style={{color: 'var(--editor-text)'}}>{`- ${inlineToText(item)}`}</span>,
		}))
		: [{hang: 4, node: <span style={{color: 'var(--editor-text)'}}>{inlineToText(block.inline)}</span>}]),
]);

const EditorProjects = () => {
	const Dash = <span style={{color: 'var(--editor-dim)'}}>-</span>;
	const list = items => <>{items.map((t, j) => <React.Fragment key={j}>{j ? ', ' : '['}{Str(t)}</React.Fragment>)}]</>;
	const lines = [];
	CONTENT.projects.forEach((p, i) => {
		if (i) {
			lines.push('');
		}
		lines.push(<>{Dash} {Key('name')}: {Str(p.name)}</>);
		lines.push(<>  {Key('url')}: {Str(`https://${p.url}`)}</>);
		lines.push(<>  {Key('description')}: {Str('>')}</>);
		foldedBlock(p.description).forEach(line => lines.push(line));
		lines.push(<>  {Key('stack')}: {list(p.tech)}</>);
		if (p.integrations) {
			lines.push(<>  {Key('integration_with')}: {list(p.integrations)}</>);
		}
	});

	return <CodePane name="side-quests.yml" lines={lines} />;
};

const EditorContact = () => {
	const lines = [
		<>{Com('# Hi!')}</>,
		<>{Key('name')}: {Str(CONTENT.name)}</>,
		<>{Key('location')}: {Str(CONTENT.location)}</>,
		<>{Key('channels')}:</>,
		<>  {Key('- email')}: <span style={{color: 'var(--editor-str)'}}><EmailAddress>{CONTENT.email}</EmailAddress></span></>,
		<>  {Key('- linkedin')}: {Str(`https://${CONTENT.linkedin}`)}</>,
		<>  {Key('- github')}: {Str(`https://${CONTENT.github}`)}</>,
	];
	return <CodePane name="contact.yml" lines={lines} />;
};

export default EditorApp;
