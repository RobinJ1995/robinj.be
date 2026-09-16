import {describe, it, expect} from 'vitest';
import {parseInline, parseMarkdown} from './markdown';
import {CONTENT} from './constants';

describe('parseInline', () => {
	it('returns a plain string as a single node', () => {
		expect(parseInline('just text')).toEqual(['just text']);
	});

	it('extracts *emphasis* runs around surrounding text', () => {
		expect(parseInline('before *middle* after')).toEqual(['before ', {em: 'middle'}, ' after']);
	});

	it('handles several emphasis runs', () => {
		expect(parseInline('*a* and *b*')).toEqual([{em: 'a'}, ' and ', {em: 'b'}]);
	});
});

describe('parseMarkdown', () => {
	it('splits paragraphs on blank lines and joins wrapped lines', () => {
		const blocks = parseMarkdown('one\nstill one\n\ntwo');
		expect(blocks).toEqual([
			{type: 'p', inline: ['one still one']},
			{type: 'p', inline: ['two']},
		]);
	});

	it('parses "- " bullets into a list', () => {
		const blocks = parseMarkdown('intro:\n\n- first\n- second');
		expect(blocks[0]).toEqual({type: 'p', inline: ['intro:']});
		expect(blocks[1]).toEqual({type: 'ul', items: [['first'], ['second']]});
	});

	it('ignores indentation, so stored content can be indented to suit its code', () => {
		expect(parseMarkdown('\t\t\tone\n\t\t\ttwo')).toEqual([{type: 'p', inline: ['one two']}]);
	});
});

describe('project descriptions', () => {
	it('keeps the original prose, structure and emphasis', () => {
		const retro = parseMarkdown(CONTENT.projects.find(p => p.name === 'Sprint Retrospective').description);

		expect(retro[0].inline[0]).toMatch(/^One of those projects that started out as a throwaway experiment/);
		expect(retro[1].inline).toContainEqual({em: '"How do these new React Hooks work?"'});
		expect(retro.at(-1)).toMatchObject({type: 'ul'});
		expect(retro.at(-1).items).toHaveLength(5);
		expect(retro.at(-1).items[0]).toEqual(['React frontend']);
	});

	it('keeps every project multi-paragraph', () => {
		for (const project of CONTENT.projects) {
			expect(parseMarkdown(project.description).filter(b => b.type === 'p').length).toBeGreaterThan(1);
		}
	});
});
