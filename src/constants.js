import Contact from './page/Contact';
import Projects from './page/Projects';
import CV from './page/CV';
import PAGE_SOURCES from './generated/page-source.json';
import NotFound from './page/NotFound';

export const PAGES = Object.freeze(Object.fromEntries(Object.entries({
	'Contact': {
		name: 'contact',
		url: '/contact',
		title: 'Contact',
		content: Contact,
		menu: true
	},
	'CV': {
		name: 'cv',
		url: '/cv',
		title: 'CV',
		content: CV,
		home: true,
		menu: true
	},
	'Projects': {
		name: 'projects',
		url: '/projects',
		title: 'Projects',
		content: Projects,
		menu: true
	},
	'NotFound': {
		name: '404',
		url: '/404',
		title: '[404] Not Found',
		content: NotFound,
		'404': true,
		menu: false
	},
}).map(([key, values]) => [key, { ...values, source: PAGE_SOURCES[key] }])));

export const TECHNOLOGIES = Object.freeze({
	JAVA: {
		title: 'Java'
	},
	ANDROID_SDK: {
		title: 'Android SDK',
		link: 'https://developer.android.com/docs'
	},
	PHP: {
		title: 'PHP',
		link: 'https://www.php.net/'
	},
	LARAVEL: {
		title: 'Laravel',
		link: 'https://laravel.com/'
	},
	WORDPRESS: {
		title: 'WordPress',
		link: 'https://wordpress.org/'
	},
	WOOCOMMERCE: {
		title: 'WooCommerce',
		link: 'https://woocommerce.com/'
	},
	CODEIGNITER: {
		title: 'CodeIgniter',
		link: 'https://codeigniter.com/'
	},
	JQUERY: {
		title: 'jQuery',
		link: 'https://jquery.com/'
	},
	REACT: {
		title: 'React',
		link: 'https://reactjs.org/'
	},
	MARIADB: {
		title: 'MariaDB',
		link: 'https://mariadb.org/'
	},
	MONGODB: {
		title: 'MongoDB',
		link: 'https://www.mongodb.com/'
	},
	DYNAMODB: {
		title: 'DynamoDB',
		link: 'https://aws.amazon.com/dynamodb/'
	},
	S3: {
		title: 'S3',
		link: 'https://aws.amazon.com/s3/'
	},
	NODE_JS: {
		title: 'Node.js',
		link: 'https://nodejs.org/'
	},
	TYPESCRIPT: {
		title: 'TypeScript',
		link: 'https://www.typescriptlang.org/'
	},
	EXPRESS_JS: {
		title: 'Express.js',
		link: 'https://expressjs.com/'
	},
	PYTHON: {
		title: 'Python',
		link: 'https://www.python.org/'
	},
	APACHE: {
		title: 'Apache',
		link: 'https://httpd.apache.org/'
	},
	PROFTPD: {
		title: 'ProFTPD',
		link: 'http://www.proftpd.org/'
	},
	POSTFIX: {
		title: 'Postfix',
		link: 'http://www.postfix.org/'
	},
	OWNCLOUD: {
		title: 'ownCloud',
		link: 'https://owncloud.org/'
	},
	DOCKER: {
		title: 'Docker',
		link: 'https://www.docker.com/'
	},
	KUBERNETES: {
		title: 'Kubernetes',
		link: 'https://kubernetes.io/'
	},
	CRON: {
		title: 'Cron'
	},
	DEBIAN: {
		title: 'Debian',
		link: 'https://www.debian.org/'
	},
	CENTOS: {
		title: 'CentOS',
		link: 'https://www.centos.org/'
	},
	VERTX: {
		title: 'Vert.x',
		link: 'https://vertx.io/'
	},
	DROPWIZARD: {
		title: 'Dropwizard',
		link: 'https://www.dropwizard.io/'
	},
	MICRONAUT: {
		title: 'Micronaut',
		link: 'https://micronaut.io/'
	},
	CASSANDRA: {
		title: 'Cassandra',
		link: 'https://cassandra.apache.org/'
	},
	POSTGRESQL: {
		title: 'PostgreSQL',
		link: 'https://www.postgresql.org/'
	},
	REDIS: {
		title: 'Redis',
		link: 'https://redis.io/'
	},
	REDIS_PUBSUB: {
		title: 'Redis Pub/Sub',
		link: 'https://redis.io/topics/pubsub'
	},
});

const UNIX_EPOCH = new Date(0);
export const YEARS_IN_IRELAND = new Date(new Date() - new Date(2015, 8, 1))
	.getUTCFullYear() - UNIX_EPOCH.getUTCFullYear();

export const ROBIN_AT_ROBINJ_DOT_BE = 'robin@robinj.be';
