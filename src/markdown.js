// Minimal Markdown subset for content descriptions: paragraphs, `- ` bullets and *emphasis*.

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

// Lines are trimmed, so content can be indented to match the surrounding code.
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

// Inline nodes -> Markdown text, emphasis markers restored.
export const inlineToText = nodes => nodes
	.map(node => (typeof node === 'string' ? node : `*${node.em}*`))
	.join('');
