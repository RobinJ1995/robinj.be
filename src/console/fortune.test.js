import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';
import {CONTENT} from '../content';

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('fortune', () => {
	it('picks one at random', async () => {
		const {run} = setup();

		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(await run('fortune')).toBe('It works on my machine. Ship the machine.');
		vi.spyOn(Math, 'random').mockReturnValue(0.999);
		expect(await run('fortune')).toMatch(/^The three states of any distributed system:\n {2}1\. /);
	});

	it('tells about Robin, as the editor shows it', async () => {
		const {run} = setup();

		expect(await run('fortune --about-me')).toBe(CONTENT.bio.join('\n'));
		expect(await run('cat whoami.txt')).toContain(`$ fortune --about-me\n${CONTENT.bio.join('\n')}\n`);
	});

	it('picks short ones or long ones, the line between them movable', async () => {
		const {shell, run} = setup();

		for (let i = 0; i < 20; i++) {
			vi.spyOn(Math, 'random').mockReturnValue(i / 20);
			expect((await run('fortune -s')).length).toBeLessThanOrEqual(160);
			expect((await run('fortune -l')).length).toBeGreaterThan(160);
			expect((await run('fortune -n 40 -s')).length).toBeLessThanOrEqual(40);
		}
		expect(await run('fortune -n 1 -s')).toBe('No fortunes found');
		expect(shell.state.status).toBe(1);
	});

	it('names its cookie file with -c, and finds nothing in others', async () => {
		const {shell, run} = setup();

		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(await run('fortune -c robinj')).toBe('(robinj)\n%\nIt works on my machine. Ship the machine.');
		expect(await run('fortune -a -e all')).toBe('It works on my machine. Ship the machine.');
		expect(await run('fortune startrek')).toBe('No fortunes found');
		expect(shell.state.status).toBe(1);
		expect(await run('fortune -x')).toBe('fortune [-a | -o] [-ceils] [-n length] [[N%] file/directory/all]');
	});
});
