import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup, fireEvent, within} from '@testing-library/react';
import EditorialApp, {EditorialPrint} from './Editorial';

afterEach(cleanup);

const MENU_SENTENCE = /accessed from the menu/;
const CONTACT_SENTENCE = /If you wish to contact me/;

const navs = container => [...container.querySelectorAll('nav.ed-nav')];
const links = nav => [...nav.querySelectorAll('a')];
// Text as shown: without the decoys hidden in the e-mail address, which differ each time.
const shownText = el => {
	const copy = el.cloneNode(true);
	copy.querySelectorAll('[style*="display: none"]').forEach(hidden => hidden.remove());
	return copy.textContent;
};

describe('the website', () => {
	it('goes to each page in the menu by its own URL', () => {
		const onNavigate = vi.fn((name, e) => e.preventDefault());
		const {container} = render(<EditorialApp page="cv" onNavigate={onNavigate} onToggleView={vi.fn()} />);
		const [nav] = navs(container);

		expect(links(nav).map(a => a.getAttribute('href'))).toEqual(['/cv', '/side-quests', '/contact']);
		fireEvent.click(within(nav).getByRole('link', {name: 'Side Quests'}));
		expect(onNavigate).toHaveBeenCalledWith('side-quests', expect.anything());
	});

	it('points to the menu on Contact', () => {
		const {container} = render(<EditorialApp page="contact" onNavigate={vi.fn()} onToggleView={vi.fn()} />);

		expect(container).toHaveTextContent(MENU_SENTENCE);
		expect(container).toHaveTextContent(CONTACT_SENTENCE);
	});
});

describe('the printout', () => {
	const print = () => render(<EditorialPrint onNavigate={vi.fn()} onToggleView={vi.fn()} />);

	it('has every page in the menu, in its order, and nothing else', () => {
		const {container} = print();

		expect(container.textContent).toMatch(/Work Experience[\s\S]*Things I built[\s\S]*Where to find me/);
		expect(container).not.toHaveTextContent(/Page not found|whoami/i);
	});

	it('has each page as the website has it', () => {
		const {container} = print();
		const sections = [...container.querySelectorAll('.ed-print-section')];

		expect(sections).toHaveLength(3);
		['cv', 'side-quests', 'contact'].forEach((page, i) => {
			const {container: website} = render(<EditorialApp page={page} onNavigate={vi.fn()} onToggleView={vi.fn()} />);
			expect(shownText(sections[i])).toBe(shownText(website));
		});
	});

	it('puts the nav above each page, with that page selected', () => {
		const {container} = print();

		expect(navs(container).map(nav => nav.querySelector('[aria-current="page"]').getAttribute('aria-label')))
			.toEqual(['CV', 'Side Quests', 'Contact']);
	});

	it('has its nav jump within the printout rather than go to the website', () => {
		const onNavigate = vi.fn();
		const {container} = render(<EditorialPrint onNavigate={onNavigate} onToggleView={vi.fn()} />);

		for (const nav of navs(container)) {
			const targets = links(nav).map(a => container.querySelector(a.getAttribute('href')));
			expect(targets.map(t => t?.textContent)).toEqual([
				expect.stringContaining('Work Experience'),
				expect.stringContaining('Things I built'),
				expect.stringContaining('Where to find me'),
			]);
			links(nav).forEach(a => fireEvent.click(a));
		}
		expect(onNavigate).not.toHaveBeenCalled();
	});
});
