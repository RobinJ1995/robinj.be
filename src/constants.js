import Contact from './page/Contact';
import Projects from './page/Projects';
import CV from './page/CV';

export const PAGES = {
	CONTACT: {
		name: 'contact',
		url: '/contact',
		title: 'Contact',
		content: Contact,
		home: true,
	},
	CV: {
		name: 'cv',
		url: '/cv',
		title: 'CV',
		content: CV,
	},
	PROJECTS: {
		name: 'projects',
		url: '/projects',
		title: 'Projects',
		content: Projects,
	},
};

export const TECHNOLOGIES = {
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
	NODE_JS: {
		title: 'Node.js',
		link: 'https://nodejs.org/'
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
};
