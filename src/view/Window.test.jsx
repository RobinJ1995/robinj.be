import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import Window, {TitleBar, fitGeometry, dragGeometry, refitGeometry, dockOverlap, OVERHANG} from './Window';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const STAGE = {width: 1000, height: 700};
const MIN = {width: 360, height: 294};
const START = {x: 100, y: 50, width: 500, height: 400};

describe('fitting a window', () => {
	it('leaves one that fits as it is', () => {
		expect(fitGeometry(START, STAGE, MIN)).toEqual(START);
	});

	it('lets its edges go just past the screen\'s, but not over the top bar', () => {
		expect(fitGeometry({...START, x: -500, y: -500}, STAGE, MIN)).toMatchObject({x: -OVERHANG, y: 0});
		expect(fitGeometry({...START, x: 2000, y: 2000}, STAGE, MIN)).toMatchObject({x: 1000 + OVERHANG - 500, y: 700 + OVERHANG - 400});
	});

	it('keeps it between its smallest size and the stage\'s, plus the overhang either side', () => {
		expect(fitGeometry({x: 0, y: 0, width: 10, height: 10}, STAGE, MIN)).toMatchObject({width: 360, height: 294});
		expect(fitGeometry({x: 0, y: 0, width: 5000, height: 5000}, STAGE, MIN)).toEqual({x: -OVERHANG, y: 0, width: 1040, height: 720});
	});
});

describe('dragging a window', () => {
	it('moves it by its title bar, as far as the overhang allows', () => {
		expect(dragGeometry(START, '', 30, -20, STAGE, MIN)).toEqual({...START, x: 130, y: 30});
		expect(dragGeometry(START, '', -1000, -1000, STAGE, MIN)).toEqual({...START, x: -OVERHANG, y: 0});
		expect(dragGeometry(START, '', 1000, 1000, STAGE, MIN)).toEqual({...START, x: 520, y: 320});
	});

	it('resizes it from its right and bottom edges, keeping the rest in place', () => {
		expect(dragGeometry(START, 'e', 50, 999, STAGE, MIN)).toEqual({...START, width: 550});
		expect(dragGeometry(START, 's', 999, 50, STAGE, MIN)).toEqual({...START, height: 450});
		expect(dragGeometry(START, 'se', 1000, 1000, STAGE, MIN)).toEqual({...START, width: 920, height: 670});
	});

	it('resizes it from its left and top edges, keeping the opposite ones in place', () => {
		expect(dragGeometry(START, 'w', -50, 0, STAGE, MIN)).toEqual({...START, x: 50, width: 550});
		expect(dragGeometry(START, 'n', 0, 30, STAGE, MIN)).toEqual({...START, y: 80, height: 370});
		expect(dragGeometry(START, 'nw', -1000, -1000, STAGE, MIN)).toEqual({x: -OVERHANG, y: 0, width: 620, height: 450});
	});

	it('stops at the smallest size, from whichever side', () => {
		expect(dragGeometry(START, 'ne', -1000, 1000, STAGE, MIN)).toEqual({x: 100, y: 156, width: 360, height: 294});
		expect(dragGeometry(START, 'sw', 1000, -1000, STAGE, MIN)).toEqual({x: 240, y: 50, width: 360, height: 294});
	});
});

describe('refitting a window to a resized screen', () => {
	const SCREEN = {width: 900, height: 600};
	const LEFT_DOCK = {left: 88, bottom: 0};
	const NONE = {left: 0, bottom: 0};

	it('leaves one that still fits as it was', () => {
		expect(refitGeometry(START, SCREEN, MIN, LEFT_DOCK, NONE)).toBe(START);
	});

	it('moves and shrinks one that doesn\'t to within 8px of the screen\'s sides and bottom', () => {
		expect(refitGeometry({x: 500, y: 300, width: 1000, height: 700}, SCREEN, MIN, NONE, NONE)).toEqual({x: 8, y: 0, width: 884, height: 592});
	});

	it('keeps it as far off the dock as it was', () => {
		const wide = {x: 400, y: 0, width: 880, height: 400};

		expect(refitGeometry(wide, SCREEN, MIN, LEFT_DOCK, NONE)).toEqual({x: 88, y: 0, width: 804, height: 400});
		expect(refitGeometry(wide, SCREEN, MIN, LEFT_DOCK, {left: 50, bottom: 0})).toEqual({x: 38, y: 0, width: 854, height: 400});
		expect(refitGeometry({x: 100, y: 300, width: 500, height: 500}, {width: 900, height: 700}, MIN, {left: 0, bottom: 88}, NONE))
			.toEqual({x: 100, y: 112, width: 500, height: 500});
	});

	it('measures how far a window reaches onto the dock\'s side of the screen', () => {
		expect(dockOverlap({x: 38, y: 0, height: 400}, STAGE, LEFT_DOCK)).toEqual({left: 50, bottom: 0});
		expect(dockOverlap({x: 100, y: 500, height: 250}, STAGE, {left: 0, bottom: 88})).toEqual({left: 0, bottom: 138});
	});
});

