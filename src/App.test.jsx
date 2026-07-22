import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act} from '@testing-library/react';
import App from './App';

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

	it('renders the Projects page for "/projects"', () => {
		render(<App initialPath="/projects" />);
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
			const e = new PopStateEvent('popstate', {state: {name: 'projects'}});
			window.dispatchEvent(e);
		});

		expect(screen.getByText('Sprint Retrospective')).toBeInTheDocument();
	});
});

describe('view source (requirement 3)', () => {
	it('shows highlighted source for a "/source" route', () => {
		const {container} = render(<App initialPath="/cv/source" />);
		const view = container.querySelector('.view-source');

		expect(view).not.toBeNull();
		// textContent concatenates the highlight.js token spans back into plain source.
		expect(view.textContent).toContain("import React from 'react'");
	});

	it('toggles source on and off via the view-source button', () => {
		const {container} = render(<App initialPath="/cv" />);
		expect(container.querySelector('.view-source')).toBeNull();

		fireEvent.click(screen.getByTitle('View source'));
		expect(container.querySelector('.view-source')).not.toBeNull();

		fireEvent.click(screen.getByTitle('View source'));
		expect(container.querySelector('.view-source')).toBeNull();
	});
});
