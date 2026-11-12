// Descriptions are Markdown (see src/markdown.js).
export default [
	{
		name: 'Verzoekjes',
		tagline: 'Song requests for DJs, straight from the crowd\'s phones.',
		url: 'verzoekjes.online',
		logo: '/img/project/verzoekjes.webp',
		description: `Guests scan a QR code, search the DJ's music library and send in a request,
			which shows up on the DJ's screen in real time. No app to install, no account to
			make, and nobody leaning over the booth anymore.

			The DJ's library comes in from a scan of their music folder, and a small desktop
			client in the system tray keeps it in step with what VirtualDJ or Mixxx plays and
			the lists it keeps, so the crowd only ever gets to request what the DJ actually has.

			The project consists of:

			- React + TypeScript frontend
			- Node.js API server, on MariaDB
			- WebSocket server, running on Bun and fed through Redis Pub/Sub
			- .NET + Avalonia desktop client
			- Astro marketing site
			- Acceptance and end-to-end tests over the whole stack, with behave and Playwright`,
		tech: ['React', 'TypeScript', 'Node.js', 'Bun', 'MariaDB', 'Redis', '.NET', 'Avalonia', 'Astro', 'Docker', 'Kubernetes'],
		integrations: ['VirtualDJ', 'Mixxx', 'Spotify'],
	},
	{
		name: 'Sprint Retrospective',
		tagline: 'Real-time sprint retrospective tool.',
		url: 'sprintretro.app',
		logo: '/img/project/sprintretrospective.webp',
		description: `One of those projects that started out as a throwaway experiment to play with some
			different technologies, and happened to turn into something useful.

			*"How do these new React Hooks work?"* turned into *"Let's hook this up to an
			API and a database... I wonder what MongoDB is like?"* and quickly became a full
			Kubernetes cluster with each component of the application running in Docker containers
			that are auto-scaling and load balanced across several Kubernetes nodes.

			The project currently consists of:

			- React frontend
			- Node.js API server
			- Node.js websocket server
			- MongoDB, as the database
			- Redis, for storage of temporary data such as active participants, and real-time streaming of activity on a retrospective through the use of Redis Pub/Sub`,
		tech: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'Redis', 'Docker', 'Kubernetes'],
	},
	{
		name: 'DistroHopper',
		tagline: 'Linux desktop-themed Android home screen replacement.',
		url: 'play.google.com/store/apps/details?id=be.robinj.distrohopper',
		logo: '/img/project/distrohopper.webp',
		description: `Custom home screen replacement for Android with themes resembling various Linux
			distributions as well as a search feature with support for several (internal and
			external) search sources.

			This is a spare-time project I started when I was in high school, which I am still
			working on based on feedback users leave on the Google Play Store, or on the Github
			repository. The codebase has however seen a couple of rewrites in the meantime.`,
		tech: ['Java', 'Kotlin', 'Android SDK'],
	},
	{
		name: 'SINControl',
		tagline: 'Control panel for Debian-based webhosting services, built for student organisation.',
		url: 'github.com/RobinJ1995/penguinControl',
		logo: '/img/project/sincontrol.svg',
		description: `Control panel for both users and administrators of a Debian server.

			Ability to manage system users, Apache vHosts, FTP-accounts, e-mail addresses and
			forwards, run system maintenance tasks, …

			This was built during my time volunteering for the Student Information Network (SIN)
			organisation at Thomas More University of Applied Sciences.`,
		tech: ['PHP', 'Laravel', 'MariaDB'],
		integrations: ['Apache', 'ProFTPD', 'Postfix', 'MariaDB', 'Linux NSS', 'Gitlab', 'ownCloud', 'Cron'],
	},
];
