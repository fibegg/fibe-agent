import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { stopChild } from './dev-child-shutdown.mjs';

function child(onSignal) {
  return Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    killed: false,
    signals: [],
    kill(signal) {
      this.killed = true;
      this.signals.push(signal);
      return onSignal?.(this, signal) ?? true;
    },
  });
}
test('a delivered TERM still escalates until actual exit', async () => {
  const process = child((process, signal) => {
    if (signal === 'SIGKILL') {
      process.signalCode = signal;
      process.emit('exit', null, signal);
    }
  });
  await stopChild(process, 10, 10);
  assert.deepEqual(process.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(process.listenerCount('exit'), 0);
});
test('listeners precede TERM and a synchronous exit settles once without KILL', async () => {
  const process = child((process) => {
    process.exitCode = 0;
    process.emit('exit', 0);
    process.emit('close', 0);
  });
  await stopChild(process, 10, 10);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(process.signals, ['SIGTERM']);
});
test('already exited children receive no signal; failed kills reject within the bound', async () => {
  const exited = child();
  exited.exitCode = 0;
  await stopChild(exited);
  assert.deepEqual(exited.signals, []);
  const stubborn = child(() => false);
  const first = stopChild(stubborn, 5, 5);
  assert.equal(stopChild(stubborn, 5, 5), first);
  await assert.rejects(first, /did not exit/);
  assert.deepEqual(stubborn.signals, ['SIGTERM', 'SIGKILL']);
});
