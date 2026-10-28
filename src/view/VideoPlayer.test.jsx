import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import VideoPlayer from './VideoPlayer';

afterEach(cleanup);

describe('video player', () => {
	it('lists its one video, which has no thumbnail', () => {
		const {container} = render(<VideoPlayer onClose={vi.fn()} />);

		expect(screen.getByRole('list', {name: 'Videos'}).children).toHaveLength(1);
		expect(screen.getByRole('button', {name: 'video.mp4'})).toBeInTheDocument();
		expect(container.querySelector('.video-player-thumbnail img')).toBeNull();
		expect(container.querySelector('iframe')).toBeNull();
	});

	it('plays the video from YouTube once it is opened', () => {
		render(<VideoPlayer onClose={vi.fn()} />);

		fireEvent.click(screen.getByRole('button', {name: 'video.mp4'}));

		const player = screen.getByTitle('Rick Astley - Never Gonna Give You Up');
		expect(player.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&fs=0');
		expect(player.getAttribute('allow')).toBe('autoplay; encrypted-media');
		expect(player.hasAttribute('allowfullscreen')).toBe(false);
		expect(screen.queryByRole('list', {name: 'Videos'})).toBeNull();
	});

	it('closes from its title bar', () => {
		const onClose = vi.fn();
		render(<VideoPlayer onClose={onClose} />);

		fireEvent.click(screen.getByRole('button', {name: 'Close the video player'}));

		expect(onClose).toHaveBeenCalled();
	});
});
