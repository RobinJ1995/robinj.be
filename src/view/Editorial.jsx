import React from 'react';
import {CONTENT, PAGES} from '../constants';
import EmailAddress from '../component/EmailAddress';

// Direction A — Editorial.
// Modern serif/sans editorial portfolio. Sticky sidebar nav, generous whitespace.
// Colours come from CSS custom properties (--ed-*) defined in style/App.scss and
// swapped by prefers-color-scheme, so this view is theme-aware with no JS.

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const SERIF = '"Newsreader", ui-serif, Georgia, serif';

const EditorialApp = ({page, onNavigate, onToggleView}) => (
	<div className="editorial" style={{
		background: 'var(--ed-bg)', color: 'var(--ed-text)',
		fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
		minHeight: '100%', width: '100%', display: 'flex',
		fontFeatureSettings: '"ss01", "cv01"',
	}}>
		<EdSidebar page={page} onNavigate={onNavigate} onToggleView={onToggleView} />
		<main style={{flex: 1, padding: '64px 80px 80px', overflow: 'hidden', minWidth: 0}}>
			{page === 'cv' && <EdCV />}
			{page === 'projects' && <EdProjects />}
			{page === 'contact' && <EdContact />}
			{page === '404' && <EdNotFound onNavigate={onNavigate} />}
		</main>
	</div>
);

