import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, within, fireEvent, cleanup, act} from '@testing-library/react';
import App from './App';
import {routes, render as prerender} from './entry-server';

afterEach(cleanup);

// Every open window is on screen; these look at the one in front.
const frontWindow = () => document.querySelector('.dt-window.is-focused');
const front = () => within(frontWindow());
const inFront = () => frontWindow()?.getAttribute('aria-label');

describe('routing', () => {
	it('renders the CV (home) page for "/"', () => {
		render(<App initialPath="/" />);
		expect(front().getByText('Work Experience')).toBeInTheDocument();
	});

	it('renders the CV page for "/cv"', () => {
		render(<App initialPath="/cv" />);
		expect(front().getByText('Work Experience')).toBeInTheDocument();
	});

	it('renders the Contact page for "/contact"', () => {
		render(<App initialPath="/contact" />);
		expect(front().getByText(/on LinkedIn/)).toBeInTheDocument();
	});

	it('renders the Side Quests page for "/side-quests"', () => {
		render(<App initialPath="/side-quests" />);
		expect(front().getByText('Sprint Retrospective')).toBeInTheDocument();
	});

	it('falls back to the 404 page for an unknown path', () => {
		render(<App initialPath="/does-not-exist" />);
		expect(screen.getByText('The page you requested does not exist.')).toBeInTheDocument();
	});

	it('leads from the 404 page back home', () => {
		render(<App initialPath="/does-not-exist" />);

		fireEvent.click(screen.getByRole('link', {name: '↗ back to the home page'}));

		expect(front().getByText('Work Experience')).toBeInTheDocument();
	});

	it('starts each page at its top, whichever part of the website scrolls', () => {
		const scrollTo = vi.fn();
		Element.prototype.scrollTo = scrollTo;
		render(<App initialPath="/cv" />);
		scrollTo.mockClear();

		fireEvent.click(screen.getByRole('link', {name: 'Contact'}));

		const scrolled = scrollTo.mock.contexts.map(el => el.className);
		expect(scrolled).toEqual(expect.arrayContaining(['editorial', 'ed-main']));
		expect(scrollTo).toHaveBeenCalledWith(0, 0);
		delete Element.prototype.scrollTo;
	});

	it('navigates on nav-link click and pushes history', () => {
		const pushSpy = vi.spyOn(window.history, 'pushState');
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('link', {name: 'Contact'}));

		expect(front().getByText(/on LinkedIn/)).toBeInTheDocument();
		expect(pushSpy).toHaveBeenCalledWith(
			expect.objectContaining({name: 'contact'}),
			expect.anything(),
			'/contact',
		);
		pushSpy.mockRestore();
	});

	it('responds to popstate (back/forward) without a full reload', () => {
		render(<App initialPath="/cv" />);

		act(() => {
			const e = new PopStateEvent('popstate', {state: {name: 'side-quests'}});
			window.dispatchEvent(e);
		});

		expect(front().getByText('Sprint Retrospective')).toBeInTheDocument();
	});
});

describe('view source toggles between the two designs (requirement 3)', () => {
	it('renders the editor/source design for a "/source" route', () => {
		render(<App initialPath="/cv/source" />);

		expect(inFront()).toBe('Editor');
		expect(front().getAllByText('side-quests.yml').length).toBeGreaterThan(0);
	});

	it('toggles between the editorial and editor views via the toggle buttons', () => {
		render(<App initialPath="/cv" />);
		expect(inFront()).toBe('Website');

		fireEvent.click(screen.getByTitle('View source'));
		expect(inFront()).toBe('Editor');

		fireEvent.click(screen.getByRole('link', {name: 'Run'}));
		expect(inFront()).toBe('Website');
	});

	it('closes back to the rendered view via the window close button', () => {
		render(<App initialPath="/side-quests/source" />);
		expect(inFront()).toBe('Editor');

		fireEvent.click(screen.getByTitle('Close'));

		expect(inFront()).toBe('Website');
		expect(front().getByText('Sprint Retrospective')).toBeInTheDocument();
	});

	it('opens an editor tab per file viewed, and closes them', () => {
		const pushSpy = vi.spyOn(window.history, 'pushState');
		const {container} = render(<App initialPath="/cv/source" />);
		const tabs = () => [...container.querySelectorAll('.editor-tab a')].map(a => a.textContent.trim());
		expect(tabs()).toEqual(['Mcv.md']);

		fireEvent.click(screen.getAllByRole('link', {name: 'contact.yml'})[0]);
		expect(tabs()).toEqual(['Mcv.md', 'Ycontact.yml']);
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/contact/source');

		fireEvent.click(screen.getByRole('button', {name: 'Close contact.yml'}));
		expect(tabs()).toEqual(['Mcv.md']);
		expect(pushSpy).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), '/cv/source');

		fireEvent.click(screen.getByRole('button', {name: 'Close cv.md'}));
		expect(tabs()).toEqual([]);
		expect(screen.getByText('No open files')).toBeInTheDocument();
		pushSpy.mockRestore();
	});

	it('toggles from whoami\'s source to its rendered page', () => {
		render(<App initialPath="/whoami/source" />);
		expect(inFront()).toBe('Editor');

		fireEvent.click(screen.getByRole('link', {name: 'Run'}));

		expect(inFront()).toBe('Website');
		expect(front().getByRole('heading', {level: 1, name: 'Robin Jacobs'})).toBeInTheDocument();
	});
});

describe('e-mail obfuscation', () => {
	it.each(routes)('keeps the address out of the prerendered HTML for %s', route => {
		const {html} = prerender(route);

		expect(html).not.toContain('robin@robinj.be');
		expect(html).not.toContain('mailto:');
	});
});
