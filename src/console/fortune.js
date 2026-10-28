import {CONTENT} from '../content';

// fortune, with one cookie file of its own.

const COOKIES = 'robinj';
// Up to this many characters, a fortune is a short one.
const SHORT = 160;

const FORTUNES = [
	'It works on my machine. Ship the machine.',
	'You will find the bug on the line you were sure was fine.',
	'A backup that has never been restored is a rumour.',
	'Uptime is just the time since you last did something interesting.',
	"It's not DNS.\nThere's no way it's DNS.\nIt was DNS.",
	'Somewhere, a cron job you wrote years ago is still running. It knows what you did.',
	'Today is a good day to read the logs before guessing.',
	'The quick fix you ship on Friday will outlive the architecture you planned on Monday.',
	'A TODO comment is a promise made to a stranger: your future self.',
	"If at first you don't succeed, check whether the service is actually running.",
	'Your code compiles. Do not ask it any further questions.',
	'The documentation is correct. It just describes a different version.',
	'Every temporary workaround is load-bearing by the third sprint.',
	'You will soon be asked to estimate something unknowable. Say "two weeks".',
	'Have you tried turning it off and on again? The kernel has.',
	'Your lucky numbers are 0, 1, 127, 255 and 404.',
	"The intern's regex works. Nobody knows why. Nobody will touch it.",
	'A senior engineer is someone who has broken production in more interesting ways.',
	'Read-only filesystems: for the days when nobody should be allowed to change anything.',
	'The rubber duck has heard everything and judges nothing.',
	'Commit messages are letters to the future. Yours say "fix".',
	"It's not a bug. It's an undocumented feature with a strong personality.",
	'Kubernetes: because one computer was never complicated enough.',
	'Your YAML is valid. Your indentation is lying to you.',
	'A system with one clock knows the time. A cluster with three is in a meeting about it.',
	'Caching is easy. Knowing when to stop trusting the cache is a career.',
	'The build is green. Enjoy it while it lasts.',
	'Your password must contain a capital letter, a number, a symbol and the tears of a sysadmin.',
	'The printer can sense fear.',
	"There's always one more dependency to upgrade.",
	'Today you will delete more code than you write, and it will be your best work this week.',
	"Somewhere a semicolon is missing, and it's not where the compiler says.",
	'The meeting could have been an email. The email could have been a commit.',
	'Out of memory? Try forgetting something.',
	'Every alert you silence today comes back tomorrow with friends.',
	'Weekend forecast: pager quiet, coffee strong, cluster inexplicably fine.',
	'Legacy code is software that pays the bills.',
	'A watched progress bar never reaches 100%. It reaches 99% and stays there, out of spite.',
	'Premature optimisation is bad. So is a for loop inside a for loop inside a network call.',
	'The only constant is change, and the only change is a config file nobody checked in.',
	'Production: the only environment that matters to the people using it.',
	'Q: How many sysadmins does it take to change a light bulb?\nA: None. The light bulb is managed by Ansible now, and the playbook has\n   been failing quietly since March. Nobody has noticed, because it is\n   daytime.',
	'Things a terminal on a website should never do:\n  1. Run your code.\n  2. Write to disk.\n  3. Take itself too seriously.\nThis one manages two out of three.',
	"Bug report: It doesn't work.\nSteps to reproduce: Use it.\nExpected result: It works.\nActual result: See title.\nPriority: Critical.\nAssignee: Whoever reads this first.",
	'Dear future me,\nThe function below was written in a hurry, under protest, and with the\nbest of intentions. Please be kind to it. It was all I had.\n\t\t-- a comment, somewhere in production',
	'The three states of any distributed system:\n  1. Working, for reasons nobody fully understands.\n  2. Broken, for reasons nobody fully understands.\n  3. In a post-mortem, where everybody understands everything, in hindsight.',
];

const fortune = api => {
	const args = [...api.args];
	if (args.includes('--about-me')) {
		api.out(CONTENT.bio.map(paragraph => `${paragraph}\n`).join(''));
		return 0;
	}

	let filter = () => true;
	let limit = SHORT;
	let show = false;
	const files = [];
	while (args.length) {
		const arg = args.shift();
		if (arg === '-n') {
			limit = Number(args.shift());
		} else if (/^-[sl]+$/.test(arg) || arg === '-c' || arg === '-a' || arg === '-e') {
			show ||= arg === '-c';
			if (arg.includes('s')) {
				filter = text => text.length <= limit;
			} else if (arg.includes('l')) {
				filter = text => text.length > limit;
			}
		} else if (arg.startsWith('-')) {
			api.err('fortune [-a | -o] [-ceils] [-n length] [[N%] file/directory/all]\n');
			return 1;
		} else {
			files.push(arg);
		}
	}

	const candidates = files.every(file => file === COOKIES || file === 'all') ? FORTUNES.filter(filter) : [];
	if (candidates.length === 0) {
		api.err('No fortunes found\n');
		return 1;
	}

	const text = candidates[Math.floor(Math.random() * candidates.length)];
	api.out(`${show ? `(${COOKIES})\n%\n` : ''}${text}\n`);
	return 0;
};

export const FORTUNE = {fortune};