describe('the title bar', () => {
	it('names the window and closes it', () => {
		const onClose = vi.fn();
		const {container} = render(<TitleBar title="Video Player" closeLabel="Close the video player" onClose={onClose} />);

		expect(container.querySelector('[data-titlebar] .dt-headerbar-title')).toHaveTextContent('Video Player');
		fireEvent.click(screen.getByRole('button', {name: 'Close the video player'}));
		expect(onClose).toHaveBeenCalled();
	});
});

// jsdom lays nothing out: the window sits at START on STAGE, its title bar along its top.
const laidOut = () => {
	const sizes = {offsetLeft: START.x, offsetTop: START.y, offsetWidth: START.width, offsetHeight: START.height, clientWidth: STAGE.width, clientHeight: STAGE.height};
	for (const [name, value] of Object.entries(sizes)) {
		vi.spyOn(HTMLElement.prototype, name, 'get').mockReturnValue(value);
	}
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
		return this.matches('[data-titlebar]') ? {left: 100, right: 600, top: 82, bottom: 128} : {left: 0, right: 0, top: 0, bottom: 0};
	});
};

const desktopWindow = (props = {}) => {
	const handlers = {onPlace: vi.fn(), onActivate: vi.fn()};
	const {container} = render(
		<div>
			<Window win="video" name="Video Player" focused layer={1} movable minSize={MIN} {...handlers} {...props}>
				<TitleBar title="Video Player" closeLabel="Close" onClose={() => {}} />
			</Window>
		</div>,
	);
	return {...handlers, section: container.querySelector('.dt-window'), bar: container.querySelector('[data-titlebar]')};
};

describe('a desktop window', () => {
	it('moves when its title bar is dragged, but not for a mere click', () => {
		laidOut();
		const {section, bar, onPlace} = desktopWindow();

		fireEvent.pointerDown(bar, {clientX: 200, clientY: 100});
		fireEvent.pointerMove(section, {clientX: 202, clientY: 101});
		expect(onPlace).not.toHaveBeenCalled();
		fireEvent.pointerMove(section, {clientX: 240, clientY: 90});
		expect(onPlace).toHaveBeenLastCalledWith({...START, x: 140, y: 40});
		fireEvent.pointerUp(section);

		fireEvent.pointerMove(section, {clientX: 400, clientY: 300});
		expect(onPlace).toHaveBeenCalledTimes(1);
	});

	it('leaves the title bar\'s buttons, and other mouse buttons, alone', () => {
		laidOut();
		const {section, bar, onPlace} = desktopWindow();

		fireEvent.pointerDown(bar.querySelector('button'), {clientX: 580, clientY: 100});
		fireEvent.pointerMove(section, {clientX: 600, clientY: 200});
		fireEvent.pointerDown(bar, {clientX: 200, clientY: 100, button: 2});
		fireEvent.pointerMove(section, {clientX: 300, clientY: 200});
		fireEvent.pointerDown(section.querySelector('.dt-window-content'), {clientX: 200, clientY: 300});
		fireEvent.pointerMove(section, {clientX: 300, clientY: 400});

		expect(onPlace).not.toHaveBeenCalled();
	});

	it('resizes from its edges', () => {
		laidOut();
		const {section, onPlace} = desktopWindow();

		fireEvent.pointerDown(section.querySelector('[data-resize="sw"]'), {clientX: 100, clientY: 450});
		fireEvent.pointerMove(section, {clientX: 80, clientY: 500});
		fireEvent.pointerCancel(section);

		expect(onPlace).toHaveBeenLastCalledWith({x: 80, y: 50, width: 520, height: 450});
	});

	it('comes to the front when dragged from behind, the title bar being under the cover that raises it', () => {
		laidOut();
		const {section, onPlace, onActivate} = desktopWindow({focused: false});

		fireEvent.pointerDown(section.querySelector('.dt-window-activate'), {clientX: 200, clientY: 100});
		fireEvent.pointerMove(section, {clientX: 250, clientY: 100});

		expect(onActivate).toHaveBeenCalled();
		expect(onPlace).toHaveBeenLastCalledWith({...START, x: 150});
	});

	it('stays where it is, with nothing to resize it by, unless it may move', () => {
		laidOut();
		const {section, bar, onPlace} = desktopWindow({movable: false});

		fireEvent.pointerDown(bar, {clientX: 200, clientY: 100});
		fireEvent.pointerMove(section, {clientX: 300, clientY: 200});

		expect(onPlace).not.toHaveBeenCalled();
		expect(section.querySelector('[data-resize]')).toBeNull();
	});

	it('sits where it was put, in place of its default place', () => {
		const {section} = desktopWindow({geometry: {x: 10, y: 20, width: 400, height: 300}});

		expect(section.style).toMatchObject({left: '10px', top: '20px', width: '400px', height: '300px', right: 'auto', bottom: 'auto'});
	});
});
