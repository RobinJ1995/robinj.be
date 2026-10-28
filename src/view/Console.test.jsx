import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup, act, waitFor} from '@testing-library/react';
import Console from './Console';

const session = vi.hoisted(() => ({startSession: vi.fn()}));
vi.mock('../console/session', () => session);

afterEach(() => {
	cleanup();
	session.startSession.mockReset();
});

const handle = () => ({focus: vi.fn(), stop: vi.fn()});

const terminal = (props = {}) => render(<Console focused={false} system={{}} onClose={vi.fn()} onOpenFile={vi.fn()} {...props} />);

describe('terminal window', () => {
	it('starts a session on its screen, and stops it when closed', async () => {
		const started = handle();
		session.startSession.mockReturnValue(started);
		const {container, unmount} = terminal();

		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		expect(session.startSession.mock.calls[0][0].element).toBe(container.querySelector('.console-screen'));

		unmount();
		expect(started.stop).toHaveBeenCalled();
	});

	it('focuses the session whenever the window is focused', async () => {
		const started = handle();
		session.startSession.mockReturnValue(started);
		const {rerender} = terminal();
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());

		rerender(<Console focused system={{}} onClose={vi.fn()} onOpenFile={vi.fn()} />);

		expect(started.focus).toHaveBeenCalled();
	});

	it('shows the working directory in its title as the shell moves', async () => {
		session.startSession.mockReturnValue(handle());
		terminal();
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		expect(screen.getByText(/: ~\/portfolio$/)).toBeInTheDocument();

		act(() => session.startSession.mock.calls[0][0].onCwd('/etc'));

		expect(screen.getByText(/: \/etc$/)).toBeInTheDocument();
	});

	it('passes the shell\'s exit and opened files on to the desktop, as they are when it happens', async () => {
		session.startSession.mockReturnValue(handle());
		const first = {onClose: vi.fn(), onOpenFile: vi.fn()};
		const latest = {onClose: vi.fn(), onOpenFile: vi.fn()};
		const {rerender} = terminal(first);
		await waitFor(() => expect(session.startSession).toHaveBeenCalled());
		rerender(<Console focused={false} system={{}} {...latest} />);

		const {onExit, onOpenFile} = session.startSession.mock.calls[0][0];
		onExit();
		onOpenFile('cv');

		expect(latest.onClose).toHaveBeenCalled();
		expect(latest.onOpenFile).toHaveBeenCalledWith('cv');
		expect(first.onClose).not.toHaveBeenCalled();
	});

	it('closes from its header bar', () => {
		session.startSession.mockReturnValue(handle());
		const onClose = vi.fn();
		terminal({onClose});

		fireEvent.click(screen.getByRole('button', {name: 'Close the terminal'}));

		expect(onClose).toHaveBeenCalled();
	});

	it('says so when the terminal can\'t be loaded', async () => {
		session.startSession.mockImplementation(() => {
			throw new Error('chunk failed to load');
		});
		terminal();

		expect(await screen.findByText('The terminal couldn\'t be loaded.')).toBeInTheDocument();
	});
});
