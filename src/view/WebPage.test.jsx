import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import WebPage from './WebPage';

const contentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');

afterEach(() => {
	cleanup();
	Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', contentWindow);
});

describe('web page', () => {
	it('goes elsewhere on a page in place, and to another page in a frame of its own', () => {
		const replace = vi.fn();
		Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {configurable: true, get: () => ({location: {replace}})});
		const {container, rerender} = render(<WebPage url="https://en.wikipedia.org/wiki/Linux" />);
		const frame = container.querySelector('iframe');

		rerender(<WebPage url="https://en.wikipedia.org/wiki/Linux#History" />);
		expect(container.querySelector('iframe')).toBe(frame);
		expect(frame.src).toBe('https://en.wikipedia.org/wiki/Linux');
		expect(replace).toHaveBeenCalledWith('https://en.wikipedia.org/wiki/Linux#History');
		rerender(<WebPage url="https://en.wikipedia.org/wiki/Linux#Design" />);
		expect(frame.src).toBe('https://en.wikipedia.org/wiki/Linux');
		expect(replace).toHaveBeenLastCalledWith('https://en.wikipedia.org/wiki/Linux#Design');

		rerender(<WebPage url="https://en.wikipedia.org/wiki/Unix" />);
		expect(container.querySelector('iframe')).not.toBe(frame);
		expect(container.querySelector('iframe').src).toBe('https://en.wikipedia.org/wiki/Unix');
		expect(container.querySelector('iframe').getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(replace).toHaveBeenCalledTimes(2);
	});
});
