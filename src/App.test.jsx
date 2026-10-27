import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act} from '@testing-library/react';
import App from './App';
import {routes, render as prerender} from './entry-server';

afterEach(cleanup);

describe('routing', () => {
	it('renders the CV (home) page for "/"', () => {
		render(<App initialPath="/" />);
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});

	it('renders the CV page for "/cv"', () => {
		render(<App initialPath="/cv" />);
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});

	it('renders the Contact page for "/contact"', () => {
		render(<App initialPath="/contact" />);
		expect(screen.getByText(/on LinkedIn/)).toBeInTheDocument();
	});

	it('renders the Side Quests page for "/side-quests"', () => {
		render(<App initialPath="/side-quests" />);
		expect(screen.getByText('Sprint Retrospective')).toBeInTheDocument();
	});

	it('falls back to the 404 page for an unknown path', () => {
		render(<App initialPath="/does-not-exist" />);
		expect(screen.getByText('The page you requested does not exist.')).toBeInTheDocument();
	});

	it('navigates on nav-link click and pushes history', () => {
		const pushSpy = vi.spyOn(window.history, 'pushState');
		render(<App initialPath="/cv" />);

		fireEvent.click(screen.getByRole('link', {name: 'Contact'}));

		expect(screen.getByText(/on LinkedIn/)).toBeInTheDocument();
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

		expect(screen.getByText('Sprint Retrospective')).toBeInTheDocument();
	});
});

describe('view source toggles between the two designs (requirement 3)', () => {
	it('renders the editor/source design for a "/source" route', () => {
		const {container} = render(<App initialPath="/cv/source" />);

		expect(container.querySelector('.editor')).not.toBeNull();
		expect(container.querySelector('.editorial')).toBeNull();
		expect(screen.getAllByText('side-quests.yml').length).toBeGreaterThan(0);
	});

	it('toggles between the editorial and editor views via the toggle buttons', () => {
		const {container} = render(<App initialPath="/cv" />);
		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(container.querySelector('.editor')).toBeNull();

		fireEvent.click(screen.getByTitle('View source'));
		expect(container.querySelector('.editor')).not.toBeNull();
		expect(container.querySelector('.editorial')).toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Run'}));
		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(container.querySelector('.editor')).toBeNull();
	});

	it('closes back to the rendered view via the window close button', () => {
		const {container} = render(<App initialPath="/side-quests/source" />);
		expect(container.querySelector('.editor')).not.toBeNull();

		fireEvent.click(screen.getByTitle('Close'));

		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(container.querySelector('.editor')).toBeNull();
		expect(screen.getByText('Sprint Retrospective')).toBeInTheDocument();
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
		const {container} = render(<App initialPath="/whoami/source" />);
		expect(container.querySelector('.editor')).not.toBeNull();

		fireEvent.click(screen.getByRole('link', {name: 'Run'}));

		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(screen.getByRole('heading', {level: 1, name: 'Robin Jacobs'})).toBeInTheDocument();
	});
});

describe('e-mail obfuscation', () => {
	it.each(routes)('keeps the address out of the prerendered HTML for %s', route => {
		const {html} = prerender(route);

		expect(html).not.toContain('robin@robinj.be');
		expect(html).not.toContain('mailto:');
	});
});
