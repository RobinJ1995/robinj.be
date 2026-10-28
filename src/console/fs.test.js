import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest';
import {CHUNK, createFs, displayPath, modeString, normalize, sizeOf} from './fs';
import {listRepositories, resetRepositories} from './projects';

const fs = createFs({history: () => ['ls', 'pwd'], binaries: () => ['ls']});

describe('paths', () => {
	it('are made absolute and tidy without looking at the filesystem', () => {
		expect(normalize('/home/robin', '../x/./y//z/..')).toBe('/home/x/y');
		expect(normalize('/tmp', '~/a')).toBe('/home/robin/a');
		expect(normalize('/tmp', '/../..')).toBe('/');
		expect(displayPath('/home/robin/portfolio')).toBe('~/portfolio');
		expect(displayPath('/home/robinson')).toBe('/home/robinson');
	});
});

describe('the filesystem', () => {
	it('follows links, and stops at files and closed directories', () => {
		expect(fs.lookup('/bin/ls').path).toBe('/usr/bin/ls');
		expect(fs.lookup('/bin', {follow: false}).entry.type).toBe('link');
		expect(fs.lookup('/etc/passwd/x')).toEqual({error: 'Not a directory'});
		expect(fs.lookup('/root/x')).toEqual({error: 'Permission denied'});
		expect(fs.lookup('/root/x', {user: 'root'})).toEqual({error: 'No such file or directory'});
	});

	it('lists directories it may read', () => {
		expect(fs.list('/usr/bin')).toEqual({names: ['ls'], path: '/usr/bin'});
		expect(fs.list('/etc/passwd')).toEqual({error: 'Not a directory'});
		expect(fs.list('/root')).toEqual({error: 'Permission denied'});
		expect(fs.list('/root', 'root').names).toEqual([]);
	});

	it('reads files it may read, devices as empty', () => {
		expect(fs.read('/home/robin/.bash_history')).toEqual({text: 'ls\npwd\n'});
		expect(fs.read('/dev/null')).toEqual({text: ''});
		expect(fs.read('/dev/urandom')).toEqual({text: ''});
		expect(fs.read('/etc/shadow')).toEqual({error: 'Permission denied'});
		expect(fs.read('/etc/shadow', 'root').text).toMatch(/^root:!locked:/);
		expect(fs.read('/etc')).toEqual({error: 'Is a directory'});
	});

	it('says why each write would fail, except to a device', () => {
		expect(fs.writeError('/dev/null')).toBeNull();
		expect(fs.writeError('/dev/zero')).toBeNull();
		expect(fs.writeError('/etc')).toBe('Is a directory');
		expect(fs.writeError('/etc/passwd/x')).toBe('Not a directory');
		expect(fs.writeError('/root/x')).toBe('Permission denied');
		expect(fs.writeError('/nope/x')).toBe('No such file or directory');
		expect(fs.writeError('/tmp/new')).toBe('Read-only file system');
	});

	it('checks access by owner and mode', () => {
		expect(fs.access('/usr/bin/ls', 0o1)).toBeNull();
		expect(fs.access('/etc/passwd', 0o1)).toBe('Permission denied');
		expect(fs.access('/etc/passwd', 0o2)).toBe('Read-only file system');
		expect(fs.access('/dev/null', 0o2)).toBeNull();
		expect(fs.access('/home/robin', 0o4)).toBeNull();
		expect(fs.access('/home/robin', 0o4, 'bin')).toBe('Permission denied');
		expect(fs.access('/nope', 0o4)).toBe('No such file or directory');
	});
});

