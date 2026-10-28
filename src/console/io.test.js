import {describe, it, expect, vi} from 'vitest';
import {Abort, Input, Killed, Pipe, parseSignal, signalNumber, textInput} from './io';

describe('signals', () => {
	it('are named or numbered, with or without SIG', () => {
		expect(['-9', '9', 'KILL', '-SIGKILL', 'sigkill'].map(parseSignal)).toEqual(['KILL', 'KILL', 'KILL', 'KILL', 'KILL']);
		expect(parseSignal('0')).toBe('EXIT');
		expect(parseSignal('99')).toBeNull();
		expect(parseSignal('BOGUS')).toBeNull();
		expect(signalNumber('TERM')).toBe(15);
	});

	it('end a process with 128 plus their number', () => {
		const killed = new Killed('INT');

		expect([killed.signal, killed.status, killed.message]).toEqual(['INT', 130, 'INT']);
	});
});

describe('Abort', () => {
	it('passes an abort down to its children, once', () => {
		const parent = new Abort();
		const child = new Abort(parent);
		const listener = vi.fn();
		child.on(listener);

		parent.abort('first');
		parent.abort('second');
		expect(child.reason).toBe('first');
		expect(listener).toHaveBeenCalledTimes(1);
		expect(() => child.check()).toThrow('first');
	});

	it('tells late listeners straight away', () => {
		const abort = new Abort();
		abort.abort('done');
		const listener = vi.fn();

		abort.on(listener)();
		expect(listener).toHaveBeenCalledWith('done');
	});

	it('stops listening to its parent once disposed', () => {
		const parent = new Abort();
		const child = new Abort(parent);

		child.dispose();
		parent.abort('gone');
		expect(child.reason).toBeNull();
		expect(() => child.check()).not.toThrow();
	});

	it('races a promise, settling the way it does unless aborted first', async () => {
		const abort = new Abort();

		await expect(abort.race(Promise.resolve('value'))).resolves.toBe('value');
		await expect(abort.race(Promise.reject(new Error('failed')))).rejects.toThrow('failed');
		const pending = abort.race(new Promise(() => {}));
		abort.abort(new Killed('TERM'));
		await expect(pending).rejects.toThrow(Killed);
		expect(abort.listeners.size).toBe(0);
	});

	it('sleeps, unless aborted', async () => {
		vi.useFakeTimers();
		const abort = new Abort();
		let woke = false;

		abort.sleep(100).then(() => {
			woke = true;
		});
		await vi.advanceTimersByTimeAsync(100);
		expect(woke).toBe(true);
		const sleeping = abort.sleep(100);
		abort.abort(new Killed('INT'));
		await expect(sleeping).rejects.toThrow(Killed);
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	});
});

describe('Pipe', () => {
	it('hands written text to the reader, until closed', async () => {
		const pipe = new Pipe();

		const reading = pipe.read();
		pipe.write('a');
		pipe.write('');
		expect(await reading).toBe('a');
		pipe.write('b');
		pipe.write('c');
		expect(await pipe.read()).toBe('bc');
		pipe.close();
		expect(await pipe.read()).toBeNull();
	});

	it('breaks for writers once the reader hangs up', () => {
		const pipe = new Pipe();
		pipe.write('lost');
		pipe.hangUp();

		expect(pipe.chunks).toEqual([]);
		expect(() => pipe.write('more')).toThrow(Killed);
	});
});

describe('Input', () => {
	it('reads line by line, the last one possibly incomplete', async () => {
		const input = textInput('one\ntwo\nthree');
		const abort = new Abort();

		expect(await input.readLine(abort)).toEqual({line: 'one', complete: true});
		expect(await input.readAll(abort)).toBe('two\nthree');
		expect(await input.readLine(abort)).toBeNull();
		expect(await input.readLine(abort)).toBeNull();
	});

	it('keeps reading a terminal after it ends, as ^D only ends a read', async () => {
		const chunks = ['partial', null, 'more\n', null];
		const input = new Input({read: async () => chunks.shift()}, {tty: true});
		const abort = new Abort();

		expect(await input.readLine(abort)).toEqual({line: 'partial', complete: false});
		expect(await input.readLine(abort)).toEqual({line: 'more', complete: true});
		expect(await input.readLine(abort)).toBeNull();
		expect(input.ended).toBe(false);
	});
});
