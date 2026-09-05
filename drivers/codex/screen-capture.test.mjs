import test from 'node:test';
import assert from 'node:assert/strict';
import { printScreen } from './print-screen.js';

test('a browser capture rejection without an Error still reaches the guarded fallback and stops tracks', async t => {
  const names = ['window', 'document', 'navigator', 'ImageCapture'];
  const original = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => names.forEach(name => original[name] ? Object.defineProperty(globalThis, name, original[name]) : delete globalThis[name]));
  let stopped = 0;
  const track = { getSettings: () => ({ width: 2, height: 2, displaySurface: 'browser' }), stop: () => stopped++ };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const values = {
    window: { innerWidth: 2, innerHeight: 2, devicePixelRatio: 1 },
    navigator: { mediaDevices: { getDisplayMedia: async () => stream } },
    ImageCapture: class { grabFrame() { return Promise.reject(undefined); } },
    document: { createElement: name => {
      assert.equal(name, 'video');
      return { videoWidth: 0, videoHeight: 0, play: async () => {}, pause() {},
        requestVideoFrameCallback: callback => queueMicrotask(callback) };
    } }
  };
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: values[name] });
  await assert.rejects(printScreen(), /shared screen has no usable image/);
  assert.equal(stopped, 1);
});
