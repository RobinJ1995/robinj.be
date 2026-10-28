import {describe, it, expect, vi, afterEach} from 'vitest';
import {setup} from './test-helpers';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('storage', () => {
	it('keeps history in memory when localStorage is blocked', async () => {
		const blocked = () => {
			throw new Error('SecurityError');
		};
		vi.stubGlobal('localStorage', {getItem: blocked, setItem: blocked});

		await setup().run('echo remembered');
		expect(setup().shell.history).toEqual(['echo remembered']);
	});

	it('starts afresh when there is nothing stored', () => {
		vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => {}});

		expect(setup().shell.history).toEqual([]);
		expect([...setup().shell.packages]).toEqual([]);
	});
});
