// A deliberately small Markdown subset, just enough for the project
// descriptions: blank-line-separated paragraphs, `- ` bullets and *emphasis*.
//
// Content is stored in its richest form (Markdown) and each view derives what
// it needs: the rendered site parses this into elements, the source view prints
// the original text verbatim. Flattening is lossy, so it only ever happens at
// render time — never in the stored content.

// A line of text -> inline nodes: plain strings and {em} runs.
export const parseInline = text => {
	const nodes = [];
	const emphasis = /\*([^*]+)\*/g;
	let last = 0;
	let match;

	while ((match = emphasis.exec(text)) !== null) {
		if (match.index > last) {
			nodes.push(text.slice(last, match.index));
		}
		nodes.push({em: match[1]});
		last = match.index + match[0].length;
	}

	if (last < text.length) {
		nodes.push(text.slice(last));
	}

	return nodes;
};

// Lines are trimmed, so the source string may be indented to suit its
// surrounding code without that indentation leaking into the content.
const parseBlock = block => {
	const out = [];
	let paragraph = [];
	let items = [];

	const flushParagraph = () => {
		if (paragraph.length) {
			out.push({type: 'p', inline: parseInline(paragraph.join(' '))});
			paragraph = [];
		}
	};
	const flushList = () => {
		if (items.length) {
			out.push({type: 'ul', items: items.map(parseInline)});
			items = [];
		}
	};

	for (const line of block.split('\n').map(l => l.trim()).filter(Boolean)) {
		if (line.startsWith('- ')) {
			flushParagraph();
			items.push(line.slice(2));
		} else {
			flushList();
			paragraph.push(line);
		}
	}

	flushParagraph();
	flushList();

	return out;
};

// Markdown -> blocks: {type:'p', inline} | {type:'ul', items:[inline]}
export const parseMarkdown = markdown => String(markdown)
	.trim()
	.split(/\n\s*\n/)
	.flatMap(parseBlock);

// Inline nodes -> their Markdown text, emphasis markers restored. Lets the
// source view print a parsed block exactly as it was written.
export const inlineToText = nodes => nodes
	.map(node => (typeof node === 'string' ? node : `*${node.em}*`))
	.join('');
