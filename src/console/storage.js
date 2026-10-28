// The few things the terminal keeps between visits. localStorage needs no
// permission; when it's blocked they last until the page is closed.
const persisted = (key, fallback) => {
	let memory = fallback;

	return {
		load: () => {
			try {
				const stored = localStorage.getItem(key);
				return stored === null ? [...fallback] : JSON.parse(stored);
			} catch {
				return [...memory];
			}
		},
		save: value => {
			memory = [...value];
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch {
				/* Storage blocked: it's kept in memory. */
			}
		},
	};
};

export const historyStore = persisted('terminal:history', []);
export const packageStore = persisted('terminal:packages', []);
