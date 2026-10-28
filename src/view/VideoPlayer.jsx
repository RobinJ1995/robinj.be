import React, {useState} from 'react';
import {TitleBar} from './Window';

const VIDEO = {file: 'video.mp4', title: 'Rick Astley - Never Gonna Give You Up', youtube: 'dQw4w9WgXcQ'};

// YouTube's player, from `start` seconds in.
const embed = ({youtube, start}) => `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0&fs=0${start ? `&start=${start}` : ''}`;

const PlayIcon = () => (
	<svg viewBox="0 0 16 16" width="32" height="32" aria-hidden="true">
		<path d="M5 3.2v9.6a.8.8 0 0 0 1.2.7l7.7-4.8a.8.8 0 0 0 0-1.4L6.2 2.5a.8.8 0 0 0-1.2.7z" fill="currentColor" />
	</svg>
);

// GNOME's video player with a library of one, which plays from YouTube once opened.
// Opened on a `video` ({youtube, start, title}), it plays that one straight away.
const VideoPlayer = ({video = null, onClose}) => {
	const [playing, setPlaying] = useState(video);

	return (
		<div className="video-player">
			<TitleBar title="Video Player" closeLabel="Close the video player" onClose={onClose} />
			{playing ? (
				// fs=0 and no fullscreen allowed: the player stays in its window.
				<iframe className="video-player-screen" src={embed(playing)} title={playing.title ?? playing.youtube} allow="autoplay; encrypted-media" />
			) : (
				<ul className="video-player-library" aria-label="Videos">
					<li>
						<button type="button" className="video-player-video" onClick={() => setPlaying(VIDEO)}>
							<span className="video-player-thumbnail"><PlayIcon /></span>
							<span className="video-player-name">{VIDEO.file}</span>
						</button>
					</li>
				</ul>
			)}
		</div>
	);
};

export default VideoPlayer;
