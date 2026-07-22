import {describe, it, expect, afterEach} from 'vitest';
import {render, fireEvent, cleanup} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import EmailAddress from './EmailAddress';

afterEach(cleanup);

const EMAIL = 'robin@robinj.be';

const visibleText = link => {
	// The rendered address interleaves hidden junk spans (display:none) between the
	// real characters. Strip the hidden spans to get what a human actually sees.
	const clone = link.cloneNode(true);
	clone.querySelectorAll('span[style*="display"]').forEach(s => s.remove());
	return clone.textContent;
};

describe('EmailAddress obfuscation (requirement 4)', () => {
	it('does NOT contain the address in the static (server / first) render', () => {
		const html = renderToStaticMarkup(<EmailAddress>{EMAIL}</EmailAddress>);

		expect(html).toContain('───');
		expect(html).not.toContain(EMAIL);
		expect(html).not.toContain('mailto:');
	});

	it('reveals the address in visible-character order after mount', () => {
		const {container} = render(<EmailAddress>{EMAIL}</EmailAddress>);
		const link = container.querySelector('a');

		expect(visibleText(link)).toBe(EMAIL);
	});

	it('hides the junk spans with display:none', () => {
		const {container} = render(<EmailAddress>{EMAIL}</EmailAddress>);
		const hidden = container.querySelectorAll('a > span > span');

		expect(hidden.length).toBeGreaterThan(0);
		hidden.forEach(span => expect(span).toHaveStyle({display: 'none'}));
	});

	it('only exposes the mailto: link on hover', () => {
		const {container} = render(<EmailAddress>{EMAIL}</EmailAddress>);
		const link = container.querySelector('a');

		expect(link.getAttribute('href')).toBe('https://robinj.be/');

		fireEvent.mouseOver(link);
		expect(link.getAttribute('href')).toBe(`mailto:${EMAIL}`);
	});
});
