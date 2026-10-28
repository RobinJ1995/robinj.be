import React, {useRef, useEffect} from 'react';
import {PAGES} from '../constants';
import {CONTENT} from '../content';
import {parseMarkdown} from '../markdown';
import EmailAddress from '../component/EmailAddress';

// See the font tokens in App.scss: the font setting swaps them.
const MONO = 'var(--ed-mono)';
const SERIF = 'var(--ed-serif)';
// Room at the top for a bar lying over the page (the browser's, in _Desktop.scss).
const INSET_TOP = 'var(--ed-inset-top, 0px)';

const EditorialApp = ({page, onNavigate, onToggleView}) => {
	const viewSource = <ViewSourceToggle page={page} onToggleView={onToggleView} />;
	const rootRef = useRef(null);
	const mainRef = useRef(null);

	// Inside a window <main> scrolls, or in a narrow one the whole page does: either
	// way a new page starts at its top.
	useEffect(() => {
		rootRef.current?.scrollTo?.(0, 0);
		mainRef.current?.scrollTo?.(0, 0);
	}, [page]);

	return (
		<div ref={rootRef} className="editorial" style={{
		background: 'var(--ed-bg)', color: 'var(--ed-text)',
		fontFamily: 'var(--ed-sans)',
		minHeight: '100%', width: '100%', display: 'flex',
		fontFeatureSettings: '"ss01", "cv01"',
	}}>
		<EdSidebar page={page} onNavigate={onNavigate} />
		<main ref={mainRef} className="ed-main" style={{flex: 1, padding: `calc(64px + ${INSET_TOP}) 80px 80px`, overflow: 'hidden', minWidth: 0}}>
			{page === 'cv' && <EdCV toggle={viewSource} />}
			{page === 'side-quests' && <EdProjects toggle={viewSource} />}
			{page === 'contact' && <EdContact toggle={viewSource} />}
			{page === 'whoami' && <EdWhoami toggle={viewSource} />}
			{page === '404' && <EdNotFound onNavigate={onNavigate} />}
		</main>
		</div>
	);
};

