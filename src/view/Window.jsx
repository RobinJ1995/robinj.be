import React, {useState, useRef} from 'react';

// How far a window's edges may go past the screen's sides and bottom; its top
// stays clear of the top bar.
export const OVERHANG = 20;
// The gap to the screen's edges for a window a resize of the screen moved, so
// that its own edges stay within reach.
export const MARGIN = 8;
const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
// Less than this and a press on the title bar is still just a click.
const DRAG_THRESHOLD = 3;
// What a press on the title bar of the window in front leaves to the thing pressed.
const CONTROLS = 'a, button, input, textarea, select';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// The window moved or resized as far as it may go, and no smaller than `min`.
export const fitGeometry = ({x, y, width, height}, stage, min) => {
	const fitted = {
		width: clamp(width, min.width, stage.width + 2 * OVERHANG),
		height: clamp(height, min.height, stage.height + OVERHANG),
	};

	return {
		x: clamp(x, -OVERHANG, stage.width + OVERHANG - fitted.width),
		y: clamp(y, 0, stage.height + OVERHANG - fitted.height),
		...fitted,
	};
};

// How far a window reaches into the dock's side of the screen.
export const dockOverlap = ({x, y, height}, stage, dock) => ({
	left: Math.max(0, dock.left - x),
	bottom: Math.max(0, y + height - (stage.height - dock.bottom)),
});

// A window placed somewhere, once the screen has changed size: as it was if it
// still fits, otherwise moved and shrunk to within MARGIN of the screen's sides
// and bottom, and no further onto the dock than `overlap`.
export const refitGeometry = (geometry, stage, min, dock, overlap) => {
	const fitted = fitGeometry(geometry, stage, min);
	if (['x', 'y', 'width', 'height'].every(key => fitted[key] === geometry[key])) {
		return geometry;
	}

	const left = Math.max(MARGIN, dock.left - overlap.left);
	const right = stage.width - MARGIN;
	const bottom = Math.min(stage.height - MARGIN, stage.height - dock.bottom + overlap.bottom);
	const width = clamp(geometry.width, min.width, right - left);
	const height = clamp(geometry.height, min.height, bottom);

	return {x: clamp(geometry.x, left, right - width), y: clamp(geometry.y, 0, bottom - height), width, height};
};

// Dragging the title bar (no `edges`) or the given edges by (dx, dy). Each edge
// stops at its limit, without pushing the opposite one along.
export const dragGeometry = (start, edges, dx, dy, stage, min) => {
	if (!edges) {
		return {
			...start,
			x: clamp(start.x + dx, -OVERHANG, stage.width + OVERHANG - start.width),
			y: clamp(start.y + dy, 0, stage.height + OVERHANG - start.height),
		};
	}

	const next = {...start};
	if (edges.includes('w')) {
		next.x = clamp(start.x + dx, -OVERHANG, start.x + start.width - min.width);
		next.width = start.x + start.width - next.x;
	} else if (edges.includes('e')) {
		next.width = clamp(start.width + dx, min.width, stage.width + OVERHANG - start.x);
	}
	if (edges.includes('n')) {
		next.y = clamp(start.y + dy, 0, start.y + start.height - min.height);
		next.height = start.y + start.height - next.y;
	} else if (edges.includes('s')) {
		next.height = clamp(start.height + dy, min.height, stage.height + OVERHANG - start.y);
	}

	return next;
};

export const CloseIcon = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
	</svg>
);

// libadwaita's header bar with a title. Any element marked data-titlebar moves its window.
export const TitleBar = ({title, closeLabel, onClose}) => (
	<div className="dt-headerbar" data-titlebar>
		<span />
		<div className="dt-headerbar-title">{title}</div>
		<button type="button" className="dt-close" title="Close window" aria-label={closeLabel} onClick={onClose}>
			<CloseIcon />
		</button>
	</div>
);

const isOver = (el, {clientX, clientY}) => {
	const rect = el.getBoundingClientRect();
	return clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
};

// A window on the desktop: its frame, opening and closing, raising, and moving and
// resizing while `movable`. `geometry` is where it was put, if it was; otherwise
// its default place in _Desktop.scss. `leftOut` stands it aside in Activities for
// another app.
const Window = ({ref, win, name, focused, closing, overview, leftOut, layer, fit, animate, geometry, movable, minSize, onPlace, header, onActivate, children}) => {
	// Only windows opened after hydration animate in; the prerendered ones are just there.
	const [opening] = useState(animate);
	const element = useRef(null);
	const gesture = useRef(null);
	const interactive = focused && !overview && !closing;
	const classes = ['dt-window', focused && 'is-focused', opening && 'is-opening', closing && 'is-closing', leftOut && 'is-left-out'];
	const style = {
		'--z': layer,
		...geometry && {left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, right: 'auto', bottom: 'auto'},
		...overview && fit && {transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, '--ov-scale': fit.scale},
	};

	const setRef = el => {
		element.current = el;
		if (typeof ref === 'function') {
			ref(el);
		}
	};

	const onPointerDown = e => {
		if (!movable || e.button !== 0) {
			return;
		}

		const el = element.current;
		const edges = e.target.closest('[data-resize]')?.dataset.resize;
		const bar = el.querySelector('[data-titlebar]');
		// A window behind is covered by .dt-window-activate, so where it was pressed counts.
		const onBar = !edges && bar && isOver(bar, e) && !(interactive && e.target.closest(CONTROLS));
		if (!edges && !onBar) {
			return;
		}

		e.preventDefault();
		el.setPointerCapture?.(e.pointerId);
		const stage = el.parentElement;
		gesture.current = {
			edges: edges ?? '',
			x: e.clientX,
			y: e.clientY,
			start: {x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight},
			stage: {width: stage.clientWidth, height: stage.clientHeight},
			moved: false,
		};
		if (!focused) {
			onActivate();
		}
	};

	const onPointerMove = e => {
		const now = gesture.current;
		if (!now) {
			return;
		}

		const dx = e.clientX - now.x;
		const dy = e.clientY - now.y;
		if (now.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
			now.moved = true;
			onPlace(dragGeometry(now.start, now.edges, dx, dy, now.stage, minSize));
		}
	};

	const endGesture = () => {
		gesture.current = null;
	};

	return (
		<section ref={setRef} className={classes.filter(Boolean).join(' ')} data-win={win} style={style} aria-label={name} inert={closing || leftOut}
			onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endGesture} onPointerCancel={endGesture}>
			<div className="dt-window-frame">
				{header}
				<div className="dt-window-content" inert={!interactive}>{children}</div>
			</div>
			{!interactive && (
				<button type="button" className="dt-window-activate" aria-label={`Switch to ${name}`} onClick={onActivate} />
			)}
			{movable && EDGES.map(edge => <div key={edge} className={`dt-window-resize is-${edge}`} data-resize={edge} aria-hidden="true" />)}
		</section>
	);
};

export default Window;
