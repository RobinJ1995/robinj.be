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

describe('view source toggles between the two designs (requirement 3)', () => {
	it('renders the terminal/source design for a "/source" route', () => {
		const {container} = render(<App initialPath="/cv/source" />);

		expect(container.querySelector('.terminal')).not.toBeNull();
		expect(container.querySelector('.editorial')).toBeNull();
		// The file tabs are unique to the source view.
		expect(screen.getAllByText('projects.yml').length).toBeGreaterThan(0);
	});

	it('toggles between the editorial and terminal views via the toggle buttons', () => {
		const {container} = render(<App initialPath="/cv" />);
		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(container.querySelector('.terminal')).toBeNull();

		fireEvent.click(screen.getByTitle('View source'));
		expect(container.querySelector('.terminal')).not.toBeNull();
		expect(container.querySelector('.editorial')).toBeNull();

		fireEvent.click(screen.getByTitle('View rendered site'));
		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(container.querySelector('.terminal')).toBeNull();
	});

	it('falls back to the CV when toggling to the rendered view from whoami', () => {
		const {container} = render(<App initialPath="/whoami/source" />);
		expect(container.querySelector('.terminal')).not.toBeNull();

		fireEvent.click(screen.getByTitle('View rendered site'));

		expect(container.querySelector('.editorial')).not.toBeNull();
		expect(screen.getByText('Work Experience')).toBeInTheDocument();
	});
});