const EdSidebar = ({page, onNavigate, onToggleView}) => (
	<aside className="ed-sidebar" style={{
		width: 320, flexShrink: 0, padding: '56px 36px 40px',
		borderRight: '1px solid var(--ed-rule)',
		position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh',
		display: 'flex', flexDirection: 'column', gap: 28,
	}}>
		<div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18}}>
			<div style={{
				width: 132, height: 132, borderRadius: '50%', overflow: 'hidden',
				boxShadow: '0 1px 0 var(--ed-faint), 0 10px 30px rgba(0,0,0,.18)',
				border: '1px solid var(--ed-rule)',
			}}>
				<img src="/img/me.webp" alt={CONTENT.name} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
			</div>
			<div>
				<div style={{fontFamily: SERIF, fontSize: 30, lineHeight: 1.04, letterSpacing: '-0.01em', fontWeight: 500}}>
					Robin<br />Jacobs
				</div>
				<div style={{marginTop: 8, fontSize: 13, color: 'var(--ed-dim)', fontStyle: 'italic', fontFamily: SERIF}}>
					Developer &amp; open-source enthusiast
				</div>
			</div>
		</div>

		<nav style={{display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4}}>
			{Object.values(PAGES).filter(p => p.menu).map(p => {
				const nums = {cv: '01', projects: '02', contact: '03'};
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
						{active && <span aria-hidden="true" style={{
							marginLeft: 'auto', width: 16, height: 1, background: 'var(--ed-accent)', alignSelf: 'center',
						}} />}
					</a>
				);
			})}
		</nav>

		<div style={{marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ed-dim)'}}>
			<a href={`/${page === 'cv' ? 'cv' : page}/source`} onClick={onToggleView}
				title="View source" className="ed-source-pill"
				style={{
					alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
					padding: '6px 12px 6px 10px', borderRadius: 999,
					border: '1px solid var(--ed-rule)', background: 'var(--ed-surface)',
					color: 'var(--ed-dim)', fontFamily: MONO, textDecoration: 'none',
					fontSize: 11, letterSpacing: '0.02em', transition: 'color .2s, border-color .2s',
				}}>
				<span style={{color: 'var(--ed-accent)', fontWeight: 600}}>&lt;/&gt;</span> view source
			</a>
			<div className="ed-contact-link">✉ <EmailAddress>{CONTENT.email}</EmailAddress></div>
			<a className="ed-contact-link" href={`https://${CONTENT.linkedin}`} style={{color: 'inherit', textDecoration: 'none'}}>↗ {CONTENT.linkedin}</a>
			<a className="ed-contact-link" href={`https://${CONTENT.github}`} style={{color: 'inherit', textDecoration: 'none'}}>↗ {CONTENT.github}</a>
			<div style={{marginTop: 14, fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase'}}>
				Based in {CONTENT.location}
			</div>
		</div>
	</aside>
);

const EdEyebrow = ({children}) => (
	<div style={{
		fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
		color: 'var(--ed-accent)', marginBottom: 18,
	}}>{children}</div>
);

const EdDisplay = ({children, size = 64}) => (
	<h1 style={{
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

const TechChips = ({tech}) => (
	<div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14}}>
		{tech.map((t, i) => (
			<span key={i} style={{
				fontSize: 11, padding: '3px 9px', background: 'var(--ed-accent-soft)', color: 'var(--ed-accent)',
				borderRadius: 999, fontFamily: MONO, letterSpacing: '0.01em',
			}}>{t}</span>
		))}
	</div>
);

const EdWorkRow = ({item, last}) => (
	<div style={{
		display: 'grid', gridTemplateColumns: '110px 64px 1fr', gap: 24, padding: '22px 0',
		borderTop: '1px solid var(--ed-rule)',
		borderBottom: last ? '1px solid var(--ed-rule)' : 'none',
	}}>
		<div style={{fontFamily: MONO, fontSize: 11.5, color: 'var(--ed-dim)', fontVariantNumeric: 'tabular-nums', paddingTop: 4}}>
			<div>{item.start}</div>
			<div style={{color: item.end === 'Present' ? 'var(--ed-accent)' : 'var(--ed-dim)'}}>↓</div>
			<div>{item.end}</div>
		</div>
		<div style={{
			width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
			background: 'var(--ed-surface)', border: '1px solid var(--ed-rule)',
			display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
		}}>
			<img src={item.logo} alt={item.company} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block'}} />
		</div>
		<div>
			<div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
				<div style={{fontFamily: SERIF, fontSize: 22, lineHeight: 1.2}}>
					{item.title}{item.promoted && <span style={{
						fontFamily: MONO, fontSize: 10, color: 'var(--ed-accent)', marginLeft: 10,
						padding: '2px 6px', border: '1px solid var(--ed-accent)', borderRadius: 999,
						letterSpacing: '0.08em', textTransform: 'uppercase', verticalAlign: 'middle',
					}}>promoted</span>}
				</div>
				<div style={{fontSize: 12, color: 'var(--ed-dim)'}}>{item.location}</div>
			</div>
			<div style={{fontSize: 14, color: 'var(--ed-dim)', marginTop: 2, display: 'flex', gap: 10, alignItems: 'baseline'}}>
				<span style={{color: 'var(--ed-text)'}}>{item.company}</span>
				<span style={{width: 3, height: 3, borderRadius: '50%', background: 'var(--ed-dim)'}} />
				<span>{item.type}</span>
			</div>
			<p style={{margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.55}}>{item.summary}</p>
			{item.bullets && (
				<ul style={{margin: '10px 0 0', paddingLeft: 16, color: 'var(--ed-dim)', fontSize: 13.5, lineHeight: 1.6}}>
					{item.bullets.map((b, i) => <li key={i}>{b}</li>)}
				</ul>
			)}
			{item.tech && <TechChips tech={item.tech} />}
		</div>
	</div>
);

const EdCV = () => (
	<div style={{maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 56}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 22}}>
			<EdEyebrow>CV</EdEyebrow>
			<EdDisplay>
				Senior Software Engineer<br />
				<em style={{fontStyle: 'italic', color: 'var(--ed-dim)'}}>working on authorisation,</em><br />
				platforms &amp; the hidden bits.
			</EdDisplay>
			<p style={{margin: 0, maxWidth: 620, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>{CONTENT.bio[1]}</p>
			<div style={{display: 'flex', gap: 24, fontSize: 13, color: 'var(--ed-dim)', marginTop: 4}}>
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
				<div key={i} style={{
					display: 'grid', gridTemplateColumns: '90px 1fr auto', padding: '18px 0', gap: 24,
					borderTop: '1px solid var(--ed-rule)',
					borderBottom: i === CONTENT.education.length - 1 ? '1px solid var(--ed-rule)' : 'none',
					alignItems: 'baseline',
				}}>
					<div style={{fontFamily: MONO, fontSize: 12, color: 'var(--ed-dim)', fontVariantNumeric: 'tabular-nums'}}>{e.start}–{e.end}</div>
					<div>
						<div style={{fontFamily: SERIF, fontSize: 20, lineHeight: 1.2}}>{e.degree}</div>
						<div style={{fontSize: 13, color: 'var(--ed-dim)', marginTop: 4}}>
							{e.school} · {e.location}{e.note ? ` — ${e.note}` : ''}
						</div>
					</div>
				</div>
			))}
		</section>

		<section style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56}}>
			<div>
				<SectionHead title="Volunteering" />
				{CONTENT.volunteering.map((v, i) => (
					<div key={i} style={{padding: '14px 0', borderTop: '1px solid var(--ed-rule)'}}>
						<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12}}>
							<div style={{fontSize: 15, fontWeight: 500}}>{v.title}</div>
							<div style={{fontFamily: MONO, fontSize: 11, color: 'var(--ed-dim)', fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>{v.start}</div>
						</div>
						<div style={{fontSize: 13, color: 'var(--ed-dim)', marginTop: 2}}>{v.org} · {v.location}</div>
						{v.note && <div style={{fontSize: 12, color: 'var(--ed-accent)', marginTop: 4, fontStyle: 'italic'}}>{v.note}</div>}
					</div>
				))}
			</div>
			<div>
				<SectionHead title="Languages" />
				{CONTENT.languages.map((l, i) => (
					<div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 0', borderTop: '1px solid var(--ed-rule)'}}>
						<div style={{fontFamily: SERIF, fontSize: 22}}>{l.name}</div>
						<div style={{fontSize: 12, color: 'var(--ed-dim)', textAlign: 'right'}}>{l.level}</div>
					</div>
				))}
			</div>
		</section>
	</div>
);

