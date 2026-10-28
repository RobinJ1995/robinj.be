import {describe, it, expect} from 'vitest';
import {createFs, displayPath, modeString, normalize, sizeOf} from './fs';

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
		expect(fs.read('/etc/shadow')).toEqual({error: 'Permission denied'});
		expect(fs.read('/etc/shadow', 'root').text).toMatch(/^root:!locked:/);
		expect(fs.read('/etc')).toEqual({error: 'Is a directory'});
	});

	it('says why each write would fail, except to a device', () => {
		expect(fs.writeError('/dev/null')).toBeNull();
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