const EdSidebar = ({page, onNavigate}) => (
	<aside className="ed-sidebar" style={{
		width: 320, flexShrink: 0, padding: `calc(56px + ${INSET_TOP}) 36px 40px`,
		borderRight: '1px solid var(--ed-rule)',
		position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh',
		display: 'flex', flexDirection: 'column', gap: 28,
	}}>
		<div className="ed-profile" style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18}}>
			<div className="ed-avatar" style={{
				flexShrink: 0, width: 132, height: 132, borderRadius: '50%', overflow: 'hidden',
				boxShadow: '0 1px 0 var(--ed-faint), 0 10px 30px rgba(0,0,0,.18)',
				border: '1px solid var(--ed-rule)',
			}}>
				<img src="/img/me.webp" alt={CONTENT.name} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
			</div>
			<div>
				<div className="ed-name" style={{fontFamily: SERIF, fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.01em', fontWeight: 500}}>
					{CONTENT.name}
				</div>
				<div style={{marginTop: 8, fontSize: 13, color: 'var(--ed-dim)', fontStyle: 'italic', fontFamily: SERIF}}>
					{CONTENT.tagline}
				</div>
			</div>
		</div>

		<nav className="ed-nav" style={{display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4}}>
			{Object.values(PAGES).filter(p => p.menu).map(p => {
				const nums = {cv: '01', 'side-quests': '02', contact: '03'};
				const active = page === p.name;
				return (
					<a key={p.name} href={p.url} aria-label={p.title}
						aria-current={active ? 'page' : undefined}
						onClick={e => onNavigate(p.name, e)}
						className="ed-nav-item"
						style={{
							textDecoration: 'none', textAlign: 'left', padding: '10px 0',
							display: 'flex', alignItems: 'baseline', gap: 14,
							color: active ? 'var(--ed-text)' : 'var(--ed-dim)',
							borderBottom: '1px solid var(--ed-rule)',
							fontSize: 16, letterSpacing: '-0.005em',
							transition: 'color .2s, padding .2s',
						}}>
						<span aria-hidden="true" style={{
							fontSize: 11, fontVariantNumeric: 'tabular-nums',
							color: active ? 'var(--ed-accent)' : 'var(--ed-dim)', fontFamily: MONO,
						}}>{nums[p.name]}</span>
						<span style={{fontWeight: active ? 600 : 400}}>{p.title}</span>
						{active && <span aria-hidden="true" className="ed-nav-marker" style={{
							marginLeft: 'auto', width: 16, height: 1, background: 'var(--ed-accent)', alignSelf: 'center',
						}} />}
					</a>
				);
			})}
		</nav>

		<div className="ed-sidebar-footer" style={{marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ed-dim)'}}>
			<div className="ed-contact-link">✉ <EmailAddress>{CONTENT.email}</EmailAddress></div>
			<a className="ed-contact-link" href={`https://${CONTENT.linkedin}`} style={{color: 'inherit', textDecoration: 'none'}}>↗ {CONTENT.linkedin}</a>
			<a className="ed-contact-link" href={`https://${CONTENT.github}`} style={{color: 'inherit', textDecoration: 'none'}}>↗ {CONTENT.github}</a>
			<div style={{marginTop: 14, fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase'}}>
				Based in {CONTENT.location}
			</div>
		</div>
	</aside>
);

const EdEyebrow = ({children, toggle = null}) => (
	<div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18}}>
		<div style={{
			fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
			color: 'var(--ed-accent)',
		}}>{children}</div>
		{toggle}
	</div>
);

const ViewSourceToggle = ({page, onToggleView}) => (
	<a href={`/${page}/source`} onClick={onToggleView}
		title="View source" aria-label="View source" className="ed-source-toggle"
		style={{
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			height: 22, padding: '0 10px', borderRadius: 999,
			border: '1px solid var(--ed-rule)', background: 'var(--ed-surface)',
			fontFamily: MONO, fontSize: 11, fontWeight: 600, lineHeight: 1,
			color: 'var(--ed-dim)', textDecoration: 'none',
		}}>&lt;/&gt;</a>
);

const EdDisplay = ({children, size = 64}) => (
	<h1 className="ed-display" style={{
		fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 0.98,
		letterSpacing: '-0.02em', margin: 0, color: 'var(--ed-text)',
	}}>{children}</h1>
);

const SectionHead = ({title}) => (
	<div style={{display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18}}>
		<h2 style={{margin: 0, fontFamily: SERIF, fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em'}}>{title}</h2>
		<div style={{flex: 1, height: 1, background: 'var(--ed-rule)', marginLeft: 8}} />
	</div>
);

const TechChips = ({tech, label = null}) => (
	<div style={{marginTop: 14}}>
		{label && <div style={{fontFamily: MONO, fontSize: 11, color: 'var(--ed-dim)', marginBottom: 6}}>{label}</div>}
		<div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
			{tech.map((t, i) => (
				<span key={i} style={{
					fontSize: 11, padding: '3px 9px', background: 'var(--ed-accent-soft)', color: 'var(--ed-accent)',
					borderRadius: 999, fontFamily: MONO, letterSpacing: '0.01em',
				}}>{t}</span>
			))}
		</div>
	</div>
);

const EdWorkRow = ({item, last}) => (
	<div className="ed-work-row" style={{
		display: 'grid', gridTemplateColumns: '110px 64px 1fr', gap: 24, padding: '22px 0',
		borderTop: '1px solid var(--ed-rule)',
		borderBottom: last ? '1px solid var(--ed-rule)' : 'none',
	}}>
		<div className="ed-dates" style={{fontFamily: MONO, fontSize: 11.5, color: 'var(--ed-dim)', fontVariantNumeric: 'tabular-nums', paddingTop: 4}}>
			<div>{item.start}</div>
			<div style={{color: item.end === 'Present' ? 'var(--ed-accent)' : 'var(--ed-dim)'}}>↓</div>
			<div>{item.end}</div>
		</div>
		{/* Empty slot keeps the text aligned with rows that have a logo. */}
		{item.logo ? <div className="ed-work-logo" style={{
			width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
			background: 'var(--ed-surface)', border: '1px solid var(--ed-rule)',
			display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
		}}>
			<img src={item.logo} alt={item.company} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block'}} />
		</div> : <div className="ed-work-logo" />}
		<div className="ed-work-body">
			<div className="ed-work-title" style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
				<div style={{fontFamily: SERIF, fontSize: 22, lineHeight: 1.2}}>
					{item.title}
				</div>
				<div style={{fontSize: 12, color: 'var(--ed-dim)'}}>{item.location}</div>
			</div>
			<div className="ed-work-company" style={{fontSize: 14, color: 'var(--ed-dim)', marginTop: 2, display: 'flex', gap: 10, alignItems: 'baseline'}}>
				<span style={{color: 'var(--ed-text)'}}>{item.company}</span>
				{item.type && <>
					<span style={{width: 3, height: 3, borderRadius: '50%', background: 'var(--ed-dim)'}} />
					<span>{item.type}</span>
				</>}
			</div>
			<Prose markdown={item.description} />
			{item.tech && <TechChips tech={item.tech} />}
		</div>
	</div>
);

const EdCV = ({toggle}) => (
	<div style={{maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 56}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 22}}>
			<EdEyebrow toggle={toggle}>CV</EdEyebrow>
			<EdDisplay>
				Senior Software Engineer<br />
				<em style={{fontStyle: 'italic', color: 'var(--ed-dim)'}}>working on authorisation,</em><br />
				platforms &amp; the hidden bits.
			</EdDisplay>
			<p style={{margin: 0, maxWidth: 620, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>{CONTENT.bio[1]}</p>
			<div className="ed-stats" style={{display: 'flex', gap: 24, fontSize: 13, color: 'var(--ed-dim)', marginTop: 4}}>
				<span>years shipping software: <b style={{color: 'var(--ed-text)', fontWeight: 500}}>10+</b></span>
				<span>current side-projects: <b style={{color: 'var(--ed-text)', fontWeight: 500}}>lost count</b></span>
			</div>
		</header>

		<section>
			<SectionHead title="Work Experience" />
			<div style={{display: 'flex', flexDirection: 'column'}}>
				{CONTENT.work.map((w, i) => <EdWorkRow key={i} item={w} last={i === CONTENT.work.length - 1} />)}
			</div>
		</section>

		<section>
			<SectionHead title="Education" />
			{CONTENT.education.map((e, i) => (
				<div key={i} className="ed-education-row" style={{
					display: 'grid', gridTemplateColumns: '90px 1fr auto', padding: '18px 0', gap: 24,
					borderTop: '1px solid var(--ed-rule)',
					borderBottom: i === CONTENT.education.length - 1 ? '1px solid var(--ed-rule)' : 'none',
					alignItems: 'baseline',
				}}>
					<div className="ed-dates" style={{fontFamily: MONO, fontSize: 12, color: 'var(--ed-dim)', fontVariantNumeric: 'tabular-nums'}}>
						<div>{e.start}</div>
						<div>↓</div>
						<div>{e.end}</div>
					</div>
					<div>
						<div style={{fontFamily: SERIF, fontSize: 20, lineHeight: 1.2}}>{e.degree}</div>
						<div style={{fontSize: 13, color: 'var(--ed-dim)', marginTop: 4}}>
							{e.school} · {e.location}
						</div>
						<Prose markdown={e.description} />
					</div>
				</div>
			))}
		</section>

		<section>
			<SectionHead title="Volunteering" />
			<div style={{display: 'flex', flexDirection: 'column'}}>
				{CONTENT.volunteering.map((v, i) => <EdWorkRow key={i} item={{...v, company: v.org}} last={i === CONTENT.volunteering.length - 1} />)}
			</div>
		</section>

		<section>
			<SectionHead title="(Non-Programming) Languages" />
			{CONTENT.languages.map((l, i) => (
				<div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 0', borderTop: '1px solid var(--ed-rule)'}}>
					<div style={{fontFamily: SERIF, fontSize: 22}}>{l.name}</div>
					<div style={{fontSize: 12, color: 'var(--ed-dim)', textAlign: 'right'}}>{l.level}</div>
				</div>
			))}
		</section>
	</div>
);

const Inline = ({nodes}) => nodes.map((n, i) => (typeof n === 'string'
	? <React.Fragment key={i}>{n}</React.Fragment>
	: <em key={i} style={{fontStyle: 'italic'}}>{n.em}</em>));

const Prose = ({markdown}) => parseMarkdown(markdown).map((block, i) => (block.type === 'ul'
	? <ul key={i} style={{margin: '10px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6}}>
		{block.items.map((item, j) => <li key={j}><Inline nodes={item} /></li>)}
	</ul>
	: <p key={i} style={{margin: (i ? '10px' : '14px') + ' 0 0', fontSize: 14, lineHeight: 1.6}}>
		<Inline nodes={block.inline} />
	</p>));

const EdProjects = ({toggle}) => (
	<div style={{maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 48}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<EdEyebrow toggle={toggle}>Side Quests</EdEyebrow>
			<EdDisplay>
				Things I built<br />
				<em style={{fontStyle: 'italic', color: 'var(--ed-dim)'}}>because I wanted to.</em>
			</EdDisplay>
			<p style={{margin: 0, maxWidth: 580, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>
				A few side-projects that escaped the "weekend experiment" bin and ended up running somewhere.
			</p>
		</header>

		<div style={{display: 'flex', flexDirection: 'column', gap: 28}}>
			{CONTENT.projects.map((p, i) => (
				<article key={i} className="ed-project-card" style={{
					display: 'grid', gridTemplateColumns: '140px 1fr', gap: 28, padding: 28,
					background: 'var(--ed-surface)', border: '1px solid var(--ed-rule)', borderRadius: 16,
				}}>
					<div className="ed-project-logo" style={{
						width: 140, height: 140, borderRadius: 12, overflow: 'hidden',
						background: 'var(--ed-bg)', border: '1px solid var(--ed-rule)',
						display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
					}}>
						<img src={p.logo} alt={p.name} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block'}} />
					</div>
					<div style={{minWidth: 0}}>
						<div className="ed-project-head" style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 12px'}}>
							<h3 style={{margin: 0, fontFamily: SERIF, fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em'}}>{p.name}</h3>
							<a href={`https://${p.url}`} className="ed-project-url" style={{
								fontFamily: MONO, fontSize: 11, color: 'var(--ed-accent)',
								textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere',
							}}>↗&nbsp;{p.url}</a>
						</div>
						<div style={{fontSize: 14, color: 'var(--ed-dim)', fontStyle: 'italic', marginTop: 4}}>{p.tagline}</div>
						<Prose markdown={p.description} />
						<TechChips tech={p.tech} />
						{p.integrations && <TechChips tech={p.integrations} label="Integration with:" />}
					</div>
				</article>
			))}
		</div>
	</div>
);

const EdContact = ({toggle}) => (
	<div style={{maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 40}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<EdEyebrow toggle={toggle}>Get in touch</EdEyebrow>
			<EdDisplay>
				Where to <em style={{fontStyle: 'italic', color: 'var(--ed-accent)'}}>find me</em>.
			</EdDisplay>
			<p style={{margin: 0, maxWidth: 580, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>
				My CV and a page describing some of the projects I have worked on can be accessed from the menu.
				If you wish to contact me, you can do so either via e&#8209;mail or on LinkedIn.
			</p>
		</header>

		<div style={{display: 'flex', flexDirection: 'column', gap: 0}}>
			<ContactLinks />
		</div>
	</div>
);

const ContactLinks = () => (
	<>
		{/* Not an <a>, so the address stays out of the static HTML. */}
		<div className="ed-row ed-contact-row" style={contactRowStyle(false)}>
			<div style={contactLabelStyle}>E-mail</div>
			<div className="ed-row-value" style={{fontFamily: SERIF, fontSize: 24}}><EmailAddress>{CONTENT.email}</EmailAddress></div>
			<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
		</div>
		<a className="ed-row ed-contact-row" href={`https://${CONTENT.linkedin}`} style={contactRowStyle(false)}>
			<div style={contactLabelStyle}>LinkedIn</div>
			<div className="ed-row-value" style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.linkedin}</div>
			<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
		</a>
		<a className="ed-row ed-contact-row" href={`https://${CONTENT.github}`} style={contactRowStyle(true)}>
			<div style={contactLabelStyle}>GitHub</div>
			<div className="ed-row-value" style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.github}</div>
			<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
		</a>
	</>
);

// The rendered side of whoami.txt: who, what and where, then how to reach me.
const EdWhoami = ({toggle}) => (
	<div style={{maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 40}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<EdEyebrow toggle={toggle}>whoami</EdEyebrow>
			<EdDisplay>{CONTENT.name}</EdDisplay>
			<p style={{margin: 0, fontFamily: SERIF, fontSize: 20, fontStyle: 'italic', color: 'var(--ed-dim)'}}>{CONTENT.tagline}</p>
		</header>

		<div style={{display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620, fontSize: 16, lineHeight: 1.6}}>
			{CONTENT.bio.map((paragraph, i) => <p key={i} style={{margin: 0}}>{paragraph}</p>)}
		</div>

		<div style={{display: 'flex', flexDirection: 'column', gap: 0}}>
			<div className="ed-row" style={contactRowStyle(false)}>
				<div style={contactLabelStyle}>Role</div>
				<div className="ed-row-value" style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.role}</div>
				<div />
			</div>
			<div className="ed-row" style={contactRowStyle(false)}>
				<div style={contactLabelStyle}>Based in</div>
				<div className="ed-row-value" style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.location}</div>
				<div />
			</div>
			<ContactLinks />
		</div>
	</div>
);

const contactRowStyle = last => ({
	display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 24, padding: '24px 0',
	alignItems: 'baseline', borderTop: '1px solid var(--ed-rule)',
	borderBottom: last ? '1px solid var(--ed-rule)' : 'none',
	textDecoration: 'none', color: 'var(--ed-text)',
});
const contactLabelStyle = {
	fontFamily: MONO, fontSize: 11, color: 'var(--ed-dim)',
	letterSpacing: '0.1em', textTransform: 'uppercase',
};

const EdNotFound = ({onNavigate}) => (
	<div style={{maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18}}>
		<EdEyebrow>[404] Not Found</EdEyebrow>
		<div aria-hidden="true" className="ed-shrug" style={{fontSize: 250, lineHeight: 1}}>🤷‍♂️</div>
		<p style={{margin: 0, maxWidth: 560, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>
			The page you requested does not exist.
		</p>
		<a href="/" onClick={e => onNavigate('cv', e)} style={{
			fontFamily: MONO, fontSize: 13, color: 'var(--ed-accent)', textDecoration: 'none', marginTop: 4,
		}}>↗ back to the home page</a>
	</div>
);

export default EditorialApp;