const EdProjects = () => (
	<div style={{maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 48}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<EdEyebrow>Selected work · personal</EdEyebrow>
			<EdDisplay size={56}>
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
					<div style={{
						width: 140, height: 140, borderRadius: 12, overflow: 'hidden',
						background: 'var(--ed-bg)', border: '1px solid var(--ed-rule)',
						display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
					}}>
						<img src={p.logo} alt={p.name} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block'}} />
					</div>
					<div style={{minWidth: 0}}>
						<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
							<h3 style={{margin: 0, fontFamily: SERIF, fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em'}}>{p.name}</h3>
							<a href={`https://${p.url}`} className="ed-project-url" style={{
								fontFamily: MONO, fontSize: 11, color: 'var(--ed-accent)',
								textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
							}}>↗ {p.url}</a>
						</div>
						<div style={{fontSize: 14, color: 'var(--ed-dim)', fontStyle: 'italic', marginTop: 4}}>{p.tagline}</div>
						<p style={{margin: '14px 0 0', fontSize: 14, lineHeight: 1.6}}>{p.blurb}</p>
						<TechChips tech={p.tech} />
					</div>
				</article>
			))}
		</div>
	</div>
);

const EdContact = () => (
	<div style={{maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 40}}>
		<header style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<EdEyebrow>Get in touch</EdEyebrow>
			<EdDisplay>
				Where to <em style={{fontStyle: 'italic', color: 'var(--ed-accent)'}}>find me</em>.
			</EdDisplay>
			<p style={{margin: 0, maxWidth: 580, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>
				My CV and a page describing some of the projects I have worked on can be accessed from the menu.
				If you wish to contact me, you can do so either via e&#8209;mail or on LinkedIn.
			</p>
		</header>

		<div style={{display: 'flex', flexDirection: 'column', gap: 0}}>
			{/* E-mail row is a plain container (not an <a>) so the address stays out
			    of the static HTML — EmailAddress reveals it after mount. */}
			<div className="ed-contact-row" style={contactRowStyle(false)}>
				<div style={contactLabelStyle}>E-mail</div>
				<div style={{fontFamily: SERIF, fontSize: 24}}><EmailAddress>{CONTENT.email}</EmailAddress></div>
				<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
			</div>
			<a className="ed-contact-row" href={`https://${CONTENT.linkedin}`} style={contactRowStyle(false)}>
				<div style={contactLabelStyle}>LinkedIn</div>
				<div style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.linkedin}</div>
				<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
			</a>
			<a className="ed-contact-row" href={`https://${CONTENT.github}`} style={contactRowStyle(true)}>
				<div style={contactLabelStyle}>GitHub</div>
				<div style={{fontFamily: SERIF, fontSize: 24}}>{CONTENT.github}</div>
				<div style={{color: 'var(--ed-accent)', fontSize: 14}}>↗</div>
			</a>
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
		<EdEyebrow>Error 404</EdEyebrow>
		<EdDisplay>
			This page <em style={{fontStyle: 'italic', color: 'var(--ed-dim)'}}>wandered off</em>.
		</EdDisplay>
		<p style={{margin: 0, maxWidth: 560, fontSize: 16, lineHeight: 1.55, color: 'var(--ed-dim)'}}>
			The page you requested does not exist.
		</p>
		<a href="/" onClick={e => onNavigate('cv', e)} style={{
			fontFamily: MONO, fontSize: 13, color: 'var(--ed-accent)', textDecoration: 'none', marginTop: 4,
		}}>↗ back to the home page</a>
	</div>
);

export default EditorialApp;