describe('entries', () => {
	it('show their mode as ls does', () => {
		expect(modeString({type: 'dir', mode: 0o1777})).toBe('drwxrwxrwt');
		expect(modeString({type: 'link', mode: 0o777})).toBe('lrwxrwxrwx');
		expect(modeString({type: 'char', mode: 0o666})).toBe('crw-rw-rw-');
		expect(modeString({type: 'file', mode: 0o640})).toBe('-rw-r-----');
	});

	it('have sizes: a block for directories, the target for links, the bytes for files', () => {
		expect(sizeOf(fs.lookup('/etc').entry)).toBe(4096);
		expect(sizeOf(fs.lookup('/bin', {follow: false}).entry)).toBe(7);
		expect(sizeOf(fs.lookup('/dev/null').entry)).toBe(0);
		expect(sizeOf(fs.lookup('/etc/hostname').entry)).toBe(10);
	});
});

describe('devices', () => {
	it('have their own numbers, and the endless ones make a chunk at a time', () => {
		const devices = ['null', 'random', 'urandom', 'zero'].map(name => fs.lookup(`/dev/${name}`).entry);

		expect(devices.map(entry => entry.device)).toEqual([[1, 3], [1, 8], [1, 9], [1, 5]]);
		expect(devices[0].stream).toBeUndefined();
		expect(devices[3].stream()).toBe('\0'.repeat(CHUNK));
		const random = devices[2].stream();
		expect(random.length).toBeGreaterThan(CHUNK / 2);
		expect(random).not.toBe(devices[1].stream());
	});
});

describe('the repository', () => {
	it('has a .git in ~/portfolio, owned by robin, with read-only packs and runnable hooks', () => {
		expect(fs.list('/home/robin/portfolio/.git').names).toEqual(['HEAD', 'config', 'description', 'hooks', 'index', 'info', 'logs', 'objects', 'packed-refs', 'refs', 'shallow']);
		expect(modeString(fs.lookup('/home/robin/portfolio/.git/hooks/update.sample').entry)).toBe('-rwxr-xr-x');
		expect(fs.list('/home/robin/portfolio/.git/objects/pack').names.map(name => modeString(fs.lookup(`/home/robin/portfolio/.git/objects/pack/${name}`).entry))).toEqual(Array(3).fill('-r--r--r--'));
		expect(fs.lookup('/home/robin/portfolio/.git/refs/tags').entry).toMatchObject({type: 'dir', owner: 'robin'});
	});

	it('is in /usr/sbin too, which is /usr/bin', () => {
		expect(fs.lookup('/usr/sbin/ls').path).toBe('/usr/bin/ls');
	});
});

describe('~/Projects', () => {
	beforeAll(() => {
		resetRepositories();
		vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, headers: new Headers(), json: async () => [{name: 'dotfiles', html_url: 'https://github.com/RobinJ1995/dotfiles'}]})));
	});

	afterAll(() => {
		vi.unstubAllGlobals();
		resetRepositories();
	});

	it('is empty until GitHub has listed it', () => {
		expect(fs.list('/home/robin/Projects')).toEqual({names: [], path: '/home/robin/Projects'});
	});

	it('has a link for each repository, its URL a path relative to the folder, so leading nowhere', async () => {
		await listRepositories();

		expect(fs.list('/home/robin/Projects').names).toEqual(['dotfiles']);
		expect(fs.lookup('/home/robin/Projects/dotfiles', {follow: false}).entry).toEqual({type: 'link', owner: 'robin', mode: 0o777, target: 'https://github.com/RobinJ1995/dotfiles'});
		expect(fs.lookup('/home/robin/Projects/dotfiles')).toEqual({error: 'No such file or directory'});
		expect(fs.lookup('/home/robin/Projects/dotfiles/README.md', {follow: false})).toEqual({error: 'No such file or directory'});
		expect(fs.read('/home/robin/Projects/dotfiles')).toEqual({error: 'No such file or directory'});
	});

	it('would be written where a link leads', async () => {
		await listRepositories();

		expect(fs.writeError('/home/robin/Projects/dotfiles')).toBe('No such file or directory');
		expect(fs.writeError('/bin')).toBe('Is a directory');
		expect(fs.writeError('/bin/new')).toBe('Read-only file system');
	});
});
